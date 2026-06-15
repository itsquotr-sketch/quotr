export type {
  EstimateComponent,
  EstimateComponentSource,
  ScopeComponentCalcInput,
  ScopeComponentCalcResult,
} from "@/lib/cost-engine/estimate-components/types";

export {
  calculateScopeFromComponents,
  reconcileComponentsToTotal,
  buildScopeComponentCalcInput,
} from "@/lib/cost-engine/estimate-components/calculate-scope-components";

export {
  resolveComponentRate,
  primaryComponentRateSource,
} from "@/lib/cost-engine/estimate-components/resolve-component-rate";

export {
  estimateComponentsToTrace,
  estimateComponentsToStructured,
  formatComponentTraceSummary,
} from "@/lib/cost-engine/estimate-components/map-components-to-trace";
