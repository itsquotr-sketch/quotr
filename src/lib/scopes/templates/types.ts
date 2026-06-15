export type ScopeCategory =
  | "external"
  | "internal"
  | "renovation"
  | "commercial"
  | "custom";

export type ScopePricingMode =
  | "benchmark_rate"
  | "scope_rate"
  | "component_rate"
  | "hybrid"
  | "not_supported";

export type ScopeFactType = "number" | "select" | "boolean" | "text";

export type ScopeFactOption = { value: string; label: string };

/** Canonical fact definition for scope templates. */
export type CanonicalScopeFactDefinition = {
  key: string;
  label: string;
  type?: ScopeFactType;
  unit?: string;
  questionText?: string;
  options?: ScopeFactOption[];
  affectsEstimate?: boolean;
  affectsConfidence?: boolean;
};

export type DerivedFieldDefinition = {
  key: string;
  label: string;
  formula: string;
  sourceFields: string[];
};

export type ScopeComponentDefinition = {
  key: string;
  label: string;
  category: "labour" | "materials" | "subcontractor" | "allowance" | "other";
  /** Fact keys that indicate this component is included */
  includeWhenFacts?: string[];
  /** Fact keys that indicate exclusion or client supply */
  excludeWhenFacts?: string[];
  defaultIncluded?: boolean;
};

/** Indicative component lines for estimate insight allocation (Sprint 13B.1). */
export type AllocationComponentDefinition = {
  key: string;
  label: string;
  defaultIncluded?: boolean;
  includeWhenFacts?: string[];
  excludeWhenFacts?: string[];
  /** Relative weight within category for indicative split */
  weight?: number;
};

export type ScopeComponentAllocationTemplate = {
  labour: AllocationComponentDefinition[];
  materials: AllocationComponentDefinition[];
  subcontractors: AllocationComponentDefinition[];
  allowances: AllocationComponentDefinition[];
};

export type ConstraintDefinition = {
  key: string;
  label: string;
  slug: string;
  questionText?: string;
  driverSlug?: string;
  hideWhenFactAnswered?: string;
  universal?: boolean;
};

export type DependentQuestionRule = {
  whenFactKey: string;
  whenValue: string | string[];
  askFactKey: string;
  questionText: string;
};

export type EstimateLineGroupDefinition = {
  key: string;
  label: string;
  componentKeys: string[];
};

export type ScopeAllocations = {
  labour: number;
  materials: number;
  subcontractors: number;
  allowances: number;
  contingency: number;
};

export type ScopeBenchmarkRates = {
  budget?: number;
  standard?: number;
  premium?: number;
};

/** Material category for scope-specific material questions and benchmark selection. */
export type MaterialCategoryDefinition = {
  value: string;
  label: string;
  benchmarkTier?: "budget" | "standard" | "premium";
  rateMultiplier?: number;
};

/** Material intelligence config — drives questions, defaults, and pricing relevance. */
export type ScopeMaterialCategories = {
  factKey: string;
  questionText: string;
  defaultCategoryKey: string;
  categories: MaterialCategoryDefinition[];
};

/** Category keys for confidence weight rules (Sprint 13C). */
export type ConfidenceWeightCategory =
  | "quantity"
  | "material"
  | "finish"
  | "inclusions"
  | "site_access"
  | "rate_source"
  | "supply"
  | "assumptions";

/** Single weighted confidence rule — factKeys and weight should sum to 100 per template. */
export type ScopeConfidenceWeight = {
  key: string;
  label: string;
  weight: number;
  category: ConfidenceWeightCategory;
  factKeys: string[];
  /** "any" = one answered fact earns full weight; default "all". */
  matchMode?: "all" | "any";
  /** When set, this weight only applies if the referenced fact matches one of the values. */
  conditionalOn?: { factKey: string; values: string[] };
};

export type ScopeConfidenceWeights = ScopeConfidenceWeight[];

/**
 * Canonical scope template — every current and future scope follows this shape.
 * Add a new scope by creating one template object and registering it.
 */
export type ScopeTemplate = {
  scopeTypeKey: string;
  label: string;
  /** Display name used in work areas DB (legacy compatibility) */
  workAreaTypeKey: string;
  category: ScopeCategory;
  aliases: string[];

  quantity: {
    primaryUnit: string;
    requiredFields: string[];
    derivedFields?: DerivedFieldDefinition[];
  };

  facts: {
    required: CanonicalScopeFactDefinition[];
    useful: CanonicalScopeFactDefinition[];
    optional: CanonicalScopeFactDefinition[];
  };

  pricing: {
    supported: boolean;
    pricingMode: ScopePricingMode;
    defaultRateUnit: string;
    benchmarkRates?: ScopeBenchmarkRates;
    defaultAllocations: ScopeAllocations;
    components?: ScopeComponentDefinition[];
    /** Insight drawer component registry — labour / materials / trades / allowances */
    componentAllocation?: ScopeComponentAllocationTemplate;
    /** Maps to cost-engine calculationType */
    calculationType?: "deck_area" | "wall_area" | "floor_area" | "kitchen_size" | "fence_length" | "generic";
    elevatedModifier?: number;
    layoutChangeModifier?: number;
  };

  constraints: {
    applicable: ConstraintDefinition[];
  };

  assumptions: {
    default: string[];
  };

  exclusions: {
    default: string[];
  };

  followUps: {
    dependentQuestions: DependentQuestionRule[];
  };

  estimateBreakdown: {
    defaultLineGroups: EstimateLineGroupDefinition[];
  };

  /** Material category system — scope-specific material questions and benchmark defaults. */
  materialCategories?: ScopeMaterialCategories;

  /** Template-driven confidence scoring — weights should sum to 100. */
  confidenceWeights?: ScopeConfidenceWeights;
};

export type MatchedScopeTemplate = {
  template: ScopeTemplate;
  confidence: number;
  matchedKeywords: string[];
};
