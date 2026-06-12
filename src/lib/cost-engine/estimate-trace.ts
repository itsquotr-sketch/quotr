import type { QuickEstimateConfidenceLevel } from "@/lib/constants/quick-estimate";
import type { QualityLevel } from "@/lib/constants/quality-level";
import type { CostBreakdown } from "@/lib/cost-engine/build-cost-breakdown";
import type { RateSource } from "@/lib/cost-engine/rates/get-base-rate-for-scope";

export type EstimateTraceAdjustment = {
  label: string;
  effect: string;
  lowDelta?: number;
  highDelta?: number;
};

export type WorkAreaAllocationBreakdown = {
  labourPercent: number;
  materialsPercent: number;
  subcontractorsPercent: number;
  allowancesPercent: number;
  source: "scope_rate" | "template" | "fallback";
};

export type WorkAreaEstimateTrace = {
  scopeTypeKey: string;
  workAreaName: string;
  workAreaTypeKey: string;
  quantity: number;
  unit: string;
  rate: number;
  rateSource: RateSource;
  finishLevel: QualityLevel;
  centralEstimate: number;
  allocationBreakdown?: WorkAreaAllocationBreakdown;
  assumptions: string[];
};

export type WorkAreaRateSourceLine = {
  workAreaName: string;
  workAreaTypeKey: string;
  scopeTypeKey: string;
  label: string;
  rateSource: RateSource;
  rateSourceLabel: string;
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
  costBreakdown?: CostBreakdown;
  workAreaTraces?: WorkAreaEstimateTrace[];

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
    workAreaTraces: [],
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
