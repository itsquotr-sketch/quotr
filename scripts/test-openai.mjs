#!/usr/bin/env node
/**
 * Verifies OPENAI_API_KEY from .env.local.
 *
 * Usage: npm run test:openai
 *
 * Optional in .env.local:
 *   OPENAI_TEST_MODEL=gpt-4o-mini
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import OpenAI from "openai";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

function loadEnvLocal() {
  const envPath = resolve(root, ".env.local");
  if (!existsSync(envPath)) {
    console.error("Missing .env.local — add OPENAI_API_KEY=sk-...");
    process.exit(1);
  }
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvLocal();

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  console.error("OPENAI_API_KEY is not set in .env.local");
  process.exit(1);
}

const model = process.env.OPENAI_TEST_MODEL ?? "gpt-4o-mini";
const openai = new OpenAI({ apiKey });

console.log(`Testing OpenAI (model: ${model})…\n`);

try {
  const response = await openai.responses.create({
    model,
    input: "write a haiku about ai",
    store: false,
  });

  const text =
    response.output_text ??
    response.output
      ?.flatMap((item) =>
        item.type === "message"
          ? item.content
              .filter((part) => part.type === "output_text")
              .map((part) => part.text)
          : []
      )
      .join("\n");

  if (!text?.trim()) {
    console.error("OpenAI responded but output_text was empty.");
    console.error(JSON.stringify(response, null, 2));
    process.exit(1);
  }

  console.log("Success — OpenAI is configured correctly:\n");
  console.log(text.trim());
  console.log("\nProject Assistant will use AI discovery when you analyse notes.");
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error("OpenAI test failed:", message);
  if (message.includes("model") || message.includes("404")) {
    console.error(
      "\nTip: set OPENAI_TEST_MODEL=gpt-4o-mini in .env.local if your account does not have the requested model."
    );
  }
  process.exit(1);
}
