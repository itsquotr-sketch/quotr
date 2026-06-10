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
import { normaliseQualityLevel } from "@/lib/constants/quality-level";
import {
  type QuickEstimateInput,
  type QuickEstimateOutput,
} from "@/lib/cost-engine/quick-estimate-input";
import { getAnswerValue } from "@/lib/question-keys";
import { getIncludedTradesForWorkAreas } from "@/lib/project-assistant-trades";
import { calculateFromTemplate } from "@/lib/scope-templates/calculate";
import { getScopeTemplateByWorkAreaType } from "@/lib/scope-templates";
function parseNumber(value: string | undefined): number | null {
  if (!value?.trim()) return null;
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? num : null;
}

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
  missing: string[];
  inputs: string[];
  allowances: string[];
  templateKey?: string;
  confidenceReason?: string | null;
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
    missing: [`${name}: using generic allowance`],
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
      Boolean(parseNumber(getAnswerValue(answers, key)))
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
    };
  }

  let costLow = 0;
  let costTypical = 0;
  let costHigh = 0;
  let usedPackageRates = false;
  const missingInformation: string[] = [];
  const inputsUsed: string[] = [];
  const allowances: string[] = [];
  const assumptions: string[] = [];
  const templatesUsed: string[] = [];
  const keyFactsUsed: string[] = [];
  const confidenceReasons: string[] = [];
  const allAnswers: Record<string, string> = {};

  for (const area of input.workAreas) {
    Object.assign(allAnswers, area.answers);
    const template = getScopeTemplateByWorkAreaType(area.workAreaTypeKey);

    let result: AreaCalcResult;

    if (template) {
      const calc = calculateFromTemplate(template, area.answers, input.packageRates);
      result = {
        band: calc.band,
        usedPackage: calc.usedPackage,
        missing: calc.missing,
        inputs: calc.inputs,
        allowances: calc.allowances,
        templateKey: calc.templateKey,
        confidenceReason: calc.confidenceReason,
      };
      templatesUsed.push(template.key);
      for (const inputLine of calc.inputs) {
        if (inputLine.includes("× $")) {
          keyFactsUsed.push(`${area.name}: ${inputLine}`);
        }
      }
      if (calc.confidenceReason) {
        confidenceReasons.push(calc.confidenceReason);
      }
    } else {
      result = calcGenericArea(area.name);
    }

    costLow += result.band.low;
    costTypical += result.band.typical;
    costHigh += result.band.high;
    if (result.usedPackage) usedPackageRates = true;
    missingInformation.push(...result.missing);
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

  const qualityLevel = normaliseQualityLevel(input.quickEstimate.quality_level);
  const qualityAdjustment = applyQualityLevelToBand(constrained, qualityLevel);
  const adjustedBand = qualityAdjustment.band;

  const clientBudget = input.quickEstimate.client_budget
    ? Number(input.quickEstimate.client_budget)
    : null;

  const hasKeyMeasurements = input.workAreas.every((area) =>
    hasKeyMeasurementsForArea(area.workAreaTypeKey, area.answers)
  );

  let confidenceLevel: QuickEstimateOutput["confidenceLevel"] = "low";
  if (hasKeyMeasurements && usedPackageRates) {
    confidenceLevel = "high";
  } else if (hasKeyMeasurements) {
    confidenceLevel = "medium";
  }
  confidenceLevel = adjustConfidenceForQualityLevel(
    confidenceLevel,
    qualityLevel,
    hasKeyMeasurements
  );

  const ratesSource: QuickEstimateOutput["ratesSource"] = usedPackageRates
    ? "saved"
    : "fallback";

  const recommendedSellLow = Math.round(adjustedBand.low * marginMultiplier);
  const recommendedSellHigh = Math.round(adjustedBand.high * marginMultiplier);

  const confidenceReason =
    confidenceReasons.length > 0
      ? confidenceReasons.join(" ")
      : hasKeyMeasurements
        ? "Key measurements provided for confirmed work areas."
        : "Missing key measurements — estimate range kept wider.";

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
        ? ["Missing key information — estimate may change significantly"]
        : []),
    ],
    missingInformation: [
      ...missingInformation,
      ...qualityAdjustment.missingInformation,
    ],
    constraintsApplied,
    qualityLevel,
    qualityLevelNote: qualityAdjustment.qualityNote,
    ratesSource,
    usedPackageRates,
    templatesUsed,
    keyFactsUsed,
    confidenceReason,
  };
}
