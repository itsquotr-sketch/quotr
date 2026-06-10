import type { CostEngine } from "@/lib/cost-engine/engine";
import { placeholderCostEngine } from "@/lib/cost-engine/placeholder-engine";

export type { CostEngine } from "@/lib/cost-engine/engine";
export type {
  CostConfidenceLevel,
  PackageRateBands,
  QuickEstimateCostInput,
  QuickEstimateCostResult,
  RateRange,
  SubcontractorRateBands,
} from "@/lib/cost-engine/types";
export {
  PlaceholderCostEngine,
  placeholderCostEngine,
  PLACEHOLDER_COST_ENGINE_VERSION,
} from "@/lib/cost-engine/placeholder-engine";
export { buildQuickEstimateInput } from "@/lib/cost-engine/build-quick-estimate-input";
export { calculateQuickEstimateV1 } from "@/lib/cost-engine/calculate-quick-estimate-v1";
export { recalculateQuickEstimate } from "@/lib/cost-engine/recalculate-quick-estimate";
export type {
  QuickEstimateInput,
  QuickEstimateOutput,
  QuickEstimateWorkAreaInput,
} from "@/lib/cost-engine/quick-estimate-input";

/**
 * Returns the active cost engine.
 *
 * Future integration:
 * - RateLibraryCostEngine using labour_rates, material_rates, package_rates
 * - organisation_pricing_settings for margin, contingency, GST
 * - Discovery output (work areas, facts, constraints, trades) as inputs
 */
export function getCostEngine(): CostEngine {
  return placeholderCostEngine;
}
