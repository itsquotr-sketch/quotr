import { z } from "zod";

export const TRACE_VERSION = "1.0" as const;

export type EstimateTraceQuantitySource =
  | "user"
  | "derived"
  | "assumed"
  | "benchmark"
  | "unknown";

export type EstimateTraceRateSource =
  | "user_rate"
  | "scope_rate"
  | "component_rate"
  | "template_benchmark"
  | "regional_benchmark"
  | "placeholder"
  | "unknown";

export type EstimateTraceDriverType =
  | "base_rate"
  | "percentage_adjustment"
  | "flat_allowance"
  | "exclusion"
  | "inclusion"
  | "confidence"
  | "range";

export type EstimateTraceDriverSource =
  | "user"
  | "assistant"
  | "template"
  | "benchmark"
  | "system";

export type EstimateTraceComponentCategory =
  | "labour"
  | "materials"
  | "subcontractors"
  | "allowances"
  | "contingency";

export type EstimateTraceComponentSource =
  | "calculated"
  | "allocated"
  | "user_rate"
  | "benchmark"
  | "assumed";

export type EstimateTraceAllowanceSource =
  | "user"
  | "template_default"
  | "assistant"
  | "benchmark";

export type EstimateTraceMissingImportance = "critical" | "useful" | "optional";

export type EstimateTraceRangeQuality =
  | "narrow"
  | "reasonable"
  | "wide"
  | "too_wide";

export type EstimateTraceConfidenceLevel = "low" | "fair" | "good" | "ready";

export type EstimateTraceRateWarningSeverity = "info" | "warning" | "critical";

export type EstimateTraceTotal = {
  costCentral: number;
  costLow: number;
  costHigh: number;
  sellCentral: number;
  sellLow: number;
  sellHigh: number;
  marginPercent: number;
  contingencyPercent: number;
  rangeWidthPercent: number;
  rangeQuality: EstimateTraceRangeQuality;
};

export type EstimateTraceDriver = {
  key: string;
  label: string;
  type: EstimateTraceDriverType;
  value: number | string | boolean | null;
  amountImpact?: number;
  explanation: string;
  source: EstimateTraceDriverSource;
};

export type EstimateTraceAllowance = {
  key: string;
  label: string;
  amount: number;
  source: EstimateTraceAllowanceSource;
  editable: boolean;
  explanation: string;
};

export type EstimateTraceComponent = {
  key: string;
  label: string;
  category: EstimateTraceComponentCategory;
  amount: number;
  source: EstimateTraceComponentSource;
  included: boolean;
  explanation: string;
};

export type EstimateTraceMissingItem = {
  key: string;
  label: string;
  importance: EstimateTraceMissingImportance;
  affectsEstimate: boolean;
  explanation: string;
};

export type EstimateTraceScope = {
  scopeId: string;
  scopeTypeKey: string;
  label: string;
  included: boolean;
  quantity: {
    value: number | null;
    unit: string | null;
    source: EstimateTraceQuantitySource;
    explanation: string;
  };
  rate: {
    value: number | null;
    unit: string | null;
    source: EstimateTraceRateSource;
    label: string;
    explanation: string;
  };
  qualityLevel: "budget" | "standard" | "premium" | "unknown";
  cost: {
    central: number;
    low: number;
    high: number;
  };
  sell: {
    central: number;
    low: number;
    high: number;
  };
  allocations: {
    labour: number;
    materials: number;
    subcontractors: number;
    allowances: number;
    contingency: number;
  };
  drivers: EstimateTraceDriver[];
  allowances: EstimateTraceAllowance[];
  components: EstimateTraceComponent[];
  assumptions: string[];
  exclusions: string[];
  missing: EstimateTraceMissingItem[];
};

export type EstimateTraceRateWarning = {
  scopeId?: string;
  scopeLabel?: string;
  severity: EstimateTraceRateWarningSeverity;
  message: string;
};

export type EstimateTraceConfidenceSummary = {
  level: EstimateTraceConfidenceLevel;
  score: number;
  mainReason: string;
  nextBestAction?: string;
};

/** Structured estimate trace — explanation layer for quick estimates. */
export type EstimateTrace = {
  traceVersion: typeof TRACE_VERSION;
  generatedAt: string;
  projectId: string;
  organisationId: string;
  total: EstimateTraceTotal;
  scopes: EstimateTraceScope[];
  globalAllowances: EstimateTraceAllowance[];
  globalAssumptions: string[];
  globalExclusions: string[];
  rateWarnings: EstimateTraceRateWarning[];
  confidenceSummary: EstimateTraceConfidenceSummary;
};

const estimateTraceDriverSchema = z.object({
  key: z.string(),
  label: z.string(),
  type: z.enum([
    "base_rate",
    "percentage_adjustment",
    "flat_allowance",
    "exclusion",
    "inclusion",
    "confidence",
    "range",
  ]),
  value: z.union([z.number(), z.string(), z.boolean(), z.null()]),
  amountImpact: z.number().optional(),
  explanation: z.string(),
  source: z.enum(["user", "assistant", "template", "benchmark", "system"]),
});

const estimateTraceAllowanceSchema = z.object({
  key: z.string(),
  label: z.string(),
  amount: z.number(),
  source: z.enum(["user", "template_default", "assistant", "benchmark"]),
  editable: z.boolean(),
  explanation: z.string(),
});

const estimateTraceComponentSchema = z.object({
  key: z.string(),
  label: z.string(),
  category: z.enum([
    "labour",
    "materials",
    "subcontractors",
    "allowances",
    "contingency",
  ]),
  amount: z.number(),
  source: z.enum([
    "calculated",
    "allocated",
    "user_rate",
    "benchmark",
    "assumed",
  ]),
  included: z.boolean(),
  explanation: z.string(),
});

const estimateTraceMissingItemSchema = z.object({
  key: z.string(),
  label: z.string(),
  importance: z.enum(["critical", "useful", "optional"]),
  affectsEstimate: z.boolean(),
  explanation: z.string(),
});

const estimateTraceScopeSchema = z.object({
  scopeId: z.string(),
  scopeTypeKey: z.string(),
  label: z.string(),
  included: z.boolean(),
  quantity: z.object({
    value: z.number().nullable(),
    unit: z.string().nullable(),
    source: z.enum(["user", "derived", "assumed", "benchmark", "unknown"]),
    explanation: z.string(),
  }),
  rate: z.object({
    value: z.number().nullable(),
    unit: z.string().nullable(),
    source: z.enum([
      "user_rate",
      "scope_rate",
      "component_rate",
      "template_benchmark",
      "regional_benchmark",
      "placeholder",
      "unknown",
    ]),
    label: z.string(),
    explanation: z.string(),
  }),
  qualityLevel: z.enum(["budget", "standard", "premium", "unknown"]),
  cost: z.object({
    central: z.number(),
    low: z.number(),
    high: z.number(),
  }),
  sell: z.object({
    central: z.number(),
    low: z.number(),
    high: z.number(),
  }),
  allocations: z.object({
    labour: z.number(),
    materials: z.number(),
    subcontractors: z.number(),
    allowances: z.number(),
    contingency: z.number(),
  }),
  drivers: z.array(estimateTraceDriverSchema),
  allowances: z.array(estimateTraceAllowanceSchema),
  components: z.array(estimateTraceComponentSchema),
  assumptions: z.array(z.string()),
  exclusions: z.array(z.string()),
  missing: z.array(estimateTraceMissingItemSchema),
});

export const estimateTraceSchema = z.object({
  traceVersion: z.literal(TRACE_VERSION),
  generatedAt: z.string(),
  projectId: z.string(),
  organisationId: z.string(),
  total: z.object({
    costCentral: z.number(),
    costLow: z.number(),
    costHigh: z.number(),
    sellCentral: z.number(),
    sellLow: z.number(),
    sellHigh: z.number(),
    marginPercent: z.number(),
    contingencyPercent: z.number(),
    rangeWidthPercent: z.number(),
    rangeQuality: z.enum(["narrow", "reasonable", "wide", "too_wide"]),
  }),
  scopes: z.array(estimateTraceScopeSchema),
  globalAllowances: z.array(estimateTraceAllowanceSchema),
  globalAssumptions: z.array(z.string()),
  globalExclusions: z.array(z.string()),
  rateWarnings: z.array(
    z.object({
      scopeId: z.string().optional(),
      scopeLabel: z.string().optional(),
      severity: z.enum(["info", "warning", "critical"]),
      message: z.string(),
    })
  ),
  confidenceSummary: z.object({
    level: z.enum(["low", "fair", "good", "ready"]),
    score: z.number(),
    mainReason: z.string(),
    nextBestAction: z.string().optional(),
  }),
});

export function parseEstimateTrace(value: unknown): EstimateTrace | null {
  const result = estimateTraceSchema.safeParse(value);
  return result.success ? result.data : null;
}

export function createEmptyEstimateTrace(
  projectId: string,
  organisationId: string
): EstimateTrace {
  return {
    traceVersion: TRACE_VERSION,
    generatedAt: new Date().toISOString(),
    projectId,
    organisationId,
    total: {
      costCentral: 0,
      costLow: 0,
      costHigh: 0,
      sellCentral: 0,
      sellLow: 0,
      sellHigh: 0,
      marginPercent: 0,
      contingencyPercent: 5,
      rangeWidthPercent: 0,
      rangeQuality: "too_wide",
    },
    scopes: [],
    globalAllowances: [],
    globalAssumptions: [],
    globalExclusions: [],
    rateWarnings: [],
    confidenceSummary: {
      level: "low",
      score: 0,
      mainReason: "No confirmed work areas yet.",
    },
  };
}
