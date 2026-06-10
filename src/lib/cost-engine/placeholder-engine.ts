import type { CostEngine } from "@/lib/cost-engine/engine";
import type {
  QuickEstimateCostInput,
  QuickEstimateCostResult,
} from "@/lib/cost-engine/types";

export const PLACEHOLDER_COST_ENGINE_VERSION = "0.1.0";

/**
 * Placeholder cost engine — returns zero values until rate library
 * integration and pricing formulas are implemented.
 */
export class PlaceholderCostEngine implements CostEngine {
  readonly id = "placeholder";
  readonly version = PLACEHOLDER_COST_ENGINE_VERSION;

  calculateQuickEstimate(_input: QuickEstimateCostInput): QuickEstimateCostResult {
    void _input;
    return {
      cost: 0,
      sell: 0,
      margin: 0,
      confidence: "low",
    };
  }
}

export const placeholderCostEngine = new PlaceholderCostEngine();
