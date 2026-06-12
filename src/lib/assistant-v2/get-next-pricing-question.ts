import { buildMergedAnswersForScope } from "@/lib/assistant-v2/build-merged-answers";
import type { DiscoveryResult } from "@/lib/ai/discovery/types";
import {
  resolveQuestionDef,
  resolveWorkAreaTypeKey,
} from "@/lib/project-assistant-questions";
import type { ScopeQuestionWithAnswers } from "@/lib/project-assistant-data";
import {
  getScopeByWorkAreaType,
  isFactKnownForScope,
  questionKeyMatchesScopeFact,
} from "@/lib/scopes";
import { normalizeQuestionKey } from "@/lib/question-keys";
import {
  isTemplateAffectsEstimateQuestion,
  isTemplateRequiredQuestion,
} from "@/lib/scope-templates";
import { isAnswered } from "@/lib/scope-answer-state";

export type PricingQuestion = {
  questionId: string;
  questionKey: string;
  questionText: string;
  scopeId: string;
  scopeName: string;
  workAreaTypeKey: string;
  inputType: "text" | "number" | "select" | "boolean";
  options: { value: string; label: string }[];
  required: boolean;
  unit?: string;
  placeholder?: string;
};

export type ScopeGroupInput = {
  scopeId: string;
  scopeName: string;
  scopeTypeName: string | null;
  questions: ScopeQuestionWithAnswers[];
};

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

function questionBelongsInFlow(
  question: ScopeQuestionWithAnswers,
  typeKey: string
): boolean {
  if (getScopeByWorkAreaType(typeKey)) {
    return questionKeyMatchesScopeFact(question.question_key, typeKey);
  }
  return (
    isTemplateRequiredQuestion(typeKey, question.question_key) ||
    isTemplateAffectsEstimateQuestion(typeKey, question.question_key)
  );
}

function isRequiredFact(
  question: ScopeQuestionWithAnswers,
  typeKey: string
): boolean {
  const key = normalizeQuestionKey(question.question_key);
  const scope = getScopeByWorkAreaType(typeKey);
  if (scope && key) {
    return scope.requiredFacts.some((f) => f.key === key);
  }
  return isTemplateRequiredQuestion(typeKey, question.question_key);
}

function isKnownQuestion(
  question: ScopeQuestionWithAnswers,
  typeKey: string,
  mergedAnswers: Record<string, string>
): boolean {
  const row = question.scope_answers?.[0];
  const def = resolveQuestionDef(question, typeKey);
  const inputType = question.question_type ?? def?.inputType ?? "text";
  const options = parseSelectOptions(question, def);

  if (
    isAnswered(row?.answer, row?.source, {
      inputType: inputType as "text" | "number" | "select" | "boolean",
      requiresPositiveNumber: inputType === "number",
      allowedValues:
        inputType === "select" && options.length > 0
          ? options.map((o) => o.value)
          : undefined,
    })
  ) {
    return true;
  }

  return isFactKnownForScope(typeKey, question.question_key, mergedAnswers);
}

function toPricingQuestion(
  question: ScopeQuestionWithAnswers,
  group: ScopeGroupInput,
  required: boolean
): PricingQuestion | null {
  const typeKey = resolveWorkAreaTypeKey(group.scopeTypeName, group.scopeName);
  const def = resolveQuestionDef(question, typeKey);
  const key = normalizeQuestionKey(question.question_key);
  if (!key) return null;

  return {
    questionId: question.id,
    questionKey: key,
    questionText: question.question,
    scopeId: group.scopeId,
    scopeName: group.scopeName,
    workAreaTypeKey: typeKey,
    inputType: (question.question_type ??
      def?.inputType ??
      "text") as PricingQuestion["inputType"],
    options: parseSelectOptions(question, def),
    required,
    unit: question.unit ?? def?.unit,
    placeholder: def?.placeholder,
  };
}

const MAX_BATCH_QUESTIONS = 3;

function questionPriority(questionKey: string, inputType: string): number {
  const key = questionKey.toLowerCase();
  if (
    inputType === "number" ||
    key.includes("area") ||
    key.includes("length") ||
    key.includes("quantity") ||
    key.includes("_m2") ||
    key.includes("_m")
  ) {
    return 100;
  }
  if (key.includes("material")) return 70;
  if (key.includes("access") || key.includes("level_type")) return 50;
  if (key.includes("finish")) return 30;
  return 60;
}

type RankedQuestion = PricingQuestion & { priority: number };

function interleaveByScope(questions: RankedQuestion[], maxCount: number): PricingQuestion[] {
  const byScope = new Map<string, RankedQuestion[]>();
  for (const q of questions) {
    const list = byScope.get(q.scopeId) ?? [];
    list.push(q);
    byScope.set(q.scopeId, list);
  }

  for (const list of byScope.values()) {
    list.sort((a, b) => b.priority - a.priority);
  }

  const scopeIds = [...byScope.keys()];
  const result: PricingQuestion[] = [];
  let round = 0;

  while (result.length < maxCount && scopeIds.length > 0) {
    let added = false;
    for (const scopeId of scopeIds) {
      const list = byScope.get(scopeId);
      const item = list?.[round];
      if (item) {
        result.push(item);
        added = true;
        if (result.length >= maxCount) break;
      }
    }
    if (!added) break;
    round += 1;
  }

  return result;
}

function collectRankedQuestions(
  input: {
    scopeGroups: ScopeGroupInput[];
    discovery: DiscoveryResult | null;
    scopeQuestions: ScopeQuestionWithAnswers[];
    answeredQuestionKeys?: Set<string>;
  },
  requiredOnly: boolean
): RankedQuestion[] {
  const questions: RankedQuestion[] = [];
  const answered = input.answeredQuestionKeys ?? new Set<string>();

  for (const group of input.scopeGroups) {
    const typeKey = resolveWorkAreaTypeKey(group.scopeTypeName, group.scopeName);
    const merged = buildMergedAnswersForScope(
      group.scopeId,
      group.scopeName,
      group.scopeTypeName,
      input.scopeQuestions,
      input.discovery
    );

    for (const question of group.questions) {
      if (!questionBelongsInFlow(question, typeKey)) continue;
      const isRequired = isRequiredFact(question, typeKey);
      if (requiredOnly && !isRequired) continue;
      if (!requiredOnly && isRequired) continue;

      if (!requiredOnly) {
        const scope = getScopeByWorkAreaType(typeKey);
        if (!scope) continue;
        const key = normalizeQuestionKey(question.question_key);
        const highImpact = new Set(scope.confidenceRules.highImpactOptionalKeys);
        if (!key || !highImpact.has(key)) continue;
      }

      const key = normalizeQuestionKey(question.question_key);
      if (key && answered.has(key)) continue;
      if (isKnownQuestion(question, typeKey, merged)) continue;

      const pq = toPricingQuestion(question, group, requiredOnly);
      if (!pq) continue;

      questions.push({
        ...pq,
        priority: questionPriority(pq.questionKey, pq.inputType),
      });
    }
  }

  questions.sort((a, b) => b.priority - a.priority);
  return questions;
}

export function getNextPricingQuestions(
  input: {
    scopeGroups: ScopeGroupInput[];
    discovery: DiscoveryResult | null;
    scopeQuestions: ScopeQuestionWithAnswers[];
    answeredQuestionKeys?: Set<string>;
  },
  maxCount = MAX_BATCH_QUESTIONS
): PricingQuestion[] {
  const required = collectRankedQuestions(input, true);
  if (required.length > 0) {
    return interleaveByScope(required, maxCount);
  }

  const optional = collectRankedQuestions(input, false);
  return interleaveByScope(optional, maxCount);
}

export function getNextPricingQuestion(input: {
  scopeGroups: ScopeGroupInput[];
  discovery: DiscoveryResult | null;
  scopeQuestions: ScopeQuestionWithAnswers[];
}): PricingQuestion | null {
  for (const group of input.scopeGroups) {
    const typeKey = resolveWorkAreaTypeKey(group.scopeTypeName, group.scopeName);
    const merged = buildMergedAnswersForScope(
      group.scopeId,
      group.scopeName,
      group.scopeTypeName,
      input.scopeQuestions,
      input.discovery
    );

    for (const question of group.questions) {
      if (!questionBelongsInFlow(question, typeKey)) continue;
      if (!isRequiredFact(question, typeKey)) continue;
      if (isKnownQuestion(question, typeKey, merged)) continue;
      return toPricingQuestion(question, group, true);
    }
  }

  for (const group of input.scopeGroups) {
    const typeKey = resolveWorkAreaTypeKey(group.scopeTypeName, group.scopeName);
    const scope = getScopeByWorkAreaType(typeKey);
    if (!scope) continue;

    const merged = buildMergedAnswersForScope(
      group.scopeId,
      group.scopeName,
      group.scopeTypeName,
      input.scopeQuestions,
      input.discovery
    );

    const highImpact = new Set(scope.confidenceRules.highImpactOptionalKeys);

    for (const question of group.questions) {
      if (!questionBelongsInFlow(question, typeKey)) continue;
      if (isRequiredFact(question, typeKey)) continue;
      const key = normalizeQuestionKey(question.question_key);
      if (!key || !highImpact.has(key)) continue;
      if (isKnownQuestion(question, typeKey, merged)) continue;
      return toPricingQuestion(question, group, false);
    }
  }

  return null;
}

export function countMissingPricingQuestions(input: {
  scopeGroups: ScopeGroupInput[];
  discovery: DiscoveryResult | null;
  scopeQuestions: ScopeQuestionWithAnswers[];
}): number {
  let count = 0;
  const seen = new Set<string>();

  for (const group of input.scopeGroups) {
    const typeKey = resolveWorkAreaTypeKey(group.scopeTypeName, group.scopeName);
    const merged = buildMergedAnswersForScope(
      group.scopeId,
      group.scopeName,
      group.scopeTypeName,
      input.scopeQuestions,
      input.discovery
    );

    for (const question of group.questions) {
      if (!questionBelongsInFlow(question, typeKey)) continue;
      if (isKnownQuestion(question, typeKey, merged)) continue;
      const key = question.id;
      if (seen.has(key)) continue;
      seen.add(key);
      count++;
    }
  }

  return count;
}
