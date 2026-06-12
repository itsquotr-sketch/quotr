import type { DiscoveryResult } from "@/lib/ai/discovery/types";
import { buildAnswersMap } from "@/lib/cost-engine/quick-estimate-input";
import { getAnswerValue, normalizeQuestionKey } from "@/lib/question-keys";
import { factValueToAnswer } from "@/lib/scope-answer-prefill";
import {
  isAnswered,
  type AnswerInputType,
} from "@/lib/scope-answer-state";
import type { ScopeQuestionWithAnswers } from "@/lib/project-assistant-data";
import { resolveQuestionDef, resolveWorkAreaTypeKey } from "@/lib/project-assistant-questions";
import {
  factIsAnsweredFromMap,
  getKnownFactsForScope,
} from "@/lib/scopes/missing-facts";
import { getScopeByWorkAreaType } from "@/lib/scopes/index";

/**
 * Build merged answers map: saved answers win, then discovery facts fill gaps.
 */
export function buildKnownFactsMapForWorkArea(input: {
  scopeQuestions: ScopeQuestionWithAnswers[];
  scopeId: string;
  workAreaTypeKey: string;
  discovery?: DiscoveryResult | null;
}): Record<string, string> {
  const scopeQuestions = input.scopeQuestions.filter(
    (q) => q.project_scope_id === input.scopeId
  );
  const { answers, fromNotes } = buildAnswersMap(scopeQuestions);

  if (input.discovery?.facts?.length) {
    for (const q of scopeQuestions) {
      const key = normalizeQuestionKey(q.question_key);
      if (!key) continue;

      const row = q.scope_answers?.[0];
      const def = resolveQuestionDef(q, input.workAreaTypeKey);
      const inputType =
        (q.question_type as AnswerInputType) ?? def?.inputType ?? "text";

      if (
        isAnswered(row?.answer ?? null, row?.source, {
          inputType,
          requiresPositiveNumber: inputType === "number",
        })
      ) {
        continue;
      }

      const fact = input.discovery.facts.find((f) => {
        const factKey = normalizeQuestionKey(f.key);
        if (factKey !== key) return false;
        return (
          !f.workAreaTypeKey || f.workAreaTypeKey === input.workAreaTypeKey
        );
      });

      if (fact && fact.value != null && fact.value !== "") {
        answers[key] = factValueToAnswer(
          key,
          fact.value,
          input.workAreaTypeKey
        );
        if (!fromNotes.includes(key)) fromNotes.push(key);
      }
    }
  }

  return answers;
}

export function buildWorkAreaFactSummary(input: {
  scopeName: string;
  workAreaTypeKey: string;
  knownFacts: Record<string, string>;
}): {
  knownLabels: string[];
  missingLabels: string[];
} {
  const scope = getScopeByWorkAreaType(input.workAreaTypeKey);
  if (!scope) {
    return { knownLabels: [], missingLabels: [] };
  }

  const known = getKnownFactsForScope(input.workAreaTypeKey, input.knownFacts);
  const missing = scope.requiredFacts.filter(
    (fact) => !factIsAnsweredFromMap(fact, input.knownFacts)
  );

  const knownLabels = known.map((fact) => {
    const value = getAnswerValue(input.knownFacts, fact.key) ?? "";
    const unit = fact.unit ? ` ${fact.unit}` : "";
    const label =
      fact.type === "select" && fact.options
        ? (fact.options.find((o) => o.value === value)?.label ?? value)
        : value;
    return `${fact.label}: ${label}${unit}`;
  });

  const missingLabels = missing.map((f) => f.questionText || f.label);

  return {
    knownLabels: [...new Set(knownLabels)],
    missingLabels: [...new Set(missingLabels)],
  };
}

export function resolveWorkAreaTypeKeyFromScope(
  scopeTypeName: string | null | undefined,
  scopeName: string
): string {
  return resolveWorkAreaTypeKey(scopeTypeName, scopeName);
}
