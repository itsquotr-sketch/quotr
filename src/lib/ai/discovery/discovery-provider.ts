import type {
  DiscoveryProviderMeta,
  DiscoveryRunContext,
  DiscoveryRunOutcome,
} from "@/lib/ai/discovery/types";

/** Pluggable discovery provider — OpenAI, Gemini, rule-based, etc. */
export interface IDiscoveryProvider {
  readonly meta: DiscoveryProviderMeta;
  discoverProject(context: DiscoveryRunContext): Promise<DiscoveryRunOutcome>;
}

/** @deprecated Use IDiscoveryProvider */
export type DiscoveryProvider = IDiscoveryProvider;
