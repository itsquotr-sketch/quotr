import type {
  QuickEstimateCostInput,
  QuickEstimateCostResult,
} from "@/lib/cost-engine/types";

/**
 * Pluggable cost engine for Quick Estimate pricing.
 *
 * Pipeline: Discovery Engine → Cost Engine → Quick Estimate UI
 */
export interface CostEngine {
  readonly id: string;
  readonly version: string;

  calculateQuickEstimate(
    input: QuickEstimateCostInput
  ): QuickEstimateCostResult;
}
