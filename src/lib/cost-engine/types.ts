import type { DiscoveryResult } from "@/lib/ai/discovery/types";

export type CostConfidenceLevel = "low" | "medium" | "high";

/** Low / typical / high pricing band for quick estimate ranges. */
export type RateRange = {
  low: number;
  typical: number;
  high: number;
};

/** Subcontractor rate bands ready for cost engine consumption. */
export type SubcontractorRateBands = {
  trade: string;
  unit: string;
  cost: RateRange;
  charge: RateRange;
  defaultConfidence: CostConfidenceLevel;
};

/** Package rate bands ready for cost engine consumption. */
export type PackageRateBands = {
  packageName: string;
  workAreaType: string | null;
  unit: string;
  cost: RateRange;
  sell: RateRange;
  defaultMargin: number | null;
};

/** Result from a quick estimate cost calculation. */
export type QuickEstimateCostResult = {
  cost: number;
  sell: number;
  margin: number;
  confidence: CostConfidenceLevel;
};

/** Inputs for the cost engine — extended as pricing logic is built. */
export type QuickEstimateCostInput = {
  organisationId: string;
  projectId: string;
  /** Discovery output from the Discovery Engine */
  discovery?: DiscoveryResult | null;
  /** Future: confirmed work areas, constraint selections, answered questions */
};
