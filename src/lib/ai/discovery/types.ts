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

export type DiscoveryRunContext = {
  projectId: string;
  organisationId: string;
  userId: string;
  inputText: string;
};

export type DiscoveryRunOutcome = {
  result: DiscoveryRunResult;
  provider: DiscoveryProviderMeta;
  usedFallback: boolean;
  fallbackReason?: string;
  rawOutput?: unknown;
};

export type {
  DiscoveryConstraint,
  DiscoveryFact,
  DiscoveryQuestion,
  DiscoveryResult,
  DiscoveryTrade,
  DiscoveryWorkArea,
};
