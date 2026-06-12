import type { DiscoveryResult } from "@/lib/ai/discovery/types";
import { resolveWorkAreaTypeKey } from "@/lib/project-assistant-questions";
import type { ScopeQuestionWithAnswers } from "@/lib/project-assistant-data";
import { normalizeQuestionKey } from "@/lib/question-keys";
import { answerValueToString } from "@/lib/scope-answer-state";

export function buildMergedAnswersForScope(
  scopeId: string,
  scopeName: string,
  scopeTypeName: string | null,
  scopeQuestions: ScopeQuestionWithAnswers[],
  discovery: DiscoveryResult | null
): Record<string, string> {
  const typeKey = resolveWorkAreaTypeKey(scopeTypeName, scopeName);
  const answers: Record<string, string> = {};

  for (const q of scopeQuestions.filter((sq) => sq.project_scope_id === scopeId)) {
    const row = q.scope_answers?.[0];
    const val = answerValueToString(row?.answer, row?.source);
    if (q.question_key && val) answers[q.question_key] = val;
  }

  if (discovery?.facts.length) {
    for (const fact of discovery.facts) {
      if (fact.workAreaTypeKey && fact.workAreaTypeKey !== typeKey) continue;
      const key = normalizeQuestionKey(fact.key);
      if (key && !answers[key] && fact.value != null) {
        answers[key] = String(fact.value);
      }
    }
  }

  return answers;
}
