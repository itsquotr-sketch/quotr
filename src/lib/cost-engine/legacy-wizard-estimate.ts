/**
 * Placeholder calculator for the standalone quick-estimate wizard flow.
 * Project Assistant uses calculateQuickEstimateV1 via the cost engine.
 */
import {
  DEFAULT_TARGET_MARGIN_PERCENT,
  PLACEHOLDER_BASE_RANGES,
  type QuickEstimateBudgetFit,
  type QuickEstimateConfidenceLevel,
} from "@/lib/constants/quick-estimate";
import type {
  EstimateDriver,
  QuickEstimateAnswer,
} from "@/types/database";

export interface QuickEstimateCalculationInput {
  workType: string | null;
  answers: QuickEstimateAnswer[];
  drivers: Pick<
    EstimateDriver,
    "multiplier" | "fixed_allowance" | "labour_modifier_percent"
  >[];
  clientBudget: number | null;
  targetMarginPercent?: number;
}

export interface QuickEstimateCalculationResult {
  canCalculate: boolean;
  reason?: string;
  estimatedCostLow: number | null;
  estimatedCostHigh: number | null;
  recommendedSellLow: number | null;
  recommendedSellHigh: number | null;
  targetMarginPercent: number;
  expectedMarginPercent: number | null;
  confidenceLevel: QuickEstimateConfidenceLevel;
  budgetFit: QuickEstimateBudgetFit;
}

function getAnswerValue(
  answers: QuickEstimateAnswer[],
  key: string
): string | null {
  const answer = answers.find((a) => a.question_key === key);
  if (!answer?.answer) return null;
  if (typeof answer.answer === "string") return answer.answer;
  if (
    typeof answer.answer === "object" &&
    answer.answer !== null &&
    "value" in answer.answer &&
    typeof (answer.answer as { value: unknown }).value === "string"
  ) {
    return (answer.answer as { value: string }).value;
  }
  return String(answer.answer);
}

function deriveConfidence(
  workType: string | null,
  answers: QuickEstimateAnswer[],
  driverCount: number
): QuickEstimateConfidenceLevel {
  const risks = getAnswerValue(answers, "risks_unknowns");
  const finishLevel = getAnswerValue(answers, "finish_level");
  const access = getAnswerValue(answers, "access_easy");

  if (
    !workType ||
    workType === "other" ||
    finishLevel === "unknown" ||
    access === "unknown" ||
    (risks && risks.trim().length > 20)
  ) {
    return "low";
  }

  if (driverCount > 4 || access === "no") {
    return "medium";
  }

  return "high";
}

function deriveBudgetFit(
  clientBudget: number | null,
  sellLow: number | null,
  sellHigh: number | null
): QuickEstimateBudgetFit {
  if (clientBudget == null || sellLow == null || sellHigh == null) {
    return "unknown";
  }

  const midSell = (sellLow + sellHigh) / 2;

  if (clientBudget < sellLow) {
    return "below_budget";
  }

  if (clientBudget >= sellLow && clientBudget <= sellHigh) {
    return "within_budget";
  }

  if (clientBudget > sellHigh && clientBudget >= midSell * 0.9) {
    return "within_budget";
  }

  return "above_budget";
}

export function calculateLegacyWizardEstimate(
  input: QuickEstimateCalculationInput
): QuickEstimateCalculationResult {
  const targetMarginPercent =
    input.targetMarginPercent ?? DEFAULT_TARGET_MARGIN_PERCENT;
  const marginMultiplier = 1 + targetMarginPercent / 100;

  const workType =
    input.workType ?? getAnswerValue(input.answers, "work_type");

  if (!workType || !PLACEHOLDER_BASE_RANGES[workType]) {
    return {
      canCalculate: false,
      reason:
        "Add base pricing rules in the next sprint to calculate this estimate.",
      estimatedCostLow: null,
      estimatedCostHigh: null,
      recommendedSellLow: null,
      recommendedSellHigh: null,
      targetMarginPercent,
      expectedMarginPercent: null,
      confidenceLevel: deriveConfidence(workType, input.answers, input.drivers.length),
      budgetFit: "unknown",
    };
  }

  const base = PLACEHOLDER_BASE_RANGES[workType];

  let combinedMultiplier = 1;
  let fixedTotal = 0;

  for (const driver of input.drivers) {
    combinedMultiplier *= Number(driver.multiplier);
    fixedTotal += Number(driver.fixed_allowance);
  }

  const estimatedCostLow = Math.round(base.low * combinedMultiplier + fixedTotal);
  const estimatedCostHigh = Math.round(
    base.high * combinedMultiplier + fixedTotal
  );

  const recommendedSellLow = Math.round(estimatedCostLow * marginMultiplier);
  const recommendedSellHigh = Math.round(estimatedCostHigh * marginMultiplier);

  return {
    canCalculate: true,
    estimatedCostLow,
    estimatedCostHigh,
    recommendedSellLow,
    recommendedSellHigh,
    targetMarginPercent,
    expectedMarginPercent: targetMarginPercent,
    confidenceLevel: deriveConfidence(
      workType,
      input.answers,
      input.drivers.length
    ),
    budgetFit: deriveBudgetFit(
      input.clientBudget,
      recommendedSellLow,
      recommendedSellHigh
    ),
  };
}
