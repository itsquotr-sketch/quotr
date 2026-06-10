import {
  parseScopeAnswer,
  type ScopeAnswerSource,
} from "@/lib/scope-answer-format";
import { getAnswerValue } from "@/lib/question-keys";

export type AnswerInputType = "text" | "number" | "select" | "boolean";

export type AnswerCheckContext = {
  inputType?: AnswerInputType;
  /** When true (default for number/dimension keys), zero and negative are invalid. */
  requiresPositiveNumber?: boolean;
  allowedValues?: string[];
};

/** Normalise stored answer to a string value, preserving false/no/0. */
export function answerValueToString(
  raw: string | null | undefined,
  rowSource?: string | null
): string | null {
  const parsed = parseScopeAnswer(raw, rowSource);
  if (!parsed) return null;
  const value = parsed.value;
  return value === "" ? null : value;
}

/**
 * Returns true when a scope answer is present and valid.
 * Does not use truthiness — handles false, 0, "no", and jsonb payloads.
 */
export function isAnswered(
  answerRaw: string | null | undefined,
  rowSource?: string | null,
  context?: AnswerCheckContext
): boolean {
  const value = answerValueToString(answerRaw, rowSource);
  if (value === null) return false;

  const inputType = context?.inputType;
  const requiresPositive =
    context?.requiresPositiveNumber ??
    (inputType === "number" ? true : false);

  if (requiresPositive || inputType === "number") {
    const num = Number(value);
    if (!Number.isFinite(num)) return false;
    if (requiresPositive && num <= 0) return false;
    return true;
  }

  if (inputType === "boolean") {
    const lower = value.toLowerCase();
    return (
      lower === "yes" ||
      lower === "no" ||
      lower === "true" ||
      lower === "false" ||
      lower === "unknown"
    );
  }

  if (context?.allowedValues?.length) {
    return context.allowedValues.includes(value);
  }

  return true;
}

export function isAnsweredSelect(
  answerRaw: string | null | undefined,
  rowSource: string | null | undefined,
  options: { value: string }[]
): boolean {
  const allowed = options.map((o) => o.value);
  return isAnswered(answerRaw, rowSource, {
    inputType: "select",
    allowedValues: allowed.length > 0 ? allowed : undefined,
  });
}

export function getAnswerSource(
  answerRaw: string | null | undefined,
  rowSource?: string | null
): ScopeAnswerSource | null {
  const parsed = parseScopeAnswer(answerRaw, rowSource);
  return parsed?.source ?? null;
}

/** True when a positive numeric measurement is available in an answers map. */
export function hasPositiveAnswer(
  answers: Record<string, string>,
  canonicalKey: string
): boolean {
  const value = getAnswerValue(answers, canonicalKey);
  if (value === undefined) return false;
  const num = Number(value);
  if (Number.isFinite(num)) return num > 0;
  return value.trim().length > 0;
}
