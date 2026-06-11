import type { QuickEstimateConfidenceLevel } from "@/lib/constants/quick-estimate";
import type { QualityLevel } from "@/lib/constants/quality-level";
import type { RateSource } from "@/lib/cost-engine/rates/get-base-rate-for-scope";

export type EstimateTraceAdjustment = {
  label: string;
  effect: string;
  lowDelta?: number;
  highDelta?: number;
};

/** Calculation audit trail stored in snapshots and shown behind "Show calculation basis". */
export type EstimateTrace = {
  scopeKey: string;
  quantity: number;
  unit: string;
  baseRate: number;
  rateSource: RateSource | string;
  centralEstimate: number;
  finishAdjustments: EstimateTraceAdjustment[];
  constraintAdjustments: EstimateTraceAdjustment[];
  contingencyPercent: number;
  marginPercent: number;
  confidenceScore: number;
  rangeFactor: number;
  finalCostRange: { low: number; high: number };
  finalSellRange: { low: number; high: number };
  missingCriticalFacts: string[];

  /** Legacy fields kept for UI compatibility */
  workAreas?: { name: string; typeKey: string; templateKey?: string }[];
  extractedFacts?: {
    key: string;
    label: string;
    value: string;
    source: "answer" | "discovery" | "default";
  }[];
  missingFacts?: { key: string; label: string; workAreaName: string }[];
  baseCalculation?: {
    quantity: number;
    rate: number;
    total: number;
    description: string;
  };
  riskAdjustments?: EstimateTraceAdjustment[];
  marginApplied?: number;
  qualityLevel?: QuickEstimateConfidenceLevel;
  finishLevel?: QualityLevel;
  rangeWidthPercent?: number | null;
};

export function createEmptyTrace(): EstimateTrace {
  return {
    scopeKey: "",
    quantity: 0,
    unit: "each",
    baseRate: 0,
    rateSource: "placeholder",
    centralEstimate: 0,
    finishAdjustments: [],
    constraintAdjustments: [],
    contingencyPercent: 5,
    marginPercent: 20,
    confidenceScore: 0,
    rangeFactor: 0.3,
    finalCostRange: { low: 0, high: 0 },
    finalSellRange: { low: 0, high: 0 },
    missingCriticalFacts: [],
    workAreas: [],
    extractedFacts: [],
    missingFacts: [],
    baseCalculation: {
      quantity: 0,
      rate: 0,
      total: 0,
      description: "No calculation",
    },
    riskAdjustments: [],
    marginApplied: 0,
    qualityLevel: "low",
    finishLevel: "unknown",
    rangeWidthPercent: null,
  };
}
