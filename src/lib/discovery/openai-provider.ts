import type { DiscoveryProvider } from "@/lib/discovery/provider";
import type { DiscoveryResult } from "@/lib/discovery/types";

/**
 * Future OpenAI discovery provider.
 *
 * Integration steps:
 * 1. Implement discoverProject() calling OpenAI with structured output schema
 * 2. Map response to DiscoveryResult (same shape as rule-based)
 * 3. Register in getDiscoveryProvider() in index.ts
 * 4. Set DISCOVERY_PROVIDER=openai in environment
 *
 * Do not import or call this until OpenAI is enabled.
 */
export class OpenAIDiscoveryProvider implements DiscoveryProvider {
  readonly id = "openai";
  readonly version = "0.0.0";

  discoverProject(sourceNotes: string): DiscoveryResult {
    void sourceNotes;
    throw new Error(
      "OpenAIDiscoveryProvider is not implemented. Use rule-based discovery."
    );
  }
}
