import type { IDiscoveryProvider } from "@/lib/ai/discovery/discovery-provider";
import {
  isOpenAiDiscoveryAvailable,
  openAiDiscoveryProvider,
} from "@/lib/ai/discovery/providers/openai-discovery-provider";
import { ruleBasedAiDiscoveryProvider } from "@/lib/ai/discovery/rule-based-discovery-provider";
import type { DiscoveryRunContext, DiscoveryRunOutcome } from "@/lib/ai/discovery/types";

export { isOpenAiDiscoveryAvailable };

/**
 * Selects the best available discovery provider.
 * GeminiDiscoveryProvider can be registered here without changing callers.
 */
function getPreferredDiscoveryProvider(): IDiscoveryProvider {
  if (isOpenAiDiscoveryAvailable()) {
    return openAiDiscoveryProvider;
  }
  return ruleBasedAiDiscoveryProvider;
}

export async function discoverProjectWithPreferredProvider(
  context: DiscoveryRunContext
): Promise<DiscoveryRunOutcome> {
  return getPreferredDiscoveryProvider().discoverProject(context);
}
