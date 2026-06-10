export type { IDiscoveryProvider, DiscoveryProvider } from "@/lib/ai/discovery/discovery-provider";
export type {
  DiscoveryRisk,
  DiscoveryRunContext,
  DiscoveryRunOutcome,
  DiscoveryRunResult,
  DiscoveryProviderMeta,
  DiscoveryProviderError,
  DiscoveryExistingAnswer,
} from "@/lib/ai/discovery/types";
export {
  DISCOVERY_PROMPT_VERSION,
  DISCOVERY_V2_SYSTEM_PROMPT,
  buildDiscoveryUserPrompt,
  buildDiscoverySystemPrompt,
  buildDiscoveryResponsesInput,
} from "@/lib/ai/discovery/prompts";
export {
  aiDiscoveryOutputSchema,
  parseAiDiscoveryOutput,
  safeParseAiDiscoveryOutput,
} from "@/lib/ai/discovery/parse-discovery-output";
export {
  OpenAiDiscoveryProvider,
  openAiDiscoveryProvider,
  isOpenAiDiscoveryAvailable,
  mapOpenAiDiscoveryError,
} from "@/lib/ai/discovery/providers/openai-discovery-provider";
export {
  discoverProjectWithPreferredProvider,
} from "@/lib/ai/discovery/discover-project";
export {
  RuleBasedDiscoveryProvider,
  ruleBasedAiDiscoveryProvider,
  buildRuleBasedFallbackOutcome,
} from "@/lib/ai/discovery/rule-based-discovery-provider";
export {
  runProjectDiscovery,
  type ProjectDiscoveryRunResult,
} from "@/lib/ai/discovery/run-discovery";
export {
  applyDiscoveryResults,
  applyWorkAreaSuggestions,
  syncDiscoveryQuestionsToScopes,
} from "@/lib/ai/discovery/apply-discovery-results";
export { enrichDiscoveryContext } from "@/lib/ai/discovery/build-discovery-context";
