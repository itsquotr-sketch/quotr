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
