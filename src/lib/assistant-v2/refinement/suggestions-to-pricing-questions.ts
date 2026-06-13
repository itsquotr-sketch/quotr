import type { ScopeRefinementSuggestion } from "@/lib/assistant-v2/refinement/get-scope-refinement-suggestions";
import type { RefinementAnswerQuestion } from "@/lib/assistant-v2/refinement/refinement-batch";
import type { ScopeGroupInput } from "@/lib/assistant-v2/get-next-pricing-question";
import {
  resolveQuestionDef,
  resolveWorkAreaTypeKey,
} from "@/lib/project-assistant-questions";
import type { ScopeQuestionWithAnswers } from "@/lib/project-assistant-data";
import { getScopeByWorkAreaType } from "@/lib/scopes";
import { normalizeQuestionKey } from "@/lib/question-keys";

export const MAX_REFINEMENT_QUESTIONS = 5;

function parseSelectOptions(
  question: ScopeQuestionWithAnswers,
  def: ReturnType<typeof resolveQuestionDef>
): { value: string; label: string }[] {
  if (question.options && Array.isArray(question.options)) {
    return (question.options as { value: string; label: string }[]).filter(
      (o) => o.value && o.label
    );
  }
  return def?.options ?? [];
}

function findScopeQuestion(
  suggestion: ScopeRefinementSuggestion,
  scopeQuestions: ScopeQuestionWithAnswers[]
): ScopeQuestionWithAnswers | undefined {
  const normalizedKey = suggestion.factKey;

  return scopeQuestions.find((q) => {
    if (suggestion.scopeId && q.project_scope_id !== suggestion.scopeId) {
      return false;
    }
    const key = normalizeQuestionKey(q.question_key);
    return key === normalizedKey;
  });
}

function inferInputType(
  factKey: string,
  options: { value: string; label: string }[]
): RefinementAnswerQuestion["inputType"] {
  if (options.length > 0) return "select";
  if (factKey.includes("_m2") || factKey.includes("_m")) return "number";
  return "text";
}

function isAnswerableSuggestion(suggestion: ScopeRefinementSuggestion): boolean {
  return (
    suggestion.factKey !== "contractor_rates" &&
    !suggestion.factKey.startsWith("trace_")
  );
}

/**
 * Converts refinement suggestions into answerable scope questions (max 5 by default).
 */
export function suggestionsToPricingQuestions(
  suggestions: ScopeRefinementSuggestion[],
  scopeGroups: ScopeGroupInput[],
  scopeQuestions: ScopeQuestionWithAnswers[],
  limit = MAX_REFINEMENT_QUESTIONS
): RefinementAnswerQuestion[] {
  const answerable = suggestions.filter(isAnswerableSuggestion);

  const questions: RefinementAnswerQuestion[] = [];

  for (const suggestion of answerable) {
    if (questions.length >= limit) break;

    const scopeQuestion = findScopeQuestion(suggestion, scopeQuestions);
    if (!scopeQuestion) continue;

    const group = scopeGroups.find(
      (g) => g.scopeId === scopeQuestion.project_scope_id
    );
    if (!group) continue;

    const typeKey = resolveWorkAreaTypeKey(group.scopeTypeName, group.scopeName);
    const def = resolveQuestionDef(scopeQuestion, typeKey);
    const key = normalizeQuestionKey(scopeQuestion.question_key);
    if (!key) continue;

    const options =
      suggestion.answerOptions && suggestion.answerOptions.length > 0
        ? suggestion.answerOptions
        : parseSelectOptions(scopeQuestion, def);

    const scopeDef = getScopeByWorkAreaType(typeKey);
    const factDef = scopeDef
      ? [...scopeDef.requiredFacts, ...scopeDef.optionalFacts].find(
          (f) => f.key === key
        )
      : undefined;

    questions.push({
      questionId: scopeQuestion.id,
      questionKey: key,
      questionText: suggestion.question || scopeQuestion.question,
      scopeId: group.scopeId,
      scopeName: group.scopeName,
      workAreaTypeKey: typeKey,
      inputType: inferInputType(key, options),
      options,
      required: suggestion.required ?? factDef?.required ?? false,
      unit: scopeQuestion.unit ?? def?.unit ?? factDef?.unit,
      placeholder: def?.placeholder ?? factDef?.placeholder,
    });
  }

  return questions;
}

/** Count suggestions that can become inline answer fields (excludes rates/trace). */
export function countAnswerableSuggestions(
  suggestions: ScopeRefinementSuggestion[]
): number {
  return suggestions.filter(isAnswerableSuggestion).length;
}
