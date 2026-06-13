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
  computeConfidenceScore,
} from "@/lib/cost-engine/confidence/score";
import {
  confidenceLevelLabel,
  toLegacyConfidenceLevel,
} from "@/lib/cost-engine/confidence/level";
import { buildCostBreakdown } from "@/lib/cost-engine/build-cost-breakdown";
import { buildEstimateTrace } from "@/lib/cost-engine/build-estimate-trace";
import { createEmptyTrace } from "@/lib/cost-engine/estimate-trace";
import { isSiteConstraintsAssessed } from "@/lib/cost-engine/estimate-quality";
import type { WorkAreaEstimateTrace } from "@/lib/cost-engine/estimate-trace";
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
} from "@/lib/cost-engine/quick-estimate-input";
import { getIncludedTradesForWorkAreas } from "@/lib/project-assistant-trades";
import { calculateFromTemplate } from "@/lib/scope-templates/calculate";
import { getScopeTemplateByWorkAreaType } from "@/lib/scope-templates";
import { resolveStagedRateDetail } from "@/lib/cost-engine/resolve-staged-rate-detail";
import { getScopeByWorkAreaType } from "@/lib/scopes";

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
      rangeChangedMessage: null,
    };
  }

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

  for (const area of input.workAreas) {
    Object.assign(allAnswers, area.answers);
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
  }

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

  const measuredAreaCount = input.workAreas.filter((area) =>
    hasKeyMeasurementsForArea(area.workAreaTypeKey, area.answers)
  ).length;
  const measurementFraction =
    input.workAreas.length > 0
      ? measuredAreaCount / input.workAreas.length
      : 0;
  const hasKeyMeasurements = measurementFraction >= 1;

  const clientBudget = input.quickEstimate.client_budget
    ? Number(input.quickEstimate.client_budget)
    : null;

  const hasCustomScope = input.workAreas.some(
    (area) =>
      !getScopeTemplateByWorkAreaType(area.workAreaTypeKey) ||
      area.workAreaTypeKey.toLowerCase().includes("custom")
  );

  const siteConstraintsAssessed = isSiteConstraintsAssessed({
    constraintsAssessed: input.siteConstraintsAssessed,
    constraintCount: input.constraints.length,
    answeredQuestionKeys: input.answeredQuestionKeys,
  });

  const confidenceResult = computeConfidenceScore({
    workAreas: input.workAreas,
    qualityLevel: effectiveQualityLevel,
    rateSources,
    clientBudget,
    constraintsAssessed: siteConstraintsAssessed,
    discoveryNotesLength: input.discovery?.facts?.length
      ? input.sourceNotesLength
      : 0,
    hasCustomScope,
  });

  const primarySource = primaryRateSource(rateSources);
  const rangeFactor = getRangeFactor(
    confidenceResult.score,
    hasCustomScope && confidenceResult.score < 25
  );

  const [costLow, costHigh] = buildRange(baseCost, confidenceResult.score, {
    isAdvisoryOnly: hasCustomScope,
  });

  const costMultiplier = 1 + contingencyPercent / 100;
  const sellMultiplier = costMultiplier * (1 + targetMarginPercent / 100);

  const recommendedSellLow = Math.round(costLow * sellMultiplier);
  const recommendedSellHigh = Math.round(costHigh * sellMultiplier);

  const confidenceLevel = toLegacyConfidenceLevel(confidenceResult.score);

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

  const missingInformation = buildMissingInformation({
    workAreas: input.workAreas,
    effectiveQualityLevel,
  });

  const rangeDrivers = buildRangeDrivers({
    scopeQuestions: input.scopeQuestions,
    constraintsApplied,
    qualityLevelNote: qualityAdjustment.qualityNote,
    workAreaAnswers: input.workAreas.map((area) => ({
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

  const rateSourceLines = input.workAreas.map((area, index) => {
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
      }),
    };
  });

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

  const qualityFactors = confidenceResult.reasons.map((label) => ({
    label: label.replace(/^⚠ /, ""),
    met: !label.startsWith("⚠"),
  }));

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

  const workAreaTraces: WorkAreaEstimateTrace[] = input.workAreas.map(
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

  const estimateTrace = buildEstimateTrace({
    workAreas: input.workAreas,
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
    confidenceScore: confidenceResult.score,
    rangeFactor,
    costLow,
    costHigh,
    sellLow: recommendedSellLow,
    sellHigh: recommendedSellHigh,
    missingCriticalFacts: missingInformation.slice(0, 5),
    finishLevel: effectiveQualityLevel,
    costBreakdown,
    workAreaTraces,
  });

  const tightenMessage =
    confidenceResult.questionsToHigh > 0
      ? `Answer ${confidenceResult.questionsToHigh} more key question${confidenceResult.questionsToHigh === 1 ? "" : "s"} to reach High confidence.`
      : null;

  return {
    canCalculate: true,
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
    confidenceScore: confidenceResult.score,
    confidenceLevelLabel: confidenceLevelLabel(confidenceResult.level),
    confidenceReasons: confidenceResult.reasons,
    questionsToHigh: confidenceResult.questionsToHigh,
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
    rangeQualityReason: `Range width ~${rangeWidthPercent ?? 0}% based on ${confidenceResult.score}/100 confidence.`,
    rangeWidthPercent,
    rangeFactor,
    tightenSuggestions: rangeDrivers.tightenSuggestions,
    rangeLowDrivers: rangeDrivers.lowDrivers,
    rangeHighDrivers: rangeDrivers.highDrivers,
    qualityFactors,
    estimateTrace,
    rangeChangedMessage: null,
  };
}
