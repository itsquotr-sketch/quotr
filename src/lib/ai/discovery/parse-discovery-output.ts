import { z } from "zod";
import type { ScopeQuestionInputType } from "@/lib/project-assistant-questions";
import { qualityLevelSchema } from "@/lib/constants/quality-level";
import type { DiscoveryRunResult } from "@/lib/ai/discovery/types";
import { DISCOVERY_PROMPT_VERSION } from "@/lib/ai/discovery/prompts";

const workAreaSchema = z.object({
  key: z.string(),
  name: z.string(),
  type: z.string(),
  description: z.string().optional().default(""),
  confidence: z.number().min(0).max(1).optional().default(0.5),
});

const factSchema = z.object({
  workAreaKey: z.string().optional(),
  key: z.string(),
  label: z.string(),
  value: z.union([z.string(), z.number(), z.boolean()]),
  unit: z.string().nullable().optional(),
  confidence: z.number().min(0).max(1).optional().default(0.5),
});

const questionSchema = z.object({
  workAreaKey: z.string(),
  key: z.string(),
  question: z.string(),
  questionType: z
    .enum(["text", "number", "select", "boolean"])
    .optional()
    .default("text"),
  options: z.array(z.string()).optional(),
  required: z.boolean().optional().default(true),
  reason: z.string().optional(),
});

const constraintSchema = z.object({
  key: z.string(),
  label: z.string(),
  value: z.union([z.boolean(), z.string(), z.number()]).optional(),
  unit: z.string().nullable().optional(),
  confidence: z.number().min(0).max(1).optional().default(0.5),
  reason: z.string().optional(),
});

const tradeSchema = z.object({
  trade: z.string(),
  reason: z.string().optional(),
  workAreaKey: z.string().optional(),
});

const riskSchema = z.object({
  title: z.string(),
  description: z.string(),
});

const qualityLevelSchemaAi = z.object({
  value: qualityLevelSchema.default("unknown"),
  confidence: z.number().min(0).max(1).optional().default(0.5),
  reason: z.string().optional().default(""),
});

export const aiDiscoveryOutputSchema = z.object({
  workAreas: z.array(workAreaSchema).default([]),
  facts: z.array(factSchema).default([]),
  questions: z.array(questionSchema).default([]),
  constraints: z.array(constraintSchema).default([]),
  trades: z.array(tradeSchema).default([]),
  risks: z.array(riskSchema).default([]),
  assumptions: z.array(z.string()).default([]),
  qualityLevel: qualityLevelSchemaAi.optional(),
  confidence: z.number().min(0).max(1).optional().default(0.5),
});

export type AiDiscoveryOutput = z.infer<typeof aiDiscoveryOutputSchema>;

const discoveryWorkAreaSchema = z.object({
  typeKey: z.string(),
  name: z.string(),
  description: z.string(),
  locationArea: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  matchedKeywords: z.array(z.string()),
});

const discoveryFactSchema = z.object({
  key: z.string(),
  label: z.string(),
  value: z.string(),
  unit: z.string().optional(),
  workAreaTypeKey: z.string().optional(),
  source: z.literal("notes"),
  confidence: z.number().min(0).max(1),
});

const discoveryQuestionSchema = z.object({
  key: z.string(),
  text: z.string(),
  workAreaTypeKey: z.string(),
  workAreaName: z.string().optional(),
  inputType: z.enum(["text", "number", "select", "boolean"]),
  unit: z.string().optional(),
});

const discoveryConstraintSchema = z.object({
  slug: z.string(),
  label: z.string(),
  workAreaTypeKey: z.string().optional(),
  source: z.enum(["notes", "inferred"]),
  confidence: z.number().min(0).max(1),
});

const discoveryTradeSchema = z.object({
  name: z.string(),
  workAreaTypeKey: z.string(),
});

/** Canonical shape persisted after AI or rule-based discovery. */
export const discoveryResultSchema = z.object({
  workAreas: z.array(discoveryWorkAreaSchema),
  facts: z.array(discoveryFactSchema),
  questions: z.array(discoveryQuestionSchema),
  constraints: z.array(discoveryConstraintSchema),
  trades: z.array(discoveryTradeSchema),
  risks: z.array(riskSchema).optional(),
  assumptions: z.array(z.string()).optional(),
  confidence: z.number().min(0).max(1).optional(),
  qualityLevel: qualityLevelSchemaAi.optional(),
  model: z.string().nullable().optional(),
  promptVersion: z.string().optional(),
});

export type ValidatedDiscoveryResult = z.infer<typeof discoveryResultSchema>;

export function validateDiscoveryResult(
  result: unknown
): { success: true; data: ValidatedDiscoveryResult } | { success: false; error: string } {
  const parsed = discoveryResultSchema.safeParse(result);
  if (!parsed.success) {
    const message = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    return { success: false, error: message || "Invalid discovery result shape." };
  }
  return { success: true, data: parsed.data };
}

const WORK_AREA_TYPE_MAP: Record<string, string> = {
  deck: "Deck",
  bathroom: "Bathroom renovation",
  bathroom_renovation: "Bathroom renovation",
  retaining_wall: "Retaining Wall",
  retaining: "Retaining Wall",
  custom_scope: "Custom Scope",
  custom: "Custom Scope",
};

const CONSTRAINT_KEY_MAP: Record<string, string> = {
  tight_access: "tight-access",
  poor_parking: "poor-parking",
  occupied_house: "occupied-house",
  restricted_working_hours: "restricted-hours",
  restricted_hours: "restricted-hours",
  urgent_turnaround: "urgent-turnaround",
  machine_access_limited: "retaining-machine-access",
  long_carting_distance: "carting-distance",
  carting_distance: "carting-distance",
  engineering_consent_risk: "retaining-engineering-risk",
  rubbish_removal_required: "rubbish-removal-required",
  deck_restricted_access: "deck-restricted-access",
};

function mapWorkAreaType(typeOrKey: string): string {
  const normalised = typeOrKey.toLowerCase().replace(/\s+/g, "_");
  return (
    WORK_AREA_TYPE_MAP[normalised] ??
    WORK_AREA_TYPE_MAP[typeOrKey.toLowerCase()] ??
    typeOrKey
      .split(/[_\s-]+/)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ")
  );
}

function mapConstraintSlug(key: string): string {
  const normalised = key.toLowerCase().replace(/\s+/g, "_");
  return CONSTRAINT_KEY_MAP[normalised] ?? key.replace(/_/g, "-");
}

function mapQuestionInputType(
  questionType: string
): ScopeQuestionInputType {
  if (
    questionType === "text" ||
    questionType === "number" ||
    questionType === "select" ||
    questionType === "boolean"
  ) {
    return questionType;
  }
  return "text";
}

function formatFactValue(value: string | number | boolean): string {
  if (typeof value === "boolean") {
    return value ? "yes" : "no";
  }
  return String(value);
}

export function parseAiDiscoveryOutput(
  raw: unknown,
  model: string | null
): DiscoveryRunResult {
  const parsed = aiDiscoveryOutputSchema.parse(raw);

  const workAreas = parsed.workAreas.map((area) => ({
    typeKey: mapWorkAreaType(area.type || area.key),
    name: area.name,
    description: area.description ?? "",
    locationArea: null,
    confidence: area.confidence ?? 0.5,
    matchedKeywords: [] as string[],
  }));

  const workAreaNameByKey = new Map(
    parsed.workAreas.map((area) => [area.key, area.name])
  );
  const workAreaTypeByKey = new Map(
    parsed.workAreas.map((area) => [
      area.key,
      mapWorkAreaType(area.type || area.key),
    ])
  );

  const facts = parsed.facts.map((fact) => ({
    key: fact.key,
    label: fact.label,
    value: formatFactValue(fact.value),
    unit: fact.unit ?? undefined,
    workAreaTypeKey: fact.workAreaKey
      ? workAreaTypeByKey.get(fact.workAreaKey)
      : undefined,
    source: "notes" as const,
    confidence: fact.confidence ?? 0.5,
  }));

  const factKeys = new Set(
    facts.filter((f) => f.confidence >= 0.7).map((f) => f.key)
  );

  const questions = parsed.questions
    .filter((q) => !factKeys.has(q.key))
    .map((q) => ({
      key: q.key,
      text: q.question,
      workAreaTypeKey:
        workAreaTypeByKey.get(q.workAreaKey) ??
        mapWorkAreaType(q.workAreaKey),
      workAreaName: workAreaNameByKey.get(q.workAreaKey),
      inputType: mapQuestionInputType(q.questionType),
      unit: undefined,
    }));

  const constraints = parsed.constraints
    .filter((c) => c.value !== false)
    .map((c) => ({
      slug: mapConstraintSlug(c.key),
      label: c.label,
      source: "notes" as const,
      confidence: c.confidence ?? 0.5,
    }));

  const trades = parsed.trades.map((trade) => ({
    name: trade.trade,
    workAreaTypeKey: trade.workAreaKey
      ? (workAreaTypeByKey.get(trade.workAreaKey) ??
        mapWorkAreaType(trade.workAreaKey))
      : (workAreas[0]?.typeKey ?? "Custom Scope"),
  }));

  return {
    workAreas,
    facts,
    questions,
    constraints,
    trades,
    risks: parsed.risks,
    assumptions: parsed.assumptions,
    qualityLevel: parsed.qualityLevel
      ? {
          value: parsed.qualityLevel.value,
          confidence: parsed.qualityLevel.confidence ?? 0.5,
          reason: parsed.qualityLevel.reason ?? "",
        }
      : undefined,
    confidence: parsed.confidence ?? 0.5,
    model,
    promptVersion: DISCOVERY_PROMPT_VERSION,
  };
}

export function safeParseAiDiscoveryOutput(
  raw: unknown,
  model: string | null
): { result: DiscoveryRunResult | null; error: string | null } {
  try {
    const payload =
      typeof raw === "string" ? (JSON.parse(raw) as unknown) : raw;
    return { result: parseAiDiscoveryOutput(payload, model), error: null };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Invalid AI discovery JSON.";
    return { result: null, error: message };
  }
}
