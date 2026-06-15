import { getAnswerValue } from "@/lib/question-keys";
import { isDiscoverySource } from "@/lib/scope-answer-format";
import type { ScopeQuestionWithAnswers } from "@/lib/project-assistant-data";
import type { DiscoveryResult } from "@/lib/ai/discovery/types";
import type { ScopeFactDefinition } from "@/lib/scopes/types";
import { resolveWorkAreaTypeKey } from "@/lib/project-assistant-questions";
import { normalizeQuestionKey } from "@/lib/question-keys";
import { factIsAnsweredFromMap } from "@/lib/scopes/missing-facts";
import { formatRateSourceTrustMessage } from "@/lib/assistant-v2/trust-messages";

export type FactConfirmationStatus = "confirmed" | "assumed" | "unknown";

export function getFactConfirmationStatus(
  fact: ScopeFactDefinition,
  answers: Record<string, string>,
  scopeQuestions: ScopeQuestionWithAnswers[],
  scopeId: string,
  discovery: DiscoveryResult | null,
  scopeName: string,
  scopeTypeName: string | null
): FactConfirmationStatus {
  const value = getAnswerValue(answers, fact.key);
  if (!value || !factIsAnsweredFromMap(fact, answers)) {
    return "unknown";
  }

  const question = scopeQuestions.find(
    (q) =>
      q.project_scope_id === scopeId &&
      normalizeQuestionKey(q.question_key) === fact.key
  );
  const row = question?.scope_answers?.[0];
  if (row?.source && isDiscoverySource(row.source)) {
    return "assumed";
  }

  const typeKey = resolveWorkAreaTypeKey(scopeTypeName, scopeName);
  const hasDiscoveryOnly =
    !row?.answer &&
    discovery?.facts?.some(
      (f) =>
        normalizeQuestionKey(f.key) === fact.key &&
        (!f.workAreaTypeKey || f.workAreaTypeKey === typeKey)
    );

  if (hasDiscoveryOnly) {
    return "assumed";
  }

  return row?.answer ? "confirmed" : "assumed";
}

export function formatRateSourceDisclosure(
  rateSourceLines: { rateSource: string }[]
): string | null {
  const message = formatRateSourceTrustMessage(rateSourceLines);
  if (!message) return null;

  if (message.includes("placeholder")) {
    return `${message} — add your rate before relying on this.`;
  }
  return `${message}.`;
}
