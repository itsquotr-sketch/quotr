import type { EstimateQualityFactor } from "@/lib/cost-engine/estimate-quality";
import type { EstimateTrace } from "@/lib/cost-engine/estimate-trace";
import type { RangeQuality } from "@/lib/cost-engine/range-quality";

export function parseQuickEstimateSummary(notes: string | null): {
  workAreasIncluded: string[];
  questionsAnswered: number;
  questionsTotal: number;
  constraintsIncluded: string[];
  includedTrades: string[];
  allowances: string[];
  assumptions: string[];
  risks: string[];
  missingInformation: string[];
  inputsUsed: string[];
  ratesSource: "saved" | "fallback" | null;
  constraintsApplied: string[];
  qualityLevel?: string;
  qualityLevelNote?: string | null;
  templatesUsed?: string[];
  keyFactsUsed?: string[];
  confidenceReason?: string | null;
  rangeQuality?: RangeQuality;
  rangeQualityLabel?: string;
  rangeQualityReason?: string | null;
  rangeWidthPercent?: number | null;
  tightenSuggestions?: string[];
  rangeLowDrivers?: string[];
  rangeHighDrivers?: string[];
  qualityFactors?: EstimateQualityFactor[];
  estimateTrace?: EstimateTrace;
  confidenceScore?: number;
  confidenceLevelLabel?: string;
  confidenceReasons?: string[];
  questionsToHigh?: number;
  centralEstimate?: number | null;
  contingencyPercent?: number;
  rateSourceDetail?: string;
  rangeFactor?: number | null;
  rangeChangedMessage?: string | null;
} | null {
  if (!notes) return null;
  try {
    const parsed = JSON.parse(notes) as {
      workAreasIncluded?: string[];
      questionsAnswered?: number;
      questionsTotal?: number;
      constraintsIncluded?: string[];
      includedTrades?: string[];
      allowances?: string[];
      assumptions?: string[];
      risks?: string[];
      missingInformation?: string[];
      inputsUsed?: string[];
      ratesSource?: "saved" | "fallback";
      constraintsApplied?: string[];
      qualityLevel?: string;
      qualityLevelNote?: string | null;
      templatesUsed?: string[];
      keyFactsUsed?: string[];
      confidenceReason?: string | null;
      rangeQuality?: RangeQuality;
      rangeQualityLabel?: string;
      rangeQualityReason?: string | null;
      rangeWidthPercent?: number | null;
      tightenSuggestions?: string[];
      rangeLowDrivers?: string[];
      rangeHighDrivers?: string[];
      qualityFactors?: EstimateQualityFactor[];
      estimateTrace?: EstimateTrace;
      confidenceScore?: number;
      confidenceLevelLabel?: string;
      confidenceReasons?: string[];
      questionsToHigh?: number;
      centralEstimate?: number | null;
      contingencyPercent?: number;
      rateSourceDetail?: string;
      rangeFactor?: number | null;
      rangeChangedMessage?: string | null;
    };
    if (Array.isArray(parsed.includedTrades) || Array.isArray(parsed.workAreasIncluded)) {
      return {
        workAreasIncluded: parsed.workAreasIncluded ?? [],
        questionsAnswered: parsed.questionsAnswered ?? 0,
        questionsTotal: parsed.questionsTotal ?? 0,
        constraintsIncluded:
          parsed.constraintsApplied ?? parsed.constraintsIncluded ?? [],
        includedTrades: parsed.includedTrades ?? [],
        allowances: parsed.allowances ?? [],
        assumptions: parsed.assumptions ?? [],
        risks: parsed.risks ?? [],
        missingInformation: parsed.missingInformation ?? [],
        inputsUsed: parsed.inputsUsed ?? [],
        ratesSource: parsed.ratesSource ?? null,
        constraintsApplied:
          parsed.constraintsApplied ?? parsed.constraintsIncluded ?? [],
        qualityLevel: parsed.qualityLevel,
        qualityLevelNote: parsed.qualityLevelNote ?? null,
        templatesUsed: parsed.templatesUsed ?? [],
        keyFactsUsed: parsed.keyFactsUsed ?? [],
        confidenceReason: parsed.confidenceReason ?? null,
        rangeQuality: parsed.rangeQuality,
        rangeQualityLabel: parsed.rangeQualityLabel,
        rangeQualityReason: parsed.rangeQualityReason ?? null,
        rangeWidthPercent: parsed.rangeWidthPercent ?? null,
        tightenSuggestions: parsed.tightenSuggestions ?? [],
        rangeLowDrivers: parsed.rangeLowDrivers ?? [],
        rangeHighDrivers: parsed.rangeHighDrivers ?? [],
        qualityFactors: parsed.qualityFactors ?? [],
        estimateTrace: parsed.estimateTrace,
        confidenceScore: parsed.confidenceScore,
        confidenceLevelLabel: parsed.confidenceLevelLabel,
        confidenceReasons: parsed.confidenceReasons ?? [],
        questionsToHigh: parsed.questionsToHigh,
        centralEstimate: parsed.centralEstimate ?? null,
        contingencyPercent: parsed.contingencyPercent,
        rateSourceDetail: parsed.rateSourceDetail,
        rangeFactor: parsed.rangeFactor ?? null,
        rangeChangedMessage: parsed.rangeChangedMessage ?? null,
      };
    }
  } catch {
    return null;
  }
  return null;
}
