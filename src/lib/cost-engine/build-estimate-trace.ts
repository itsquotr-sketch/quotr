import type { QualityLevel } from "@/lib/constants/quality-level";
import type { EstimateTrace, EstimateTraceAdjustment } from "@/lib/cost-engine/estimate-trace";
import type { RateSource } from "@/lib/cost-engine/rates/get-base-rate-for-scope";
import {
  getKnownFactsForScope,
  getMissingRequiredFacts,
} from "@/lib/scopes/missing-facts";
import { getAnswerValue } from "@/lib/question-keys";
import type { QuickEstimateWorkAreaInput } from "@/lib/cost-engine/quick-estimate-input";
import { computeRangeWidthPercent } from "@/lib/cost-engine/range-quality";
import { toLegacyConfidenceLevel } from "@/lib/cost-engine/confidence/level";

export function buildEstimateTrace(input: {
  workAreas: QuickEstimateWorkAreaInput[];
  scopeKey: string;
  quantity: number;
  unit: string;
  baseRate: number;
  rateSource: RateSource;
  centralEstimate: number;
  baseDescription: string;
  constraintLabels: string[];
  finishAdjustments: EstimateTraceAdjustment[];
  contingencyPercent: number;
  marginPercent: number;
  confidenceScore: number;
  rangeFactor: number;
  costLow: number;
  costHigh: number;
  sellLow: number;
  sellHigh: number;
  missingCriticalFacts: string[];
  finishLevel: QualityLevel;
}): EstimateTrace {
  const extractedFacts: NonNullable<EstimateTrace["extractedFacts"]> = [];
  const missingFacts: NonNullable<EstimateTrace["missingFacts"]> = [];

  for (const area of input.workAreas) {
    for (const fact of getKnownFactsForScope(
      area.workAreaTypeKey,
      area.answers
    )) {
      const value = getAnswerValue(area.answers, fact.key) ?? "";
      extractedFacts.push({
        key: fact.key,
        label: fact.label,
        value,
        source: area.answeredFromNotes.includes(fact.key)
          ? "discovery"
          : "answer",
      });
    }

    for (const fact of getMissingRequiredFacts(
      area.workAreaTypeKey,
      area.answers
    )) {
      missingFacts.push({
        key: fact.key,
        label: fact.questionText || fact.label,
        workAreaName: area.name,
      });
    }
  }

  const constraintAdjustments: EstimateTraceAdjustment[] =
    input.constraintLabels.map((label) => ({
      label,
      effect: "Applied to central estimate",
    }));

  const rangeWidthPercent = computeRangeWidthPercent(
    input.costLow,
    input.costHigh,
    input.centralEstimate
  );

  return {
    scopeKey: input.scopeKey,
    quantity: input.quantity,
    unit: input.unit,
    baseRate: input.baseRate,
    rateSource: input.rateSource,
    centralEstimate: input.centralEstimate,
    finishAdjustments: input.finishAdjustments,
    constraintAdjustments,
    contingencyPercent: input.contingencyPercent,
    marginPercent: input.marginPercent,
    confidenceScore: input.confidenceScore,
    rangeFactor: input.rangeFactor,
    finalCostRange: { low: input.costLow, high: input.costHigh },
    finalSellRange: { low: input.sellLow, high: input.sellHigh },
    missingCriticalFacts: input.missingCriticalFacts,
    workAreas: input.workAreas.map((a) => ({
      name: a.name,
      typeKey: a.workAreaTypeKey,
    })),
    extractedFacts,
    missingFacts,
    baseCalculation: {
      quantity: input.quantity,
      rate: input.baseRate,
      total: input.centralEstimate,
      description: input.baseDescription || "Template calculation",
    },
    riskAdjustments: [],
    marginApplied: input.marginPercent,
    qualityLevel: toLegacyConfidenceLevel(input.confidenceScore),
    finishLevel: input.finishLevel,
    rangeWidthPercent,
  };
}
