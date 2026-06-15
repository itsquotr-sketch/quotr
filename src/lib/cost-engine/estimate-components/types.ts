import type { QualityLevel } from "@/lib/constants/quality-level";

/** How a component cost was resolved — priority order documented in resolve-component-rate. */
export type EstimateComponentSource =
  | "contractor_component_rate"
  | "contractor_scope_rate"
  | "benchmark_component_rate"
  | "benchmark_scope_rate"
  | "placeholder";

export type EstimateComponent = {
  id: string;
  scope_type: string;
  component_type: string;
  quantity: number;
  unit: string;
  source: EstimateComponentSource;
  estimated_cost: number;
  confidence: number;
};

export type ComponentQuantitySpec = {
  component_type: string;
  label: string;
  category: "labour" | "materials" | "subcontractor" | "allowance" | "other";
  /** Share of area-based scope rate (0–1). Omit for flat allowances. */
  rateWeight?: number;
  unit: string;
  defaultIncluded?: boolean;
  includeWhenFacts?: string[];
  excludeWhenFacts?: string[];
};

export type ScopeComponentCalcInput = {
  scopeTypeKey: string;
  workAreaTypeKey: string;
  answers: Record<string, string>;
  orgRates: import("@/lib/cost-engine/rates/get-base-rate-for-scope").OrgRatesInput;
  effectiveQualityLevel: QualityLevel;
  finishLevel: "budget" | "standard" | "premium" | "unknown";
};

export type ScopeComponentCalcResult = {
  components: EstimateComponent[];
  centralEstimate: number;
  quantity: number;
  unit: string;
  baseRate: number;
  rateSource: import("@/lib/cost-engine/rates/get-base-rate-for-scope").RateSource;
  finishEncodedInRate: boolean;
  inputs: string[];
  allowances: string[];
  assumptions: string[];
  traceDrivers: import("@/lib/cost-engine/trace/types").EstimateTraceDriver[];
};
