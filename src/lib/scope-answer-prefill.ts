import type { DiscoveryFact } from "@/lib/discovery/types";
import {
  findQuestionDefByKey,
} from "@/lib/project-assistant-questions";

/** Normalise a fact value to the answer format stored in scope_answers. */
export function factValueToAnswer(
  questionKey: string,
  factValue: string,
  workAreaTypeKey: string
): string {
  const def = findQuestionDefByKey(questionKey, workAreaTypeKey);
  const raw = factValue.replace(/\s*(m²|m2|sqm|m|metres?)\s*$/i, "").trim();

  if (def?.inputType === "number") {
    const num = Number(raw);
    return Number.isFinite(num) ? String(num) : raw;
  }

  if (def?.inputType === "select") {
    const lower = raw.toLowerCase();
    if (lower === "yes" || lower === "no" || lower === "unknown") return lower;
    if (def.options?.some((o) => o.value === lower)) return lower;
    if (/elevated|raised/i.test(raw)) return "elevated";
    if (/ground/i.test(raw)) return "ground";
    if (/full/i.test(raw)) return "full";
    if (/partial/i.test(raw)) return "partial";
    if (/timber/i.test(raw)) return "timber";
    if (/composite/i.test(raw)) return "composite";
    return "yes";
  }

  return raw;
}

/** @deprecated Use syncDiscoveryFactsToScopeAnswers */
export type { DiscoveryFact };
