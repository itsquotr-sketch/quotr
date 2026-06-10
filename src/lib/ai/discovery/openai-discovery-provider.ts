import { env } from "@/lib/env";
import {
  DISCOVERY_PROMPT_VERSION,
  buildDiscoverySystemPrompt,
  buildDiscoveryUserPrompt,
} from "@/lib/ai/discovery/prompts";
import { safeParseAiDiscoveryOutput } from "@/lib/ai/discovery/parse-discovery-output";
import type { DiscoveryProvider } from "@/lib/ai/discovery/discovery-provider";
import type { DiscoveryRunContext, DiscoveryRunOutcome } from "@/lib/ai/discovery/types";
import {
  buildRuleBasedFallbackOutcome,
  ruleBasedAiDiscoveryProvider,
} from "@/lib/ai/discovery/rule-based-discovery-provider";

const OPENAI_MODEL = "gpt-4o-mini";

type OpenAIChatResponse = {
  choices?: { message?: { content?: string | null } }[];
  error?: { message?: string };
};

export function isOpenAiDiscoveryAvailable(): boolean {
  return Boolean(env.OPENAI_API_KEY);
}

export class OpenAiDiscoveryProvider implements DiscoveryProvider {
  readonly meta = {
    id: "openai",
    label: "AI analysis",
    version: DISCOVERY_PROMPT_VERSION,
  };

  async discoverProject(
    context: DiscoveryRunContext
  ): Promise<DiscoveryRunOutcome> {
    const apiKey = env.OPENAI_API_KEY;
    if (!apiKey) {
      console.warn(
        "[OpenAiDiscoveryProvider] OPENAI_API_KEY missing — using rule-based fallback."
      );
      return buildRuleBasedFallbackOutcome(
        context,
        "OPENAI_API_KEY is not configured."
      );
    }

    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: OPENAI_MODEL,
          temperature: 0.2,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: buildDiscoverySystemPrompt() },
            { role: "user", content: buildDiscoveryUserPrompt(context.inputText) },
          ],
        }),
      });

      const payload = (await response.json()) as OpenAIChatResponse;

      if (!response.ok) {
        const message =
          payload.error?.message ??
          `OpenAI request failed with status ${response.status}.`;
        console.error("[OpenAiDiscoveryProvider] API error:", message);
        return buildRuleBasedFallbackOutcome(context, message);
      }

      const content = payload.choices?.[0]?.message?.content;
      if (!content?.trim()) {
        return buildRuleBasedFallbackOutcome(
          context,
          "OpenAI returned an empty response."
        );
      }

      const { result, error } = safeParseAiDiscoveryOutput(
        content,
        OPENAI_MODEL
      );

      if (!result || error) {
        console.error("[OpenAiDiscoveryProvider] Parse error:", error);
        return buildRuleBasedFallbackOutcome(
          context,
          error ?? "Could not parse AI discovery output."
        );
      }

      return {
        result,
        provider: this.meta,
        usedFallback: false,
        rawOutput: JSON.parse(content) as unknown,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "OpenAI discovery failed.";
      console.error("[OpenAiDiscoveryProvider] Unexpected error:", error);
      return buildRuleBasedFallbackOutcome(context, message);
    }
  }
}

export const openAiDiscoveryProvider = new OpenAiDiscoveryProvider();

export async function discoverProjectWithPreferredProvider(
  context: DiscoveryRunContext
): Promise<DiscoveryRunOutcome> {
  if (isOpenAiDiscoveryAvailable()) {
    return openAiDiscoveryProvider.discoverProject(context);
  }

  return ruleBasedAiDiscoveryProvider.discoverProject(context);
}
