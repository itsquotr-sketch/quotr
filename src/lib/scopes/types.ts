export type ScopeFactType = "number" | "select" | "boolean" | "text";

export type ScopeFactOption = { value: string; label: string };

export type ScopeFactDefinition = {
  key: string;
  label: string;
  type: ScopeFactType;
  unit?: string;
  required: boolean;
  affectsEstimate: boolean;
  affectsConfidence: boolean;
  questionText: string;
  options?: ScopeFactOption[];
  placeholder?: string;
  helpText?: string;
  extractionPatterns?: RegExp[];
  extractValue?: (match: RegExpMatchArray) => string | null;
};

export type ScopeConstraintFollowUp = {
  label: string;
  unit: string;
  valueKey: string;
  inputType: "number" | "text" | "select";
  options?: ScopeFactOption[];
};

export type ScopeConstraintDefinition = {
  key: string;
  label: string;
  questionText: string;
  slug: string;
  driverSlug?: string;
  hideWhenFactAnswered?: string;
  universal?: boolean;
  followUp?: ScopeConstraintFollowUp;
};

export type ScopeBenchmarkRates = {
  unit: string;
  low: number;
  typical: number;
  high: number;
};

export type ScopeEstimateRules = {
  calculationType: "deck_area" | "wall_area" | "floor_area" | "generic";
  requiredFactKeys: string[];
  layoutChangeModifier?: number;
  elevatedModifier?: number;
};

export type ScopeConfidenceRules = {
  /** Fact keys that must be answered for "measurements complete" */
  measurementFactKeys: string[];
  /** Optional facts that tighten range when answered */
  highImpactOptionalKeys: string[];
};

export type ScopeDefinition = {
  id: string;
  name: string;
  workAreaTypeKey: string;
  category: string;
  aliases: string[];
  description: string;
  requiredFacts: ScopeFactDefinition[];
  optionalFacts: ScopeFactDefinition[];
  pricingDrivers: string[];
  constraints: ScopeConstraintDefinition[];
  likelyTrades: string[];
  assumptions: string[];
  confidenceRules: ScopeConfidenceRules;
  benchmarkRates: ScopeBenchmarkRates;
  estimateRules: ScopeEstimateRules;
};

export type MatchedScope = {
  scope: ScopeDefinition;
  confidence: number;
  matchedKeywords: string[];
  suggestedName: string;
  locationArea: string | null;
};
