import { extractQualityLevelFromNotes } from "@/lib/discovery/quality-level-rules";
import { ruleBasedDiscoveryProvider } from "@/lib/discovery/rule-based-provider";
import type { DiscoveryProvider } from "@/lib/ai/discovery/discovery-provider";
import type {
  DiscoveryRunContext,
  DiscoveryRunOutcome,
  DiscoveryRunResult,
} from "@/lib/ai/discovery/types";

const RULE_BASED_PROMPT_VERSION = "rule_based_v1";

function toRunResult(
  sourceNotes: string,
  model: string | null = null
): DiscoveryRunResult {
  const result = ruleBasedDiscoveryProvider.discoverProject(sourceNotes);
  const detectedQuality = extractQualityLevelFromNotes(sourceNotes);
  return {
    ...result,
    risks: [],
    assumptions: ["Draft analysis from keyword rules. Site verification required."],
    qualityLevel: detectedQuality ?? undefined,
    confidence: result.workAreas.length > 0 ? 0.55 : 0.35,
    model,
    promptVersion: RULE_BASED_PROMPT_VERSION,
  };
}

export class RuleBasedDiscoveryProvider implements DiscoveryProvider {
  readonly meta = {
    id: "rule_based",
    label: "Basic rules",
    version: ruleBasedDiscoveryProvider.version,
  };

  async discoverProject(
    context: DiscoveryRunContext
  ): Promise<DiscoveryRunOutcome> {
    const result = toRunResult(context.inputText);
    return {
      result,
      provider: this.meta,
      usedFallback: false,
      rawOutput: result,
    };
  }
}

export const ruleBasedAiDiscoveryProvider = new RuleBasedDiscoveryProvider();

export function buildRuleBasedFallbackOutcome(
  context: DiscoveryRunContext,
  reason: string
): DiscoveryRunOutcome {
  return {
    result: toRunResult(context.inputText),
    provider: {
      id: "rule_based",
      label: "Basic rules",
      version: ruleBasedDiscoveryProvider.version,
    },
    usedFallback: true,
    fallbackReason: reason,
    rawOutput: null,
  };
}
