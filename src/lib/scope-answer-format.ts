import { z } from "zod";

export type ScopeAnswerSource = "user" | "discovery";

const scopeAnswerPayloadSchema = z.object({
  value: z.union([z.string(), z.number(), z.boolean()]),
  unit: z.string().optional(),
  source: z.enum(["user", "discovery", "notes"]).optional(),
  updatedAt: z.string().optional(),
});

export type ScopeAnswerPayload = {
  value: string | number | boolean;
  unit?: string;
  source: ScopeAnswerSource;
  updatedAt: string;
};

function normalizeSource(
  source: string | undefined | null
): ScopeAnswerSource {
  if (source === "discovery" || source === "notes") return "discovery";
  return "user";
}

/** Parse stored answer text — supports JSON payload and legacy plain strings. */
export function parseScopeAnswer(
  raw: string | null | undefined,
  rowSource?: string | null
): { value: string; source: ScopeAnswerSource; unit?: string } | null {
  if (!raw?.trim()) return null;

  const trimmed = raw.trim();
  if (trimmed.startsWith("{")) {
    try {
      const parsed = scopeAnswerPayloadSchema.safeParse(JSON.parse(trimmed));
      if (parsed.success) {
        const rawValue = parsed.data.value;
        const value =
          typeof rawValue === "boolean"
            ? rawValue
              ? "yes"
              : "no"
            : String(rawValue).trim();
        if (value === "") return null;
        return {
          value,
          source: normalizeSource(parsed.data.source ?? rowSource),
          unit: parsed.data.unit,
        };
      }
    } catch {
      // fall through to plain string
    }
  }

  return {
    value: trimmed,
    source: normalizeSource(rowSource),
  };
}

export function serializeScopeAnswer(
  value: string,
  options?: { source?: ScopeAnswerSource; unit?: string }
): string {
  const payload: ScopeAnswerPayload = {
    value: value.trim(),
    source: options?.source ?? "user",
    updatedAt: new Date().toISOString(),
    ...(options?.unit ? { unit: options.unit } : {}),
  };
  return JSON.stringify(payload);
}

/** Column value for scope_answers.source — mirrors JSON source. */
export function sourceToColumn(source: ScopeAnswerSource): string {
  return source === "discovery" ? "discovery" : "user";
}

export function isDiscoverySource(source: ScopeAnswerSource | string): boolean {
  return source === "discovery" || source === "notes";
}

/** Read the display value from a stored answer row (safe for client components). */
export function readAnswerValue(
  raw: string | null | undefined,
  rowSource?: string | null
): string {
  return parseScopeAnswer(raw, rowSource)?.value ?? "";
}
