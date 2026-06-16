import { getAnswerValue } from "@/lib/question-keys";
import {
  isDiscoverySource,
  isUserConfirmedSource,
  parseScopeAnswer,
} from "@/lib/scope-answer-format";
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

  if (row?.answer) {
    const parsedSource =
      parseScopeAnswer(row.answer, row.source)?.source ?? row.source;
    if (parsedSource && isDiscoverySource(parsedSource)) {
      return "assumed";
    }
    if (isUserConfirmedSource(parsedSource ?? row.source)) {
      return "confirmed";
    }
    return "confirmed";
  }

  const typeKey = resolveWorkAreaTypeKey(scopeTypeName, scopeName);
  const hasDiscoveryFact = discovery?.facts?.some(
    (f) =>
      normalizeQuestionKey(f.key) === fact.key &&
      (!f.workAreaTypeKey || f.workAreaTypeKey === typeKey)
  );

  if (hasDiscoveryFact) {
    return "assumed";
  }

  return "assumed";
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
