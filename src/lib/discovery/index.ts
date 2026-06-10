import type { DiscoveryProvider } from "@/lib/discovery/provider";
import { ruleBasedDiscoveryProvider } from "@/lib/discovery/rule-based-provider";
import type { DiscoveryProviderId } from "@/lib/discovery/types";

export type { DiscoveryProvider } from "@/lib/discovery/provider";
export type {
  DiscoveryConstraint,
  DiscoveryFact,
  DiscoveryQuestion,
  DiscoveryResult,
  DiscoveryTrade,
  DiscoveryWorkArea,
  DiscoveryProviderId,
} from "@/lib/discovery/types";
export {
  RuleBasedDiscoveryProvider,
  ruleBasedDiscoveryProvider,
  buildDiscoveryQuestionsAndTrades,
  RULE_BASED_DISCOVERY_VERSION,
} from "@/lib/discovery/rule-based-provider";

/**
 * Returns the active discovery provider.
 *
 * Future OpenAI integration:
 * - Add OpenAIDiscoveryProvider implementing DiscoveryProvider
 * - Select via env var e.g. DISCOVERY_PROVIDER=openai
 * - OpenAI provider receives sourceNotes, returns same DiscoveryResult shape
 */
export function getDiscoveryProvider(
  providerId: DiscoveryProviderId = "rule-based"
): DiscoveryProvider {
  switch (providerId) {
    case "rule-based":
      return ruleBasedDiscoveryProvider;
    case "openai":
      // Placeholder — implement OpenAIDiscoveryProvider in openai-provider.ts
      throw new Error(
        "OpenAI discovery provider is not implemented yet. Use rule-based."
      );
    default:
      return ruleBasedDiscoveryProvider;
  }
}

/**
 * Default provider for production use until OpenAI is enabled.
 */
export function getDefaultDiscoveryProvider(): DiscoveryProvider {
  const envProvider = process.env.DISCOVERY_PROVIDER as
    | DiscoveryProviderId
    | undefined;

  if (envProvider === "openai") {
    return getDiscoveryProvider("openai");
  }

  return getDiscoveryProvider("rule-based");
}
