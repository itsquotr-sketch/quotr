import type { QualityLevel } from "@/lib/constants/quality-level";
import type { ScopeQuestionInputType } from "@/lib/project-assistant-questions";

/** A work area identified from project notes. */
export type DiscoveryWorkArea = {
  typeKey: string;
  name: string;
  description: string;
  locationArea: string | null;
  confidence: number;
  matchedKeywords: string[];
};

/** A measurable or descriptive scope fact extracted from notes. */
export type DiscoveryFact = {
  key: string;
  label: string;
  value: string;
  unit?: string;
  workAreaTypeKey?: string;
  source: "notes";
  confidence: number;
};

/** A targeted question for a work area. */
export type DiscoveryQuestion = {
  key: string;
  text: string;
  workAreaTypeKey: string;
  workAreaName?: string;
  inputType: ScopeQuestionInputType;
  unit?: string;
};

/** A job difficulty or site constraint — not a scope measurement. */
export type DiscoveryConstraint = {
  slug: string;
  label: string;
  workAreaTypeKey?: string;
  source: "notes" | "inferred";
  confidence: number;
};

/** A trade likely required for the project. */
export type DiscoveryTrade = {
  name: string;
  workAreaTypeKey: string;
};

export type DiscoveryRisk = {
  title: string;
  description: string;
};

export type DiscoveryQualityLevel = {
  value: QualityLevel;
  confidence: number;
  reason: string;
};

/** Full output from a discovery run. */
export type DiscoveryResult = {
  workAreas: DiscoveryWorkArea[];
  facts: DiscoveryFact[];
  questions: DiscoveryQuestion[];
  constraints: DiscoveryConstraint[];
  trades: DiscoveryTrade[];
  risks?: DiscoveryRisk[];
  assumptions?: string[];
  confidence?: number;
  qualityLevel?: DiscoveryQualityLevel;
  model?: string | null;
  promptVersion?: string;
};

export type DiscoveryProviderId = "rule-based" | "openai";

export type DiscoveryRunResult = DiscoveryResult & {
  risks: DiscoveryRisk[];
  assumptions: string[];
  confidence: number;
  model: string | null;
  promptVersion: string;
};

export type DiscoveryProviderMeta = {
  id: string;
  label: string;
  version: string;
};

export type DiscoveryExistingAnswer = {
  key: string;
  value: string;
  source?: string;
  workAreaTypeKey?: string;
};

export type DiscoveryRunContext = {
  projectId: string;
  organisationId: string;
  userId: string;
  inputText: string;
  /** Confirmed project scopes — helps AI avoid re-suggesting work areas */
  confirmedWorkAreas?: { typeKey: string; name: string }[];
  /** Facts already extracted or saved from a prior run */
  existingFacts?: DiscoveryFact[];
  /** User or discovery answers already on file */
  existingAnswers?: DiscoveryExistingAnswer[];
};

export type DiscoveryProviderError = {
  success: false;
  provider: string;
  error: string;
  errorCode?: string;
};

export type DiscoveryRunOutcome = {
  result: DiscoveryRunResult;
  provider: DiscoveryProviderMeta;
  usedFallback: boolean;
  fallbackReason?: string;
  rawOutput?: unknown;
  /** When AI was attempted but fell back to rules */
  attemptedProviderId?: string;
};
