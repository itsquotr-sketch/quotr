import OpenAI from "openai";
import { env } from "@/lib/env";

/** Default discovery model — override with OPENAI_DISCOVERY_MODEL in .env.local */
export const DEFAULT_OPENAI_DISCOVERY_MODEL = "gpt-5-mini";

let client: OpenAI | null = null;

export function getOpenAiDiscoveryModel(): string {
  return env.OPENAI_DISCOVERY_MODEL ?? DEFAULT_OPENAI_DISCOVERY_MODEL;
}

/**
 * Server-side OpenAI client. Never import this from client components.
 * API key is read from OPENAI_API_KEY only — never hardcoded.
 */
export function getOpenAiClient(): OpenAI | null {
  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey) return null;

  if (!client) {
    client = new OpenAI({ apiKey });
  }

  return client;
}

export function isOpenAiConfigured(): boolean {
  return Boolean(env.OPENAI_API_KEY);
}
