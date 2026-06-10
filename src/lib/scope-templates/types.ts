import type { ScopeQuestionInputType } from "@/lib/project-assistant-questions";

export type ScopeTemplateQuestionType = ScopeQuestionInputType;

export type ScopeTemplateQuestion = {
  questionKey: string;
  label: string;
  type: ScopeTemplateQuestionType;
  unit?: string;
  required: boolean;
  options?: { value: string; label: string }[];
  helpText?: string;
  affectsEstimate: boolean;
  placeholder?: string;
};

export type ScopeTemplateFact = {
  key: string;
  label: string;
  unit?: string;
  required: boolean;
  extractionPatterns?: RegExp[];
  extractValue?: (match: RegExpMatchArray) => string | null;
};

export type ScopeTemplateConstraintFollowUp = {
  label: string;
  unit: string;
  valueKey: string;
  inputType: "number" | "text" | "select";
  options?: { value: string; label: string }[];
};

export type ScopeTemplateConstraint = {
  key: string;
  label: string;
  slug: string;
  driverSlug?: string;
  hideWhenQuestionAnswered?: string;
  universal?: boolean;
  followUp?: ScopeTemplateConstraintFollowUp;
};

export type ScopeTemplateBenchmarkRates = {
  unit: string;
  low: number;
  typical: number;
  high: number;
};

export type ScopeTemplateEstimateRules = {
  calculationType: "deck_area" | "wall_area" | "floor_area" | "generic";
  requiredFactKeys: string[];
  lowMultiplier: number;
  highMultiplier: number;
  layoutChangeModifier?: number;
  elevatedModifier?: number;
};

export type ScopeTemplate = {
  key: string;
  name: string;
  workAreaTypeKey: string;
  category: string;
  aliases: string[];
  description: string;
  requiredFacts: ScopeTemplateFact[];
  optionalFacts: ScopeTemplateFact[];
  questions: ScopeTemplateQuestion[];
  constraints: ScopeTemplateConstraint[];
  likelyTrades: string[];
  benchmarkRates: ScopeTemplateBenchmarkRates;
  estimateRules: ScopeTemplateEstimateRules;
};

export type MatchedScopeTemplate = {
  template: ScopeTemplate;
  confidence: number;
  matchedKeywords: string[];
  suggestedName: string;
  locationArea: string | null;
};
