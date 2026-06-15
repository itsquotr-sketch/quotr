import { applyInferredFacts, shouldSuppressQuestionAfterInference } from "@/lib/assistant-v2/facts/infer-related-facts";
import { shouldSuppressQuestionForDerivedValue } from "@/lib/assistant-v2/facts/measurement-resolver";
import { buildMergedAnswersForScope } from "@/lib/assistant-v2/build-merged-answers";
import {
  getKnownFactsForScope,
  shouldSkipQuestion,
} from "@/lib/assistant-v2/facts/get-known-facts-for-scope";
import type { DiscoveryResult } from "@/lib/ai/discovery/types";
import type { QualityLevel } from "@/lib/constants/quality-level";
import {
  getQuestionDefsForWorkAreaType,
  resolveQuestionDef,
  resolveWorkAreaTypeKey,
} from "@/lib/project-assistant-questions";
import type { ScopeQuestionWithAnswers } from "@/lib/project-assistant-data";
import {
  getScopeByWorkAreaType,
  isFactKnownForScope,
  questionKeyMatchesScopeFact,
} from "@/lib/scopes";
import { getCanonicalScopeTemplateByWorkAreaType } from "@/lib/scopes/templates";
import {
  getMissingRequiredFactsForWorkArea,
  getMissingUsefulFactsForWorkArea,
  isCanonicalRequiredFactKey,
} from "@/lib/assistant-v2/stages/required-fact-gating";
import { normalizeQuestionKey } from "@/lib/question-keys";
import {
  isTemplateAffectsEstimateQuestion,
  isTemplateRequiredQuestion,
} from "@/lib/scope-templates";
import { shouldSkipFinishLevelQuestion } from "@/lib/scopes/resolve-effective-finish";
import { isAnswered } from "@/lib/scope-answer-state";
import { isFactDependencyMet } from "@/lib/assistant-v2/questions/is-fact-dependency-met";

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
  answers?: Record<string, string>;
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
  if (key && isCanonicalRequiredFactKey(typeKey, key)) {
    return true;
  }
  return isTemplateRequiredQuestion(typeKey, question.question_key);
}

function isKnownQuestion(
  question: ScopeQuestionWithAnswers,
  typeKey: string,
  mergedAnswers: Record<string, string>,
  knownFactsInput?: {
    scopeId: string;
    qualityLevel?: QualityLevel;
    selectedConstraintSlugs?: string[];
    discovery: DiscoveryResult | null;
  }
): boolean {
  const key = normalizeQuestionKey(question.question_key);
  const inferredAnswers = applyInferredFacts(mergedAnswers);
  if (key && shouldSuppressQuestionAfterInference(key, inferredAnswers)) {
    return true;
  }
  if (key && shouldSuppressQuestionForDerivedValue(key, inferredAnswers)) {
    return true;
  }

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

  if (isFactKnownForScope(typeKey, question.question_key, mergedAnswers)) {
    return true;
  }

  if (knownFactsInput) {
    const knownFacts = getKnownFactsForScope({
      scopeId: knownFactsInput.scopeId,
      scopeTypeKey: typeKey,
      answers: mergedAnswers,
      discovery: knownFactsInput.discovery,
      qualityLevel: knownFactsInput.qualityLevel,
      selectedConstraintSlugs: knownFactsInput.selectedConstraintSlugs,
    });

    const key = normalizeQuestionKey(question.question_key);
    if (key && knownFacts.facts[key]) {
      return true;
    }

    const scope = getScopeByWorkAreaType(typeKey);
    const fact = scope
      ? [...scope.requiredFacts, ...scope.optionalFacts].find(
          (f) => f.key === key
        )
      : null;
    if (fact && shouldSkipQuestion(knownFacts, fact, mergedAnswers)) {
      return true;
    }
  }

  return false;
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

const MAX_BATCH_QUESTIONS = 8;
const MAX_QUESTIONS_PER_SCOPE = 4;

function questionPriority(
  questionKey: string,
  inputType: string,
  required: boolean,
  workAreaTypeKey: string
): number {
  const key = questionKey.toLowerCase();
  const scope = getScopeByWorkAreaType(workAreaTypeKey);

  if (required) {
    if (
      inputType === "number" ||
      key.includes("area") ||
      key.includes("length") ||
      key.includes("height") ||
      key.includes("quantity")
    ) {
      return 1000;
    }
    if (key.includes("material") || key.includes("type") || key.includes("level")) {
      return 950;
    }
    return 900;
  }

  if (scope?.pricingDrivers) {
    const driverIndex = scope.pricingDrivers.indexOf(questionKey);
    if (driverIndex >= 0) return 800 - driverIndex * 5;
  }

  if (scope?.confidenceRules.highImpactOptionalKeys.includes(questionKey)) {
    const hiIndex = scope.confidenceRules.highImpactOptionalKeys.indexOf(
      questionKey
    );
    return 700 - hiIndex * 5;
  }

  if (
    key.includes("rate") ||
    key.includes("supply") ||
    key.includes("demolition")
  ) {
    return 500;
  }

  if (
    key.includes("access") ||
    key.includes("ground") ||
    key.includes("drainage") ||
    key.includes("carting") ||
    key.includes("spoil")
  ) {
    return 300;
  }

  if (key.includes("finish")) return 200;
  return 250;
}

type RankedQuestion = PricingQuestion & { priority: number };

function shouldAskQuestion(
  questionKey: string,
  typeKey: string,
  mergedAnswers: Record<string, string>
): boolean {
  return isFactDependencyMet(typeKey, questionKey, mergedAnswers);
}

function interleaveByScope(
  questions: RankedQuestion[],
  maxCount: number,
  maxPerScope = MAX_QUESTIONS_PER_SCOPE
): PricingQuestion[] {
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
  const perScopeCount = new Map<string, number>();
  let round = 0;

  while (result.length < maxCount && scopeIds.length > 0) {
    let added = false;
    for (const scopeId of scopeIds) {
      const taken = perScopeCount.get(scopeId) ?? 0;
      if (taken >= maxPerScope) continue;

      const list = byScope.get(scopeId);
      const item = list?.[round];
      if (item) {
        result.push(item);
        perScopeCount.set(scopeId, taken + 1);
        added = true;
        if (result.length >= maxCount) break;
      }
    }
    if (!added) break;
    round += 1;
  }

  return result;
}

function synthesizeQuestionsForGroup(
  group: ScopeGroupInput,
  typeKey: string,
  merged: Record<string, string>,
  requiredOnly: boolean,
  input: {
    qualityLevel?: QualityLevel;
    selectedConstraintSlugs?: string[];
    discovery: DiscoveryResult | null;
    answeredQuestionKeys?: Set<string>;
  }
): RankedQuestion[] {
  const answered = input.answeredQuestionKeys ?? new Set<string>();
  const missingKeys = requiredOnly
    ? new Set(
        getMissingRequiredFactsForWorkArea(typeKey, merged, {
          projectQualityLevel: input.qualityLevel,
        }).map((f) => f.key)
      )
    : new Set(
        getMissingUsefulFactsForWorkArea(typeKey, merged).map((f) => f.key)
      );

  if (missingKeys.size === 0) return [];

  const results: RankedQuestion[] = [];
  for (const def of getQuestionDefsForWorkAreaType(typeKey, group.scopeName)) {
    const key = normalizeQuestionKey(def.key);
    if (!key || !missingKeys.has(key)) continue;
    if (answered.has(key)) continue;
    if (!shouldAskQuestion(key, typeKey, merged)) continue;
    if (
      shouldSkipFinishLevelQuestion({
        factKey: key,
        scopeTypeKey: typeKey,
        answers: merged,
        projectQualityLevel: input.qualityLevel,
      })
    ) {
      continue;
    }
    if (shouldSuppressQuestionAfterInference(key, applyInferredFacts(merged))) continue;
    if (shouldSuppressQuestionForDerivedValue(key, applyInferredFacts(merged))) continue;

    const dbQuestion = group.questions.find(
      (q) => normalizeQuestionKey(q.question_key) === key
    );

    results.push({
      questionId: dbQuestion?.id ?? `synthetic-${group.scopeId}-${key}`,
      questionKey: key,
      questionText: def.text,
      scopeId: group.scopeId,
      scopeName: group.scopeName,
      workAreaTypeKey: typeKey,
      inputType: def.inputType,
      options: def.options ?? [],
      required: requiredOnly,
      unit: def.unit,
      placeholder: def.placeholder,
      priority: questionPriority(key, def.inputType, requiredOnly, typeKey),
    });
  }

  return results;
}

function collectRankedQuestions(
  input: {
    scopeGroups: ScopeGroupInput[];
    discovery: DiscoveryResult | null;
    scopeQuestions: ScopeQuestionWithAnswers[];
    answeredQuestionKeys?: Set<string>;
    qualityLevel?: QualityLevel;
    selectedConstraintSlugs?: string[];
  },
  requiredOnly: boolean
): RankedQuestion[] {
  const questions: RankedQuestion[] = [];
  const answered = input.answeredQuestionKeys ?? new Set<string>();

  for (const group of input.scopeGroups) {
    const typeKey = resolveWorkAreaTypeKey(group.scopeTypeName, group.scopeName);
    const merged = {
      ...buildMergedAnswersForScope(
        group.scopeId,
        group.scopeName,
        group.scopeTypeName,
        input.scopeQuestions,
        input.discovery
      ),
      ...(group.answers ?? {}),
    };

    for (const question of group.questions) {
      if (!questionBelongsInFlow(question, typeKey)) continue;
      const isRequired = isRequiredFact(question, typeKey);
      if (requiredOnly && !isRequired) continue;
      if (!requiredOnly && isRequired) continue;

      if (!requiredOnly) {
        const scope = getScopeByWorkAreaType(typeKey);
        const canonical = getCanonicalScopeTemplateByWorkAreaType(typeKey);
        const key = normalizeQuestionKey(question.question_key);
        if (scope) {
          const highImpact = new Set(scope.confidenceRules.highImpactOptionalKeys);
          if (!key || !highImpact.has(key)) continue;
        } else if (canonical) {
          const usefulKeys = new Set(
            canonical.facts.useful.map((f) => f.key)
          );
          if (!key || !usefulKeys.has(key)) continue;
        } else {
          continue;
        }
      }

      const key = normalizeQuestionKey(question.question_key);
      if (
        key &&
        (answered.has(key) ||
          (question.question_key ? answered.has(question.question_key) : false))
      ) {
        continue;
      }
      if (key && !shouldAskQuestion(key, typeKey, merged)) continue;
      if (requiredOnly && key) {
        const missingKeys = new Set(
          getMissingRequiredFactsForWorkArea(typeKey, merged, {
            projectQualityLevel: input.qualityLevel,
          }).map((f) => f.key)
        );
        if (!missingKeys.has(key)) continue;
      }
      if (
        key &&
        shouldSkipFinishLevelQuestion({
          factKey: key,
          scopeTypeKey: typeKey,
          answers: merged,
          projectQualityLevel: input.qualityLevel,
        })
      ) {
        continue;
      }
      if (
        isKnownQuestion(question, typeKey, merged, {
          scopeId: group.scopeId,
          qualityLevel: input.qualityLevel,
          selectedConstraintSlugs: input.selectedConstraintSlugs,
          discovery: input.discovery,
        })
      ) {
        continue;
      }

      const pq = toPricingQuestion(question, group, requiredOnly);
      if (!pq) continue;

      questions.push({
        ...pq,
        priority: questionPriority(pq.questionKey, pq.inputType, requiredOnly, typeKey),
      });
    }

    const existingKeys = new Set(
      questions
        .filter((q) => q.scopeId === group.scopeId)
        .map((q) => q.questionKey)
    );
    for (const sq of synthesizeQuestionsForGroup(
      group,
      typeKey,
      merged,
      requiredOnly,
      {
        qualityLevel: input.qualityLevel,
        selectedConstraintSlugs: input.selectedConstraintSlugs,
        discovery: input.discovery,
        answeredQuestionKeys: input.answeredQuestionKeys,
      }
    )) {
      if (!existingKeys.has(sq.questionKey)) {
        questions.push(sq);
        existingKeys.add(sq.questionKey);
      }
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
    qualityLevel?: QualityLevel;
    selectedConstraintSlugs?: string[];
  },
  maxCount = MAX_BATCH_QUESTIONS,
  mode: "required_first" | "required_only" | "optional_only" = "required_first"
): PricingQuestion[] {
  if (mode === "optional_only") {
    const optional = collectRankedQuestions(input, false);
    return interleaveByScope(optional, maxCount);
  }

  const required = collectRankedQuestions(input, true);
  if (mode === "required_only" || required.length > 0) {
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
    const merged = {
      ...buildMergedAnswersForScope(
        group.scopeId,
        group.scopeName,
        group.scopeTypeName,
        input.scopeQuestions,
        input.discovery
      ),
      ...(group.answers ?? {}),
    };

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
    const merged = {
      ...buildMergedAnswersForScope(
        group.scopeId,
        group.scopeName,
        group.scopeTypeName,
        input.scopeQuestions,
        input.discovery
      ),
      ...(group.answers ?? {}),
    };

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
