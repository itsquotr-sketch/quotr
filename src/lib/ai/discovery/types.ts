import type {
  DiscoveryConstraint,
  DiscoveryFact,
  DiscoveryQuestion,
  DiscoveryResult,
  DiscoveryTrade,
  DiscoveryWorkArea,
} from "@/lib/discovery/types";

export type DiscoveryRisk = {
  title: string;
  description: string;
};

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

export type {
  DiscoveryConstraint,
  DiscoveryFact,
  DiscoveryQuestion,
  DiscoveryResult,
  DiscoveryTrade,
  DiscoveryWorkArea,
};
