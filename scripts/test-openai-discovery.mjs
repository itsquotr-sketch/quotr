#!/usr/bin/env node
/**
 * Integration test for OpenAI discovery on retaining wall notes.
 *
 * Usage: npm run test:openai-discovery
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import OpenAI from "openai";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const TEST_NOTES =
  "Need a 15m retaining wall, 3m high, tight access.";

function loadEnvLocal() {
  const envPath = resolve(root, ".env.local");
  if (!existsSync(envPath)) {
    console.error("Missing .env.local");
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

function includesAny(haystack, needles) {
  const lower = haystack.toLowerCase();
  return needles.some((n) => lower.includes(n.toLowerCase()));
}

loadEnvLocal();

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  console.error("OPENAI_API_KEY not set in .env.local");
  process.exit(1);
}

const model = process.env.OPENAI_DISCOVERY_MODEL ?? "gpt-5-mini";
const openai = new OpenAI({ apiKey });

const prompt = `You are Quotr discovery. Return ONLY valid JSON matching this schema:
{
  "workAreas": [{ "key": "retaining_wall", "name": "Retaining Wall", "type": "retaining_wall", "description": "...", "confidence": 0.9 }],
  "facts": [{ "workAreaKey": "retaining_wall", "key": "retaining_wall.length_m", "label": "Length", "value": 15, "unit": "m", "confidence": 0.9 }],
  "questions": [{ "workAreaKey": "retaining_wall", "key": "retaining_wall.has_drainage", "question": "Is drainage required?", "questionType": "select", "required": false }],
  "constraints": [{ "key": "tight_access", "label": "Tight access", "value": true, "confidence": 0.9 }],
  "trades": [{ "trade": "Builder", "workAreaKey": "retaining_wall" }],
  "risks": [],
  "assumptions": ["Draft only"],
  "confidence": 0.85
}

NOTES:
${TEST_NOTES}`;

console.log(`[test] model: ${model}`);
console.log(`[test] notes: ${TEST_NOTES}\n`);

const startedAt = Date.now();

try {
  const response = await openai.responses.create({
    model,
    input: prompt,
    store: false,
  });

  const durationMs = Date.now() - startedAt;
  const text = response.output_text?.trim();
  if (!text) {
    console.error("Empty response");
    process.exit(1);
  }

  const parsed = JSON.parse(text);
  const checks = [];

  const workAreaNames = (parsed.workAreas ?? []).map((w) => w.name ?? w.type);
  checks.push({
    label: "Work area: Retaining Wall",
    pass: workAreaNames.some((n) => includesAny(String(n), ["retaining"])),
  });

  const facts = parsed.facts ?? [];
  checks.push({
    label: "Fact: length 15",
    pass: facts.some(
      (f) =>
        String(f.key).includes("length") &&
        (f.value === 15 || f.value === "15")
    ),
  });
  checks.push({
    label: "Fact: height 3",
    pass: facts.some(
      (f) =>
        String(f.key).includes("height") &&
        (f.value === 3 || f.value === "3")
    ),
  });

  const questions = parsed.questions ?? [];
  checks.push({
    label: "Questions include drainage",
    pass: questions.some((q) => includesAny(String(q.key), ["drainage"])),
  });
  checks.push({
    label: "At least one scope question for missing facts",
    pass: questions.length >= 1,
  });

  const constraints = parsed.constraints ?? [];
  checks.push({
    label: "Constraint: tight access",
    pass: constraints.some((c) => includesAny(String(c.key), ["tight_access", "tight access"])),
  });

  const trades = parsed.trades ?? [];
  checks.push({
    label: "Trades include builder/earthworks/drainage",
    pass: trades.some((t) =>
      includesAny(String(t.trade ?? t.name ?? ""), [
        "builder",
        "earthworks",
        "drainage",
      ])
    ),
  });

  console.log(`[AI:OPENAI] duration: ${durationMs}ms success: true\n`);
  console.log("Parsed JSON summary:");
  console.log(`  workAreas: ${parsed.workAreas?.length ?? 0}`);
  console.log(`  facts: ${parsed.facts?.length ?? 0}`);
  console.log(`  questions: ${parsed.questions?.length ?? 0}`);
  console.log(`  constraints: ${parsed.constraints?.length ?? 0}`);
  console.log(`  trades: ${parsed.trades?.length ?? 0}\n`);

  let failed = 0;
  for (const check of checks) {
    const icon = check.pass ? "✓" : "✗";
    console.log(`  ${icon} ${check.label}`);
    if (!check.pass) failed++;
  }

  if (failed > 0) {
    console.error(`\n${failed} check(s) failed. Raw output:\n${text}`);
    process.exit(1);
  }

  console.log("\nAll discovery checks passed.");
} catch (error) {
  const durationMs = Date.now() - startedAt;
  console.error(
    `[AI:OPENAI:ERROR] duration: ${durationMs}ms error: ${
      error instanceof Error ? error.message : String(error)
    }`
  );
  if (
    error instanceof Error &&
    (error.message.includes("model") || error.message.includes("404"))
  ) {
    console.error(
      "Tip: set OPENAI_DISCOVERY_MODEL=gpt-4o-mini in .env.local if gpt-5-mini is unavailable."
    );
  }
  process.exit(1);
}
