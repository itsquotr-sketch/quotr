import {
  DEFAULT_TARGET_MARGIN_PERCENT,
  PLACEHOLDER_BASE_RANGES,
  type QuickEstimateBudgetFit,
} from "@/lib/constants/quick-estimate";
import { applyConstraintsToCentral } from "@/lib/cost-engine/apply-constraints";
import { applyQualityLevelToCentral } from "@/lib/cost-engine/apply-quality-level";
import { constraintSlugsSuppressedByAllowanceKey } from "@/lib/assistant-v2/intent/allowance-keys";
import { buildMissingInformation } from "@/lib/cost-engine/build-missing-information";
import {
  evaluateConfidence,
  buildQualityFactorsFromEvaluation,
} from "@/lib/assistant-v2/confidence/evaluate-confidence";
import {
  confidenceLevelLabel,
  resolveConfidenceLevel,
  toLegacyConfidenceLevel,
} from "@/lib/cost-engine/confidence/level";
import { buildCostBreakdown } from "@/lib/cost-engine/build-cost-breakdown";
import { buildEstimateTrace } from "@/lib/cost-engine/build-estimate-trace";
import { createEmptyTrace, type WorkAreaEstimateTrace } from "@/lib/cost-engine/estimate-trace";
import { buildScopeTrace } from "@/lib/cost-engine/trace/build-scope-trace";
import { buildTotalTrace } from "@/lib/cost-engine/trace/build-total-trace";
import {
  createEmptyEstimateTrace,
  type EstimateTrace as CalculationTrace,
} from "@/lib/cost-engine/trace/types";
import { isSiteConstraintsAssessed } from "@/lib/cost-engine/estimate-quality";
import type { EstimateTraceDriver } from "@/lib/cost-engine/trace/types";
import type { EstimateComponent } from "@/lib/cost-engine/estimate-components";
import {
  getScopeRateDefinition,
  getScopeRateDefinitionByKey,
} from "@/lib/constants/scope-rates";
import {
  isBenchmarkRateSource,
  primaryRateSource,
  rateSourceLabel,
  type RateSource,
} from "@/lib/cost-engine/rates/get-base-rate-for-scope";
import type { ScopeRateAllocation } from "@/lib/cost-engine/rates/scope-rate-utils";
import {
  buildRange,
  getRangeFactor,
} from "@/lib/cost-engine/range-builder";
import {
  computeRangeWidthPercent,
  resolveRangeQuality,
} from "@/lib/cost-engine/range-quality";
import { resolveEffectiveQualityLevel } from "@/lib/cost-engine/resolve-quality-level";
import { buildRangeDrivers } from "@/lib/cost-engine/tighten-suggestions";
import { hasPositiveAnswer } from "@/lib/scope-answer-state";
import {
  type QuickEstimateInput,
  type QuickEstimateOutput,
  type UnpricedWorkArea,
} from "@/lib/cost-engine/quick-estimate-input";
import { getIncludedTradesForWorkAreas } from "@/lib/project-assistant-trades";
import { calculateFromTemplate } from "@/lib/scope-templates/calculate";
import { getScopeTemplateByWorkAreaType } from "@/lib/scope-templates";
import { resolveStagedRateDetail } from "@/lib/cost-engine/resolve-staged-rate-detail";
import { getScopeByWorkAreaType } from "@/lib/scopes";
import {
  buildScopeCacheFromResults,
  buildScopeInputHash,
  isScopeCacheValid,
  type CachedScopeContribution,
  type ScopeEstimateCache,
} from "@/lib/cost-engine/cache/scope-estimate-cache";
import { resolveScopePricingState } from "@/lib/scopes/pricing-state";
import { buildPartialEstimateExclusionMessage } from "@/lib/assistant-v2/stages/required-fact-gating";

const DEFAULT_CONTINGENCY_PERCENT = 5;

function deriveBudgetFit(
  clientBudget: number | null,
  sellLow: number | null,
  sellHigh: number | null
): QuickEstimateBudgetFit {
  if (clientBudget == null || sellLow == null || sellHigh == null) {
    return "unknown";
  }
  if (clientBudget < sellLow) return "below_budget";
  if (clientBudget <= sellHigh) return "within_budget";
  return "above_budget";
}

type AreaCalcResult = {
  centralEstimate: number;
  quantity: number;
  unit: string;
  baseRate: number;
  rateSource: RateSource;
  /** True when finish level was baked into template/regional rate selection. */
  finishEncodedInRate: boolean;
  usedPackage: boolean;
  inputs: string[];
  allowances: string[];
  assumptions: string[];
  templateKey?: string;
  scopeTypeKey?: string;
  scopeRateId?: string;
  usesDefaultRateOnly?: boolean;
  scopeAllocation?: ScopeRateAllocation | null;
  allocationBreakdown?: WorkAreaEstimateTrace["allocationBreakdown"];
  traceDrivers?: EstimateTraceDriver[];
  estimateComponents?: EstimateComponent[];
};

function calcGenericArea(name: string): AreaCalcResult {
  const base = PLACEHOLDER_BASE_RANGES.other;
  return {
    centralEstimate: Math.round((base.low + base.high) / 2),
    quantity: 0,
    unit: "each",
    baseRate: 0,
    rateSource: "placeholder",
    finishEncodedInRate: false,
    usedPackage: false,
    inputs: [`${name} (generic)`],
    allowances: [`Generic allowance for ${name}`],
    assumptions: [],
    traceDrivers: [],
  };
}

function hasKeyMeasurementsForArea(
  workAreaTypeKey: string,
  answers: Record<string, string>
): boolean {
  const scope = getScopeByWorkAreaType(workAreaTypeKey);
  if (scope) {
    return scope.confidenceRules.measurementFactKeys.every((key) => {
      const fact =
        scope.requiredFacts.find((f) => f.key === key) ??
        scope.optionalFacts.find((f) => f.key === key);
      if (fact?.type === "number") {
        return hasPositiveAnswer(answers, key);
      }
      const value = answers[key];
      return Boolean(value && value !== "unknown");
    });
  }
  const template = getScopeTemplateByWorkAreaType(workAreaTypeKey);
  if (template) {
    return template.estimateRules.requiredFactKeys.every((key) =>
      hasPositiveAnswer(answers, key)
    );
  }
  return true;
}

export function calculateQuickEstimateV1(
  input: QuickEstimateInput
): QuickEstimateOutput {
  const targetMarginPercent =
    input.targetMarginPercent ?? DEFAULT_TARGET_MARGIN_PERCENT;
  const contingencyPercent =
    input.contingencyPercent ?? DEFAULT_CONTINGENCY_PERCENT;
  const workAreaTypes = input.workAreas.map((w) => w.workAreaTypeKey);
  const includedTrades = getIncludedTradesForWorkAreas(workAreaTypes);

  const effectiveQualityLevel = resolveEffectiveQualityLevel(
    input.quickEstimate.quality_level,
    input.workAreas,
    input.discovery
  );

  const orgRates = {
    scopeRates: input.scopeRates,
    labourRates: input.labourRates,
    materialRates: input.materialRates,
    subcontractorRates: input.subcontractorRates,
    packageRates: input.packageRates,
  };

  if (input.workAreas.length === 0) {
    return {
      canCalculate: false,
      estimateStatus: "failed",
      reason: input.allWorkAreasExcluded
        ? "No work areas are currently included in the quick estimate."
        : "Confirm at least one work area to generate a quick estimate.",
      estimatedCostLow: null,
      estimatedCostHigh: null,
      estimatedCostTypical: null,
      centralEstimate: null,
      recommendedSellLow: null,
      recommendedSellHigh: null,
      targetMarginPercent,
      contingencyPercent,
      expectedMarginPercent: null,
      confidenceLevel: "low",
      confidenceScore: 0,
      confidenceLevelLabel: "Very Low",
      confidenceReasons: [],
      questionsToHigh: 3,
      budgetFit: "unknown",
      includedTrades,
      inputsUsed: [],
      allowances: [],
      assumptions: [],
      risks: ["Draft estimate only — not quote-ready without detailed take-off"],
      missingInformation: ["No confirmed work areas"],
      constraintsApplied: [],
      qualityLevel: "unknown",
      qualityLevelNote: "Finish level unknown — estimate range kept wider.",
      ratesSource: "fallback",
      rateSourceDetail: "Rough placeholder",
      stagedRateLevel: 0,
      stagedRatePrompt: "Add more rates to make this estimate more accurate.",
      rateSourceLines: [],
      benchmarkScopesForOnboarding: [],
      usedPackageRates: false,
      templatesUsed: [],
      keyFactsUsed: [],
      confidenceReason: null,
      rangeQuality: "rough",
      rangeQualityLabel: "Rough",
      rangeQualityReason: "No confirmed work areas.",
      rangeWidthPercent: null,
      rangeFactor: null,
      tightenSuggestions: [],
      rangeLowDrivers: [],
      rangeHighDrivers: [],
      qualityFactors: [],
      estimateTrace: createEmptyTrace(),
      calculationTrace: createEmptyEstimateTrace(
        input.project.id,
        input.organisationId
      ),
      rangeChangedMessage: null,
    };
  }

  const pricedWorkAreas: typeof input.workAreas = [];
  const unpricedWorkAreas: UnpricedWorkArea[] = [];

  for (const area of input.workAreas) {
    const pricingState = resolveScopePricingState({
      workAreaTypeKey: area.workAreaTypeKey,
      scopeName: area.name,
      answers: area.answers,
      qualityLevel: input.quickEstimate.quality_level,
    });

    if (pricingState.canIncludeInEstimate) {
      pricedWorkAreas.push(area);
    } else {
      unpricedWorkAreas.push({
        name: area.name,
        workAreaTypeKey: area.workAreaTypeKey,
        reason: pricingState.message,
      });
    }
  }

  if (pricedWorkAreas.length === 0) {
    const onlyCustom = unpricedWorkAreas.every(
      (area) =>
        area.workAreaTypeKey.toLowerCase().includes("custom") ||
        area.reason.toLowerCase().includes("custom")
    );

    return {
      canCalculate: false,
      estimateStatus: "failed",
      reason: onlyCustom
        ? "Custom scope is not priced yet."
        : unpricedWorkAreas.length === 1
          ? unpricedWorkAreas[0]!.reason
          : "No priced work areas yet.",
      unpricedWorkAreas,
      estimatedCostLow: null,
      estimatedCostHigh: null,
      estimatedCostTypical: null,
      centralEstimate: null,
      recommendedSellLow: null,
      recommendedSellHigh: null,
      targetMarginPercent,
      contingencyPercent,
      expectedMarginPercent: null,
      confidenceLevel: "low",
      confidenceScore: 0,
      confidenceLevelLabel: "Very Low",
      confidenceReasons: [],
      questionsToHigh: 3,
      budgetFit: "unknown",
      includedTrades,
      inputsUsed: [],
      allowances: [],
      assumptions: [],
      risks: ["Draft estimate only — not quote-ready without detailed take-off"],
      missingInformation: unpricedWorkAreas.map(
        (area) => `${area.name} not included in estimate yet`
      ),
      constraintsApplied: [],
      qualityLevel: "unknown",
      qualityLevelNote: "Finish level unknown — estimate range kept wider.",
      ratesSource: "fallback",
      rateSourceDetail: "Rough placeholder",
      stagedRateLevel: 0,
      stagedRatePrompt: "Add more rates to make this estimate more accurate.",
      rateSourceLines: [],
      benchmarkScopesForOnboarding: [],
      usedPackageRates: false,
      templatesUsed: [],
      keyFactsUsed: [],
      confidenceReason: null,
      rangeQuality: "rough",
      rangeQualityLabel: "Rough",
      rangeQualityReason: "No priced work areas.",
      rangeWidthPercent: null,
      rangeFactor: null,
      tightenSuggestions: [],
      rangeLowDrivers: [],
      rangeHighDrivers: [],
      qualityFactors: [],
      estimateTrace: createEmptyTrace(),
      calculationTrace: createEmptyEstimateTrace(
        input.project.id,
        input.organisationId
      ),
      rangeChangedMessage: null,
    };
  }

  const isPartialEstimate = unpricedWorkAreas.length > 0;

  let centralEstimate = 0;
  let usedPackageRates = false;
  const inputsUsed: string[] = [];
  const allowances: string[] = [];
  const assumptions: string[] = [];
  const templatesUsed: string[] = [];
  const keyFactsUsed: string[] = [];
  const rateSources: RateSource[] = [];
  const allAnswers: Record<string, string> = {};
  const areaResults: AreaCalcResult[] = [];
  const areaBreakdownInputs: {
    name: string;
    workAreaTypeKey: string;
    centralEstimate: number;
  }[] = [];
  const scopeCacheContributions: CachedScopeContribution[] = [];
  const scopeCache = input.scopeEstimateCache;
  const pricingVersion = input.pricingContextVersion ?? 0;

  for (const area of pricedWorkAreas) {
    Object.assign(allAnswers, area.answers);
    const inputHash = buildScopeInputHash({
      area,
      constraints: input.constraints,
      qualityLevel: effectiveQualityLevel,
      pricingContextVersion: pricingVersion,
      targetMarginPercent,
      contingencyPercent,
    });

    const cachedScope = scopeCache?.scopes?.[area.scopeId];
    if (isScopeCacheValid(cachedScope, inputHash) && cachedScope?.areaResult) {
      const result = cachedScope.areaResult as unknown as AreaCalcResult;
      centralEstimate += cachedScope.centralEstimate;
      if (result.usedPackage) usedPackageRates = true;
      areaResults.push(result);
      areaBreakdownInputs.push({
        name: area.name,
        workAreaTypeKey: area.workAreaTypeKey,
        centralEstimate: cachedScope.centralEstimate,
      });
      inputsUsed.push(...result.inputs.map((i) => `${area.name}: ${i}`));
      allowances.push(...result.allowances);
      assumptions.push(
        result.templateKey
          ? `${area.name} scoped using ${result.templateKey} template — subject to site check`
          : `${area.name} scoped as ${area.workAreaTypeKey} — subject to site check`
      );
      rateSources.push(result.rateSource);
      if (result.templateKey) templatesUsed.push(result.templateKey);
      scopeCacheContributions.push(cachedScope);
      continue;
    }

    const template = getScopeTemplateByWorkAreaType(area.workAreaTypeKey);

    let result: AreaCalcResult;

    if (template) {
      const calc = calculateFromTemplate(
        template,
        area.answers,
        orgRates,
        effectiveQualityLevel
      );
      result = {
        centralEstimate: calc.centralEstimate,
        quantity: calc.quantity,
        unit: calc.unit,
        baseRate: calc.baseRate,
        rateSource: calc.rateSource,
        finishEncodedInRate: calc.finishEncodedInRate,
        usedPackage: calc.usedPackage,
        inputs: calc.inputs,
        allowances: calc.allowances,
        assumptions: calc.assumptions,
        templateKey: calc.templateKey,
        scopeTypeKey: calc.scopeTypeKey,
        scopeRateId: calc.scopeRateId,
        usesDefaultRateOnly: calc.usesDefaultRateOnly,
        scopeAllocation: calc.scopeAllocation,
        allocationBreakdown: calc.allocationBreakdown,
        traceDrivers: calc.traceDrivers,
        estimateComponents: calc.estimateComponents,
      };
      templatesUsed.push(template.key);
      rateSources.push(calc.rateSource);
      for (const inputLine of calc.inputs) {
        if (inputLine.includes("× $")) {
          keyFactsUsed.push(`${area.name}: ${inputLine}`);
        }
      }
    } else {
      result = calcGenericArea(area.name);
      rateSources.push("placeholder");
    }

    centralEstimate += result.centralEstimate;
    if (result.usedPackage) usedPackageRates = true;
    areaResults.push(result);
    areaBreakdownInputs.push({
      name: area.name,
      workAreaTypeKey: area.workAreaTypeKey,
      centralEstimate: result.centralEstimate,
    });
    inputsUsed.push(...result.inputs.map((i) => `${area.name}: ${i}`));
    allowances.push(...result.allowances);
    assumptions.push(
      result.templateKey
        ? `${area.name} scoped using ${result.templateKey} template — subject to site check`
        : `${area.name} scoped as ${area.workAreaTypeKey} — subject to site check`
    );

    scopeCacheContributions.push({
      scopeId: area.scopeId,
      inputHash,
      centralEstimate: result.centralEstimate,
      areaResult: result as unknown as Record<string, unknown>,
      calculatedAt: new Date().toISOString(),
    });
  }

  const updatedScopeEstimateCache: ScopeEstimateCache = buildScopeCacheFromResults({
    pricingContext: {
      organisationId: input.organisationId,
      version: pricingVersion,
      loadedAt: new Date().toISOString(),
      pricingSettings: null,
      scopeRates: input.scopeRates,
      packageRates: input.packageRates,
      labourRates: input.labourRates,
      materialRates: input.materialRates,
      subcontractorRates: input.subcontractorRates,
    },
    globalHash: "",
    contributions: scopeCacheContributions,
    previousCache: scopeCache,
  });

  const suppressedConstraintSlugs = new Set<string>();
  for (const allowance of input.userAllowances ?? []) {
    for (const slug of constraintSlugsSuppressedByAllowanceKey(
      allowance.allowance_key
    )) {
      suppressedConstraintSlugs.add(slug);
    }
  }

  const activeConstraints = input.constraints.filter(
    (c) => !suppressedConstraintSlugs.has(c.slug)
  );

  const { centralEstimate: afterConstraints, constraintsApplied } =
    applyConstraintsToCentral(centralEstimate, activeConstraints, allAnswers);

  const userAllowanceRows = (input.userAllowances ?? []).filter(
    (a) => a.is_active
  );
  const userAllowanceTotal = userAllowanceRows.reduce(
    (sum, row) => sum + Number(row.amount),
    0
  );

  for (const row of userAllowanceRows) {
    allowances.push(
      `${row.label}: $${Number(row.amount).toLocaleString("en-NZ")} (user allowance)`
    );
  }

  // Quality model: template_benchmark selects low/typical/high per finish level inside
  // getBaseRateForScope — skip the global finish multiplier when any work area already
  // encoded finish in its rate. Org/package rates do NOT encode finish, so multiplier
  // still applies for those areas only via the blended central (acceptable approximation).
  const finishAlreadyInRates =
    effectiveQualityLevel !== "unknown" &&
    areaResults.some((area) => area.finishEncodedInRate);

  const qualityAdjustment = finishAlreadyInRates
    ? {
        centralEstimate: afterConstraints,
        assumptions:
          effectiveQualityLevel === "standard"
            ? ["Standard / mid-range finish assumed."]
            : effectiveQualityLevel === "budget"
              ? [
                  "Budget / basic finish — lower specification materials and allowances assumed.",
                ]
              : effectiveQualityLevel === "premium"
                ? [
                    "Premium / high-end finish — higher specification materials assumed.",
                  ]
                : [],
        missingInformation: [] as string[],
        qualityNote: `${effectiveQualityLevel.charAt(0).toUpperCase()}${effectiveQualityLevel.slice(1)} finish selected.`,
      }
    : applyQualityLevelToCentral(afterConstraints, effectiveQualityLevel);
  const baseCost = qualityAdjustment.centralEstimate + userAllowanceTotal;

  const measuredAreaCount = pricedWorkAreas.filter((area) =>
    hasKeyMeasurementsForArea(area.workAreaTypeKey, area.answers)
  ).length;
  const measurementFraction =
    pricedWorkAreas.length > 0
      ? measuredAreaCount / pricedWorkAreas.length
      : 0;
  const hasKeyMeasurements = measurementFraction >= 1;

  const clientBudget = input.quickEstimate.client_budget
    ? Number(input.quickEstimate.client_budget)
    : null;

  const hasCustomScope =
    unpricedWorkAreas.some((area) =>
      area.workAreaTypeKey.toLowerCase().includes("custom")
    ) ||
    pricedWorkAreas.some(
      (area) =>
        !getScopeTemplateByWorkAreaType(area.workAreaTypeKey) ||
        area.workAreaTypeKey.toLowerCase().includes("custom")
    );

  const siteConstraintsAssessed = isSiteConstraintsAssessed({
    constraintsAssessed: input.siteConstraintsAssessed,
    constraintCount: input.constraints.length,
    answeredQuestionKeys: input.answeredQuestionKeys,
  });

  const primarySource = primaryRateSource(rateSources);

  const rateSourceLines = pricedWorkAreas.map((area, index) => {
    const result = areaResults[index];
    const scopeDef =
      getScopeRateDefinitionByKey(result?.scopeTypeKey ?? "") ??
      getScopeRateDefinition(area.workAreaTypeKey);
    const scopeLabel = scopeDef?.label ?? area.name;
    return {
      workAreaName: area.name,
      workAreaTypeKey: area.workAreaTypeKey,
      scopeTypeKey: result?.scopeTypeKey ?? scopeDef?.scopeTypeKey ?? "",
      label: scopeLabel,
      rateSource: result?.rateSource ?? "placeholder",
      rateSourceLabel: rateSourceLabel(result?.rateSource ?? "placeholder", {
        scopeLabel,
        usesDefaultRateOnly: result?.usesDefaultRateOnly,
        roughAllowance: area.workAreaTypeKey === "Kitchen renovation",
      }),
    };
  });

  const confidenceEvaluation = evaluateConfidence({
    workAreas: pricedWorkAreas.map((area) => ({
      scopeId: area.scopeId,
      scopeName: area.name,
      workAreaTypeKey: area.workAreaTypeKey,
      answers: area.answers,
      included: true,
    })),
    qualityLevel: effectiveQualityLevel,
    siteConstraintsAssessed,
    rateSourceLines,
  });

  const engineConfidenceScore = confidenceEvaluation.overallScore;
  const questionsToHigh = Math.max(
    0,
    Math.ceil((90 - engineConfidenceScore) / 15)
  );

  const rangeFactor = getRangeFactor(
    engineConfidenceScore,
    hasCustomScope && engineConfidenceScore < 25
  );

  const [costLow, costHigh] = buildRange(baseCost, engineConfidenceScore, {
    isAdvisoryOnly: hasCustomScope,
  });

  const costMultiplier = 1 + contingencyPercent / 100;
  const sellMultiplier = costMultiplier * (1 + targetMarginPercent / 100);

  const recommendedSellLow = Math.round(costLow * sellMultiplier);
  const recommendedSellHigh = Math.round(costHigh * sellMultiplier);

  const confidenceLevel = toLegacyConfidenceLevel(engineConfidenceScore);

  const rangeWidthPercent = computeRangeWidthPercent(costLow, costHigh, baseCost);

  const rangeQualityResult = resolveRangeQuality({
    confidenceLevel,
    hasKeyMeasurements,
    qualityLevel: effectiveQualityLevel,
    usedPackageRates:
      primarySource === "scope_rate" ||
      primarySource === "org_rate" ||
      primarySource === "package_rate",
    constraintsReviewed: siteConstraintsAssessed,
    rangeWidthPercent,
  });

  const missingInformation = [
    ...buildMissingInformation({
      workAreas: pricedWorkAreas,
      effectiveQualityLevel,
    }),
    ...unpricedWorkAreas.map((area) =>
      buildPartialEstimateExclusionMessage(
        area.name,
        area.workAreaTypeKey,
        input.workAreas.find((w) => w.name === area.name)?.answers ?? {},
        area.reason.toLowerCase().includes("pricing support")
      )
    ),
  ];

  const rangeDrivers = buildRangeDrivers({
    scopeQuestions: input.scopeQuestions,
    constraintsApplied,
    qualityLevelNote: qualityAdjustment.qualityNote,
    workAreaAnswers: pricedWorkAreas.map((area) => ({
      workAreaTypeKey: area.workAreaTypeKey,
      workAreaName: area.name,
      answers: area.answers,
    })),
  });

  const ratesSource: QuickEstimateOutput["ratesSource"] =
    primarySource === "scope_rate" ||
    primarySource === "org_rate" ||
    primarySource === "package_rate"
      ? "saved"
      : "fallback";

  const benchmarkScopeKeysSeen = new Set<string>();
  const benchmarkScopesForOnboarding = rateSourceLines
    .filter((line) => isBenchmarkRateSource(line.rateSource) && line.scopeTypeKey)
    .map((line) => {
      const def = getScopeRateDefinitionByKey(line.scopeTypeKey);
      if (!def) return null;
      return {
        scopeTypeKey: def.scopeTypeKey,
        label: def.label,
        workAreaTypeKey: def.workAreaTypeKey,
        unit: def.unit,
        benchmarkLow: def.benchmarkLow,
        benchmarkStandard: def.benchmarkStandard,
        benchmarkPremium: def.benchmarkPremium,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row != null)
    .filter((row) => {
      if (benchmarkScopeKeysSeen.has(row.scopeTypeKey)) return false;
      benchmarkScopeKeysSeen.add(row.scopeTypeKey);
      return true;
    });

  const primaryArea = areaResults[0];
  const finishTraceAdjustments = qualityAdjustment.assumptions.map((a) => ({
    label: a,
    effect: "Finish level adjustment",
  }));

  const qualityFactors = buildQualityFactorsFromEvaluation(confidenceEvaluation);

  const scaledAreaBreakdown = areaBreakdownInputs.map((area, index) => ({
    ...area,
    centralEstimate:
      baseCost > 0 && centralEstimate > 0
        ? Math.round((area.centralEstimate / centralEstimate) * baseCost)
        : area.centralEstimate,
    scopeAllocation: areaResults[index]?.scopeAllocation,
  }));

  const costBreakdown = buildCostBreakdown({
    centralEstimate: baseCost,
    contingencyPercent,
    workAreas: scaledAreaBreakdown,
    userAllowances: userAllowanceRows.map((row) => ({
      label: row.label,
      amount: Number(row.amount),
    })),
  });

  const stagedRateDetail = resolveStagedRateDetail({
    rateSourceLines,
    scopeRates: input.scopeRates,
    labourRates: input.labourRates,
    materialRates: input.materialRates,
  });

  const workAreaTraces: WorkAreaEstimateTrace[] = pricedWorkAreas.map(
    (area, index) => {
      const result = areaResults[index];
      const scaledCentral =
        scaledAreaBreakdown[index]?.centralEstimate ?? result.centralEstimate;
      return {
        scopeTypeKey: result.scopeTypeKey ?? result.templateKey ?? "generic",
        workAreaName: area.name,
        workAreaTypeKey: area.workAreaTypeKey,
        quantity: result.quantity,
        unit: result.unit,
        rate: result.baseRate,
        rateSource: result.rateSource,
        finishLevel: effectiveQualityLevel,
        centralEstimate: scaledCentral,
        allocationBreakdown: result.allocationBreakdown,
        assumptions: result.assumptions,
      };
    }
  );

  const scopeAllowances: Record<string, string[]> = {};
  const scopeAssumptions: Record<string, string[]> = {};
  const scopeEstimateComponents: Record<string, EstimateComponent[]> = {};
  for (let i = 0; i < pricedWorkAreas.length; i++) {
    const area = pricedWorkAreas[i];
    const result = areaResults[i];
    scopeAllowances[area.name] = result.allowances;
    scopeAssumptions[area.name] = result.assumptions;
    if (result.estimateComponents?.length) {
      scopeEstimateComponents[area.name] = result.estimateComponents;
    }
  }

  const estimateTrace = buildEstimateTrace({
    workAreas: pricedWorkAreas,
    scopeKey: primaryArea?.templateKey ?? "generic",
    quantity: primaryArea?.quantity ?? 0,
    unit: primaryArea?.unit ?? "each",
    baseRate: primaryArea?.baseRate ?? 0,
    rateSource: primarySource,
    centralEstimate: baseCost,
    baseDescription:
      inputsUsed.find((line) => line.includes("× $")) ?? inputsUsed[0] ?? "",
    constraintLabels: constraintsApplied,
    finishAdjustments: finishTraceAdjustments,
    contingencyPercent,
    marginPercent: targetMarginPercent,
    confidenceScore: engineConfidenceScore,
    rangeFactor,
    costLow,
    costHigh,
    sellLow: recommendedSellLow,
    sellHigh: recommendedSellHigh,
    missingCriticalFacts: missingInformation.slice(0, 5),
    finishLevel: effectiveQualityLevel,
    costBreakdown,
    workAreaTraces,
    rangeQuality: rangeQualityResult.level,
    scopeAllowances,
    scopeAssumptions,
    scopeEstimateComponents,
  });

  const scopeTraces = pricedWorkAreas.map((area, index) => {
    const result = areaResults[index];
    const scaledCentral =
      scaledAreaBreakdown[index]?.centralEstimate ?? result.centralEstimate;
    return buildScopeTrace({
      workArea: area,
      scopeTypeKey: result.scopeTypeKey ?? result.templateKey ?? "generic",
      templateKey: result.templateKey,
      quantity: result.quantity,
      unit: result.unit,
      baseRate: result.baseRate,
      rateSource: result.rateSource,
      usesDefaultRateOnly: result.usesDefaultRateOnly,
      centralEstimate: result.centralEstimate,
      scaledCentral,
      effectiveQualityLevel,
      confidenceScore: engineConfidenceScore,
      contingencyPercent,
      marginPercent: targetMarginPercent,
      inputs: result.inputs,
      allowances: result.allowances,
      assumptions: result.assumptions,
      traceDrivers: result.traceDrivers,
      costBreakdown,
      estimateComponents: result.estimateComponents,
    });
  });

  const calculationTrace: CalculationTrace = buildTotalTrace({
    projectId: input.project.id,
    organisationId: input.organisationId,
    scopeTraces,
    costCentral: baseCost,
    costLow,
    costHigh,
    sellLow: recommendedSellLow,
    sellHigh: recommendedSellHigh,
    marginPercent: targetMarginPercent,
    contingencyPercent,
    rangeQuality: rangeQualityResult.level,
    rangeWidthPercent,
    confidenceScore: engineConfidenceScore,
    confidenceReasons: confidenceEvaluation.scopes.flatMap((s) => s.confirmed),
    tightenSuggestions: rangeDrivers.tightenSuggestions,
    constraintsApplied,
    qualityAdjustmentAssumptions: qualityAdjustment.assumptions,
    effectiveQualityLevel,
    userAllowances: userAllowanceRows,
    missingInformation,
  });

  const tightenMessage = confidenceEvaluation.nextBestProjectAction;

  return {
    canCalculate: true,
    estimateStatus: isPartialEstimate ? "partial" : "ready",
    unpricedWorkAreas: isPartialEstimate ? unpricedWorkAreas : undefined,
    estimatedCostLow: costLow,
    estimatedCostHigh: costHigh,
    estimatedCostTypical: baseCost,
    centralEstimate: baseCost,
    recommendedSellLow,
    recommendedSellHigh,
    targetMarginPercent,
    contingencyPercent,
    expectedMarginPercent: targetMarginPercent,
    confidenceLevel,
    confidenceScore: engineConfidenceScore,
    confidenceLevelLabel: confidenceLevelLabel(
      resolveConfidenceLevel(engineConfidenceScore)
    ),
    confidenceReasons: confidenceEvaluation.scopes.flatMap((s) => s.confirmed),
    questionsToHigh,
    budgetFit: deriveBudgetFit(
      clientBudget,
      recommendedSellLow,
      recommendedSellHigh
    ),
    includedTrades,
    inputsUsed,
    allowances,
    assumptions: [...assumptions, ...qualityAdjustment.assumptions],
    risks: [
      "Draft estimate only — not quote-ready without detailed take-off",
      ...(missingInformation.length > 0
        ? ["Key gaps remain — estimate may change after site check"]
        : []),
    ],
    missingInformation,
    constraintsApplied,
    qualityLevel: effectiveQualityLevel,
    qualityLevelNote: qualityAdjustment.qualityNote,
    ratesSource,
    rateSourceDetail: stagedRateDetail.label,
    stagedRateLevel: stagedRateDetail.level,
    stagedRatePrompt: stagedRateDetail.prompt,
    rateSourceLines,
    benchmarkScopesForOnboarding,
    usedPackageRates,
    templatesUsed: [...new Set(templatesUsed)],
    keyFactsUsed,
    confidenceReason: tightenMessage,
    rangeQuality: rangeQualityResult.level,
    rangeQualityLabel: rangeQualityResult.label,
    rangeQualityReason: `Range width ~${rangeWidthPercent ?? 0}% based on ${engineConfidenceScore}/100 confidence.`,
    rangeWidthPercent,
    rangeFactor,
    tightenSuggestions: rangeDrivers.tightenSuggestions,
    rangeLowDrivers: rangeDrivers.lowDrivers,
    rangeHighDrivers: rangeDrivers.highDrivers,
    qualityFactors,
    estimateTrace,
    calculationTrace,
    rangeChangedMessage: null,
    scopeEstimateCache: updatedScopeEstimateCache,
  };
}
