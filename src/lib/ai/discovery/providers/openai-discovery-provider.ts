import {
  APIConnectionError,
  APIError,
  AuthenticationError,
  PermissionDeniedError,
  RateLimitError,
} from "openai";
import { DISCOVERY_PROMPT_VERSION } from "@/lib/ai/discovery/prompts";
import { buildDiscoveryResponsesInput } from "@/lib/ai/discovery/prompts";
import type { IDiscoveryProvider } from "@/lib/ai/discovery/discovery-provider";
import {
  logOpenAiDiscoveryError,
  logOpenAiDiscoverySuccess,
} from "@/lib/ai/discovery/logging";
import { safeParseAiDiscoveryOutput } from "@/lib/ai/discovery/parse-discovery-output";
import {
  buildRuleBasedFallbackOutcome,
} from "@/lib/ai/discovery/rule-based-discovery-provider";
import type {
  DiscoveryProviderError,
  DiscoveryRunContext,
  DiscoveryRunOutcome,
} from "@/lib/ai/discovery/types";
import {
  getOpenAiClient,
  getOpenAiDiscoveryModel,
  isOpenAiConfigured,
} from "@/lib/ai/openai-client";

function extractOutputText(response: {
  output_text?: string | null;
  output?: Array<{
    type: string;
    content?: Array<{ type: string; text?: string }>;
  }>;
}): string {
  if (response.output_text?.trim()) {
    return response.output_text.trim();
  }

  const parts: string[] = [];
  for (const item of response.output ?? []) {
    if (item.type !== "message") continue;
    for (const content of item.content ?? []) {
      if (content.type === "output_text" && content.text) {
        parts.push(content.text);
      }
    }
  }

  return parts.join("\n").trim();
}

function stripJsonFences(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith("```")) {
    return trimmed
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "")
      .trim();
  }
  return trimmed;
}

export function mapOpenAiDiscoveryError(error: unknown): DiscoveryProviderError {
  if (error instanceof AuthenticationError || error instanceof PermissionDeniedError) {
    return {
      success: false,
      provider: "openai",
      error: error.message,
      errorCode: "auth_error",
    };
  }

  if (error instanceof RateLimitError) {
    return {
      success: false,
      provider: "openai",
      error: error.message,
      errorCode: "rate_limit",
    };
  }

  if (error instanceof APIConnectionError) {
    return {
      success: false,
      provider: "openai",
      error: error.message,
      errorCode: "network_error",
    };
  }

  if (error instanceof APIError) {
    const code =
      error.status === 429
        ? "rate_limit"
        : error.status === 401 || error.status === 403
          ? "auth_error"
          : error.status === 402
            ? "quota_error"
            : "api_error";

    return {
      success: false,
      provider: "openai",
      error: error.message,
      errorCode: code,
    };
  }

  const message =
    error instanceof Error ? error.message : "OpenAI discovery failed.";

  return {
    success: false,
    provider: "openai",
    error: message,
    errorCode: "unknown_error",
  };
}

export function isOpenAiDiscoveryAvailable(): boolean {
  return isOpenAiConfigured();
}

export class OpenAiDiscoveryProvider implements IDiscoveryProvider {
  readonly meta = {
    id: "openai",
    label: "AI analysis",
    version: DISCOVERY_PROMPT_VERSION,
  };

  async discoverProject(
    context: DiscoveryRunContext
  ): Promise<DiscoveryRunOutcome> {
    const openai = getOpenAiClient();
    const model = getOpenAiDiscoveryModel();

    if (!openai) {
      console.warn(
        "[AI:OPENAI:ERROR] OPENAI_API_KEY missing — falling back to rule-based discovery."
      );
      return buildRuleBasedFallbackOutcome(
        context,
        "OPENAI_API_KEY is not configured.",
        "openai"
      );
    }

    const startedAt = Date.now();

    try {
      const response = await openai.responses.create({
        model,
        input: buildDiscoveryResponsesInput(context),
        store: false,
      });

      const durationMs = Date.now() - startedAt;
      const usage = response.usage;

      logOpenAiDiscoverySuccess({
        model,
        durationMs,
        inputTokens: usage?.input_tokens,
        outputTokens: usage?.output_tokens,
        totalTokens: usage?.total_tokens,
      });

      const rawText = stripJsonFences(extractOutputText(response));
      if (!rawText) {
        const providerError: DiscoveryProviderError = {
          success: false,
          provider: "openai",
          error: "OpenAI returned an empty response.",
          errorCode: "empty_response",
        };
        logOpenAiDiscoveryError({
          model,
          durationMs,
          error: providerError.error,
          code: providerError.errorCode,
        });
        return buildRuleBasedFallbackOutcome(
          context,
          providerError.error,
          "openai"
        );
      }

      let rawOutput: unknown;
      try {
        rawOutput = JSON.parse(rawText) as unknown;
      } catch {
        const providerError: DiscoveryProviderError = {
          success: false,
          provider: "openai",
          error: "OpenAI response was not valid JSON.",
          errorCode: "invalid_json",
        };
        logOpenAiDiscoveryError({
          model,
          durationMs,
          error: providerError.error,
          code: providerError.errorCode,
        });
        return buildRuleBasedFallbackOutcome(
          context,
          providerError.error,
          "openai"
        );
      }

      const { result, error } = safeParseAiDiscoveryOutput(rawOutput, model);

      if (!result || error) {
        logOpenAiDiscoveryError({
          model,
          durationMs,
          error: error ?? "Zod validation failed.",
          code: "validation_error",
        });
        return buildRuleBasedFallbackOutcome(
          context,
          error ?? "Could not parse AI discovery output.",
          "openai"
        );
      }

      return {
        result,
        provider: this.meta,
        usedFallback: false,
        rawOutput,
      };
    } catch (error) {
      const durationMs = Date.now() - startedAt;
      const providerError = mapOpenAiDiscoveryError(error);

      logOpenAiDiscoveryError({
        model,
        durationMs,
        error: providerError.error,
        code: providerError.errorCode,
      });

      return buildRuleBasedFallbackOutcome(
        context,
        providerError.error,
        "openai"
      );
    }
  }
}

export const openAiDiscoveryProvider = new OpenAiDiscoveryProvider();
