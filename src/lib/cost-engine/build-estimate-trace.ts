import type { QualityLevel } from "@/lib/constants/quality-level";
import type {
  EstimateTrace,
  EstimateTraceAdjustment,
  WorkAreaEstimateTrace,
} from "@/lib/cost-engine/estimate-trace";
import type { RateSource } from "@/lib/cost-engine/rates/get-base-rate-for-scope";
import {
  getKnownFactsForScope,
  getMissingFactsForWorkArea,
} from "@/lib/scopes/missing-facts";
import type { CostBreakdown } from "@/lib/cost-engine/build-cost-breakdown";
import { buildStructuredEstimateBreakdown } from "@/lib/cost-engine/build-structured-estimate-breakdown";
import { getAnswerValue } from "@/lib/question-keys";
import type { QuickEstimateWorkAreaInput } from "@/lib/cost-engine/quick-estimate-input";
import { computeRangeWidthPercent } from "@/lib/cost-engine/range-quality";
import type { RangeQuality } from "@/lib/cost-engine/range-quality";
import { toLegacyConfidenceLevel } from "@/lib/cost-engine/confidence/level";
import { getScopeByWorkAreaType } from "@/lib/scopes";
import { resolveMaterialCategory } from "@/lib/scopes/material-categories";
import type { MaterialCategoryTrace } from "@/lib/cost-engine/estimate-trace";

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
  costBreakdown?: CostBreakdown;
  workAreaTraces?: WorkAreaEstimateTrace[];
  rangeQuality?: RangeQuality | string;
  scopeAllowances?: Record<string, string[]>;
  scopeAssumptions?: Record<string, string[]>;
}): EstimateTrace {
  const extractedFacts: NonNullable<EstimateTrace["extractedFacts"]> = [];
  const missingFacts: NonNullable<EstimateTrace["missingFacts"]> = [];
  const materialCategories: MaterialCategoryTrace[] = [];

  for (const area of input.workAreas) {
    const scope = getScopeByWorkAreaType(area.workAreaTypeKey);
    const resolved = resolveMaterialCategory({
      scopeTypeKey: scope?.id,
      workAreaTypeKey: area.workAreaTypeKey,
      answers: area.answers,
    });

    if (resolved) {
      materialCategories.push({
        workAreaName: area.name,
        scopeTypeKey: resolved.scopeTypeKey,
        factKey: resolved.factKey,
        categoryLabel: resolved.categoryLabel,
        categoryValue: resolved.categoryValue,
        source: resolved.source,
        sourceLabel: resolved.source === "user_provided" ? "User Provided" : "Assumed",
      });
    }

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

    for (const fact of getMissingFactsForWorkArea(
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

  const structuredBreakdown = buildStructuredEstimateBreakdown({
    workAreas: input.workAreas,
    workAreaTraces: input.workAreaTraces ?? [],
    confidenceScore: input.confidenceScore,
    contingencyPercent: input.contingencyPercent,
    marginPercent: input.marginPercent,
    costLow: input.costLow,
    costHigh: input.costHigh,
    costCentral: input.centralEstimate,
    sellLow: input.sellLow,
    sellHigh: input.sellHigh,
    finishLevel: input.finishLevel,
    rangeQuality: input.rangeQuality ?? "rough",
    costBreakdown: input.costBreakdown,
    scopeAllowances: input.scopeAllowances,
    scopeAssumptions: input.scopeAssumptions,
  });

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
    costBreakdown: input.costBreakdown,
    workAreaTraces: input.workAreaTraces ?? [],
    structuredBreakdown,
    materialCategories,
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
