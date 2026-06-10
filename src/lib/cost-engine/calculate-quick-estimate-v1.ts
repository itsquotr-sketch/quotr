import {
  DEFAULT_TARGET_MARGIN_PERCENT,
  PLACEHOLDER_BASE_RANGES,
  type QuickEstimateBudgetFit,
} from "@/lib/constants/quick-estimate";
import { applyConstraintsToBand } from "@/lib/cost-engine/apply-constraints";
import {
  adjustConfidenceForQualityLevel,
  applyQualityLevelToBand,
} from "@/lib/cost-engine/apply-quality-level";
import { buildMissingInformation } from "@/lib/cost-engine/build-missing-information";
import {
  buildConfidenceReason,
  resolveConfidenceLevel,
} from "@/lib/cost-engine/build-confidence";
import {
  buildEstimateQualityFactors,
  isSiteConstraintsAssessed,
} from "@/lib/cost-engine/estimate-quality";
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

type CostBand = { low: number; typical: number; high: number };

type AreaCalcResult = {
  band: CostBand;
  usedPackage: boolean;
  inputs: string[];
  allowances: string[];
  templateKey?: string;
};

function calcGenericArea(name: string): AreaCalcResult {
  const base = PLACEHOLDER_BASE_RANGES.other;
  return {
    band: {
      low: base.low,
      typical: (base.low + base.high) / 2,
      high: base.high,
    },
    usedPackage: false,
    inputs: [`${name} (generic)`],
    allowances: [`Generic allowance for ${name}`],
  };
}

function hasKeyMeasurementsForArea(
  workAreaTypeKey: string,
  answers: Record<string, string>
): boolean {
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
  const marginMultiplier = 1 + targetMarginPercent / 100;
  const workAreaTypes = input.workAreas.map((w) => w.workAreaTypeKey);
  const includedTrades = getIncludedTradesForWorkAreas(workAreaTypes);

  const effectiveQualityLevel = resolveEffectiveQualityLevel(
    input.quickEstimate.quality_level,
    input.workAreas,
    input.discovery
  );

  if (input.workAreas.length === 0) {
    return {
      canCalculate: false,
      reason: "Confirm at least one work area to generate a quick estimate.",
      estimatedCostLow: null,
      estimatedCostHigh: null,
      estimatedCostTypical: null,
      recommendedSellLow: null,
      recommendedSellHigh: null,
      targetMarginPercent,
      expectedMarginPercent: null,
      confidenceLevel: "low",
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
      usedPackageRates: false,
      templatesUsed: [],
      keyFactsUsed: [],
      confidenceReason: null,
      rangeQuality: "rough",
      rangeQualityLabel: "Rough",
      rangeQualityReason: "No confirmed work areas.",
      rangeWidthPercent: null,
      tightenSuggestions: [],
      rangeLowDrivers: [],
      rangeHighDrivers: [],
      qualityFactors: buildEstimateQualityFactors({
        hasKeyMeasurements: false,
        workAreasConfirmed: false,
        qualityLevel: "unknown",
        siteConstraintsAssessed: false,
      }),
    };
  }

  let costLow = 0;
  let costTypical = 0;
  let costHigh = 0;
  let usedPackageRates = false;
  const inputsUsed: string[] = [];
  const allowances: string[] = [];
  const assumptions: string[] = [];
  const templatesUsed: string[] = [];
  const keyFactsUsed: string[] = [];
  const allAnswers: Record<string, string> = {};

  for (const area of input.workAreas) {
    Object.assign(allAnswers, area.answers);
    const template = getScopeTemplateByWorkAreaType(area.workAreaTypeKey);

    let result: AreaCalcResult;

    if (template) {
      const calc = calculateFromTemplate(
        template,
        area.answers,
        input.packageRates,
        effectiveQualityLevel
      );
      result = {
        band: calc.band,
        usedPackage: calc.usedPackage,
        inputs: calc.inputs,
        allowances: calc.allowances,
        templateKey: calc.templateKey,
      };
      templatesUsed.push(template.key);
      for (const inputLine of calc.inputs) {
        if (inputLine.includes("× $")) {
          keyFactsUsed.push(`${area.name}: ${inputLine}`);
        }
      }
    } else {
      result = calcGenericArea(area.name);
    }

    costLow += result.band.low;
    costTypical += result.band.typical;
    costHigh += result.band.high;
    if (result.usedPackage) usedPackageRates = true;
    inputsUsed.push(...result.inputs.map((i) => `${area.name}: ${i}`));
    allowances.push(...result.allowances);
    assumptions.push(
      result.templateKey
        ? `${area.name} scoped using ${result.templateKey} template — subject to site check`
        : `${area.name} scoped as ${area.workAreaTypeKey} — subject to site check`
    );
  }

  const { band: constrained, constraintsApplied } = applyConstraintsToBand(
    { low: costLow, typical: costTypical, high: costHigh },
    input.constraints,
    allAnswers
  );

  const qualityAdjustment = applyQualityLevelToBand(
    constrained,
    effectiveQualityLevel
  );
  let adjustedBand = qualityAdjustment.band;

  // System confidence overrides AI — AI cannot raise confidence above facts
  const hasKeyMeasurements = input.workAreas.every((area) =>
    hasKeyMeasurementsForArea(area.workAreaTypeKey, area.answers)
  );

  const aiConfidence = input.discovery?.confidence;
  if (
    aiConfidence != null &&
    aiConfidence < 0.5 &&
    !hasKeyMeasurements
  ) {
    adjustedBand = {
      low: Math.round(adjustedBand.low * 0.95),
      typical: adjustedBand.typical,
      high: Math.round(adjustedBand.high * 1.05),
    };
  }

  const clientBudget = input.quickEstimate.client_budget
    ? Number(input.quickEstimate.client_budget)
    : null;

  const hasCustomScope = input.workAreas.some(
    (area) =>
      !getScopeTemplateByWorkAreaType(area.workAreaTypeKey) ||
      area.workAreaTypeKey.toLowerCase().includes("custom")
  );

  const uniqueTemplates = [...new Set(templatesUsed)];

  const constraintsReviewed =
    input.quickEstimate.quality_level != null &&
    input.quickEstimate.quality_level !== "unknown";

  const confidenceInput = {
    hasKeyMeasurements,
    usedPackageRates,
    qualityLevel: effectiveQualityLevel,
    templatesUsed: uniqueTemplates,
    hasCustomScope,
    constraintsReviewed:
      constraintsReviewed || effectiveQualityLevel !== "unknown",
  };

  let confidenceLevel = resolveConfidenceLevel(confidenceInput);
  confidenceLevel = adjustConfidenceForQualityLevel(
    confidenceLevel,
    effectiveQualityLevel,
    hasKeyMeasurements
  );

  const ratesSource: QuickEstimateOutput["ratesSource"] = usedPackageRates
    ? "saved"
    : "fallback";

  const recommendedSellLow = Math.round(adjustedBand.low * marginMultiplier);
  const recommendedSellHigh = Math.round(adjustedBand.high * marginMultiplier);

  const confidenceReason = buildConfidenceReason(confidenceLevel, confidenceInput);

  const rangeWidthPercent = computeRangeWidthPercent(
    adjustedBand.low,
    adjustedBand.high,
    adjustedBand.typical
  );

  const rangeQualityResult = resolveRangeQuality({
    confidenceLevel,
    hasKeyMeasurements,
    qualityLevel: effectiveQualityLevel,
    usedPackageRates,
    constraintsReviewed: confidenceInput.constraintsReviewed,
    rangeWidthPercent,
  });

  const missingInformation = buildMissingInformation({
    workAreas: input.workAreas,
    scopeQuestions: input.scopeQuestions,
    effectiveQualityLevel,
  });

  const rangeDrivers = buildRangeDrivers({
    scopeQuestions: input.scopeQuestions,
    constraintsApplied,
    qualityLevelNote: qualityAdjustment.qualityNote,
  });

  const siteConstraintsAssessed = isSiteConstraintsAssessed({
    constraintCount: input.constraints.length,
    answeredQuestionKeys: input.answeredQuestionKeys,
  });

  const qualityFactors = buildEstimateQualityFactors({
    hasKeyMeasurements,
    workAreasConfirmed: input.workAreas.length > 0,
    qualityLevel: effectiveQualityLevel,
    siteConstraintsAssessed,
  });

  return {
    canCalculate: true,
    estimatedCostLow: adjustedBand.low,
    estimatedCostHigh: adjustedBand.high,
    estimatedCostTypical: adjustedBand.typical,
    recommendedSellLow,
    recommendedSellHigh,
    targetMarginPercent,
    expectedMarginPercent: targetMarginPercent,
    confidenceLevel,
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
    usedPackageRates,
    templatesUsed: uniqueTemplates,
    keyFactsUsed,
    confidenceReason,
    rangeQuality: rangeQualityResult.level,
    rangeQualityLabel: rangeQualityResult.label,
    rangeQualityReason: rangeQualityResult.reason,
    rangeWidthPercent,
    tightenSuggestions: rangeDrivers.tightenSuggestions,
    rangeLowDrivers: rangeDrivers.lowDrivers,
    rangeHighDrivers: rangeDrivers.highDrivers,
    qualityFactors,
  };
}
