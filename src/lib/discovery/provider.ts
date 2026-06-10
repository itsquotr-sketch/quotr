import type { DiscoveryResult } from "@/lib/discovery/types";

/**
 * Pluggable discovery provider.
 * Implementations: RuleBasedDiscoveryProvider (now), OpenAIDiscoveryProvider (future).
 */
export interface DiscoveryProvider {
  readonly id: string;
  readonly version: string;

  discoverProject(sourceNotes: string): DiscoveryResult;
}
