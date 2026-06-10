export type {
  DiscoveryProvider,
} from "@/lib/ai/discovery/discovery-provider";
export type {
  DiscoveryRisk,
  DiscoveryRunContext,
  DiscoveryRunOutcome,
  DiscoveryRunResult,
  DiscoveryProviderMeta,
} from "@/lib/ai/discovery/types";
export {
  DISCOVERY_PROMPT_VERSION,
  DISCOVERY_V1_SYSTEM_PROMPT,
  buildDiscoveryUserPrompt,
} from "@/lib/ai/discovery/prompts";
export {
  aiDiscoveryOutputSchema,
  parseAiDiscoveryOutput,
  safeParseAiDiscoveryOutput,
} from "@/lib/ai/discovery/parse-discovery-output";
export {
  OpenAiDiscoveryProvider,
  openAiDiscoveryProvider,
  discoverProjectWithPreferredProvider,
  isOpenAiDiscoveryAvailable,
} from "@/lib/ai/discovery/openai-discovery-provider";
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
