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
    /** Maps to cost-engine calculationType */
    calculationType?: "deck_area" | "wall_area" | "floor_area" | "generic";
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
};

export type MatchedScopeTemplate = {
  template: ScopeTemplate;
  confidence: number;
  matchedKeywords: string[];
};
