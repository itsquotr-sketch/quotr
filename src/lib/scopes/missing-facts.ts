import { getAnswerValue, normalizeQuestionKey } from "@/lib/question-keys";
import type { QualityLevel } from "@/lib/constants/quality-level";
import {
  getAllFactsForScope,
  getScopeByWorkAreaType,
} from "@/lib/scopes/index";
import type { ScopeDefinition, ScopeFactDefinition } from "@/lib/scopes/types";
import { isMaterialFactAnsweredForKey } from "@/lib/scopes/material-categories";
import { getCanonicalScopeTemplateByWorkAreaType } from "@/lib/scopes/templates";
import { getMissingRequiredFactsForWorkArea } from "@/lib/assistant-v2/stages/required-fact-gating";
import { filterMissingFactsForGlobalFinish } from "@/lib/scopes/resolve-effective-finish";
import {
  isAnswered,
  isAnsweredSelect,
  type AnswerInputType,
} from "@/lib/scope-answer-state";

export type FactAnswerContext = {
  answerRaw: string | null;
  answerSource: string | null;
};

export function factIsAnswered(
  fact: ScopeFactDefinition,
  context: FactAnswerContext
): boolean {
  const inputType: AnswerInputType =
    fact.type === "number"
      ? "number"
      : fact.type === "select"
        ? "select"
        : "text";

  if (inputType === "select" && fact.options?.length) {
    return isAnsweredSelect(
      context.answerRaw,
      context.answerSource,
      fact.options
    );
  }

  return isAnswered(context.answerRaw, context.answerSource, {
    inputType,
    requiresPositiveNumber: inputType === "number",
    allowedValues:
      inputType === "select" && fact.options?.length
        ? fact.options.map((o) => o.value)
        : undefined,
  });
}

export function factIsAnsweredFromMap(
  fact: ScopeFactDefinition,
  answers: Record<string, string>
): boolean {
  const value = getAnswerValue(answers, fact.key);
  if (value === undefined || value === null) return false;

  const trimmed = value.trim();
  if (trimmed === "") return false;

  // "Not sure" counts as answered (low confidence, not missing).
  if (trimmed === "unknown") return true;

  if (fact.type === "boolean") {
    const lower = trimmed.toLowerCase();
    return ["yes", "no", "true", "false"].includes(lower);
  }

  if (fact.type === "select" && fact.options?.length) {
    if (fact.options.some((o) => o.value === trimmed)) return true;
    if (isMaterialFactAnsweredForKey(fact.key, trimmed)) return true;
    return false;
  }

  if (fact.type === "number") {
    const num = Number(trimmed);
    if (!Number.isFinite(num)) return false;
    return num > 0;
  }

  return trimmed.length > 0;
}

export function getKnownFactsForScope(
  workAreaTypeKey: string,
  answers: Record<string, string>
): ScopeFactDefinition[] {
  const scope = getScopeByWorkAreaType(workAreaTypeKey);
  if (!scope) return [];
  return getAllFactsForScope(scope).filter((fact) =>
    factIsAnsweredFromMap(fact, answers)
  );
}

/** Required scope facts minus known facts (single source of truth). */
export function getMissingFactsForScope(
  scope: ScopeDefinition,
  knownFacts: Record<string, string>
): ScopeFactDefinition[] {
  return scope.requiredFacts.filter(
    (fact) => !factIsAnsweredFromMap(fact, knownFacts)
  );
}

export function getMissingFactsForWorkArea(
  workAreaTypeKey: string,
  knownFacts: Record<string, string>
): ScopeFactDefinition[] {
  const scope = getScopeByWorkAreaType(workAreaTypeKey);
  if (!scope) return [];
  return getMissingFactsForScope(scope, knownFacts);
}

export function getMissingRequiredFacts(
  workAreaTypeKey: string,
  answers: Record<string, string>,
  options?: { projectQualityLevel?: QualityLevel | string | null }
): ScopeFactDefinition[] {
  return getMissingRequiredFactsForWorkArea(
    workAreaTypeKey,
    answers,
    options
  );
}

export function getMissingOptionalHighImpact(
  workAreaTypeKey: string,
  answers: Record<string, string>,
  options?: { projectQualityLevel?: QualityLevel | string | null }
): ScopeFactDefinition[] {
  const scope = getScopeByWorkAreaType(workAreaTypeKey);
  let missing: ScopeFactDefinition[];

  if (scope) {
    const highImpact = new Set(scope.confidenceRules.highImpactOptionalKeys);
    missing = scope.optionalFacts.filter(
      (fact) =>
        highImpact.has(fact.key) &&
        (fact.affectsEstimate || fact.affectsConfidence) &&
        !factIsAnsweredFromMap(fact, answers)
    );
  } else {
    const canonical = getCanonicalScopeTemplateByWorkAreaType(workAreaTypeKey);
    if (!canonical) return [];

    missing = canonical.facts.useful
      .filter(
        (f) =>
          (f.affectsEstimate ?? true) &&
          !factIsAnsweredFromMap(
            {
              key: f.key,
              label: f.label,
              type: f.type ?? "text",
              unit: f.unit,
              required: false,
              affectsEstimate: f.affectsEstimate ?? true,
              affectsConfidence: f.affectsConfidence ?? true,
              questionText: f.questionText ?? f.label,
              options: f.options,
            },
            answers
          )
      )
      .map((f) => ({
        key: f.key,
        label: f.label,
        type: f.type ?? "text",
        unit: f.unit,
        required: false,
        affectsEstimate: f.affectsEstimate ?? true,
        affectsConfidence: f.affectsConfidence ?? true,
        questionText: f.questionText ?? f.label,
        options: f.options,
      }));
  }

  return filterMissingFactsForGlobalFinish(
    missing,
    workAreaTypeKey,
    answers,
    options?.projectQualityLevel
  );
}

/** Single source: required facts minus known facts (labels only). */
export function buildScopeMissingLabels(
  workAreas: { name: string; workAreaTypeKey: string; answers: Record<string, string> }[]
): string[] {
  const missing: string[] = [];

  for (const area of workAreas) {
    const scope = getScopeByWorkAreaType(area.workAreaTypeKey);
    if (!scope) continue;

    for (const fact of getMissingFactsForScope(scope, area.answers)) {
      missing.push(fact.questionText || fact.label);
    }
  }

  return [...new Set(missing)];
}

/** Optional high-impact gaps for "what would tighten" only. */
export function buildScopeTightenLabels(
  workAreas: { name: string; workAreaTypeKey: string; answers: Record<string, string> }[]
): string[] {
  const items: string[] = [];

  for (const area of workAreas) {
    if (!getScopeByWorkAreaType(area.workAreaTypeKey)) continue;

    for (const fact of getMissingOptionalHighImpact(
      area.workAreaTypeKey,
      area.answers
    )) {
      items.push(fact.questionText || fact.label);
    }
  }

  return [...new Set(items)];
}

export function questionKeyMatchesScopeFact(
  questionKey: string | null | undefined,
  workAreaTypeKey: string
): boolean {
  const key = normalizeQuestionKey(questionKey);
  if (!key) return false;
  const scope = getScopeByWorkAreaType(workAreaTypeKey);
  if (!scope) return false;
  return getAllFactsForScope(scope).some((f) => f.key === key);
}

export function isScopeSupportedWorkArea(workAreaTypeKey: string): boolean {
  return Boolean(getScopeByWorkAreaType(workAreaTypeKey));
}

export function isFactKnownForScope(
  workAreaTypeKey: string,
  questionKey: string | null | undefined,
  answers: Record<string, string>
): boolean {
  const key = normalizeQuestionKey(questionKey);
  if (!key) return false;
  const scope = getScopeByWorkAreaType(workAreaTypeKey);
  if (!scope) return false;
  const fact = getAllFactsForScope(scope).find((f) => f.key === key);
  if (!fact) return false;
  return factIsAnsweredFromMap(fact, answers);
}
