import type { QualityLevel } from "@/lib/constants/quality-level";
import { getTrackableFactsForWorkAreaType } from "@/lib/assistant-v2/discovery/generic-scope-discovery";
import {
  applyInferredFacts,
  shouldSuppressQuestionAfterInference,
} from "@/lib/assistant-v2/facts/infer-related-facts";
import { shouldSuppressQuestionForDerivedValue } from "@/lib/assistant-v2/facts/measurement-resolver";
import { getScopeByWorkAreaType } from "@/lib/scopes";
import { getCanonicalScopeTemplateByWorkAreaType } from "@/lib/scopes/templates";
import { getAnswerValue } from "@/lib/question-keys";
import { isMaterialFactAnsweredForKey } from "@/lib/scopes/material-categories";
import { filterMissingFactsForGlobalFinish } from "@/lib/scopes/resolve-effective-finish";
import type { ScopeFactDefinition } from "@/lib/scopes/types";
import type { CanonicalScopeFactDefinition } from "@/lib/scopes/templates/types";

function factIsAnsweredFromMap(
  fact: ScopeFactDefinition,
  answers: Record<string, string>
): boolean {
  const value = getAnswerValue(answers, fact.key);
  if (value === undefined || value === null) return false;

  const trimmed = value.trim();
  if (trimmed === "") return false;
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

/** One-of groups: satisfied when any member is answered. */
export const REQUIRED_FACT_OR_GROUPS: Record<string, string[][]> = {
  Fence: [["fence.fence_type", "fence.material_type"]],
  fence: [["fence.fence_type", "fence.material_type"]],
};

function canonicalToScopeFact(
  fact: CanonicalScopeFactDefinition,
  required: boolean
): ScopeFactDefinition {
  return {
    key: fact.key,
    label: fact.label,
    type: fact.type ?? "text",
    unit: fact.unit,
    required,
    affectsEstimate: fact.affectsEstimate ?? true,
    affectsConfidence: fact.affectsConfidence ?? true,
    questionText: fact.questionText ?? fact.label,
    options: fact.options,
  };
}

function orGroupSatisfied(
  group: string[],
  answers: Record<string, string>
): boolean {
  return group.some((key) => {
    const fact = resolveFactDefinition(key);
    if (!fact) return false;
    return factIsAnsweredFromMap(fact, answers);
  });
}

function resolveFactDefinition(factKey: string): ScopeFactDefinition | null {
  const prefix = factKey.split(".")[0];
  for (const scope of [getScopeByWorkAreaType("Deck"), getScopeByWorkAreaType("Fence"), getScopeByWorkAreaType("Retaining Wall")]) {
    if (!scope) continue;
    const found = [...scope.requiredFacts, ...scope.optionalFacts].find(
      (f) => f.key === factKey
    );
    if (found) return found;
  }

  for (const template of [
    getCanonicalScopeTemplateByWorkAreaType("Fence"),
    getCanonicalScopeTemplateByWorkAreaType("Deck"),
    getCanonicalScopeTemplateByWorkAreaType("Retaining Wall"),
    getCanonicalScopeTemplateByWorkAreaType("Bathroom renovation"),
    getCanonicalScopeTemplateByWorkAreaType("Kitchen renovation"),
  ]) {
    if (!template) continue;
    const all = [
      ...template.facts.required,
      ...template.facts.useful,
      ...template.facts.optional,
    ];
    const match = all.find((f) => f.key === factKey);
    if (match) {
      return canonicalToScopeFact(
        match,
        template.facts.required.some((r) => r.key === factKey)
      );
    }
  }

  if (prefix) {
    const template = getCanonicalScopeTemplateByWorkAreaType(
      prefix === "fence"
        ? "Fence"
        : prefix === "deck"
          ? "Deck"
          : prefix === "retaining_wall"
            ? "Retaining Wall"
            : prefix
    );
    if (template) {
      const all = [
        ...template.facts.required,
        ...template.facts.useful,
        ...template.facts.optional,
      ];
      const match = all.find((f) => f.key === factKey);
      if (match) {
        return canonicalToScopeFact(
          match,
          template.facts.required.some((r) => r.key === factKey)
        );
      }
    }
  }

  return null;
}

function applyOrGroupFiltering(
  workAreaTypeKey: string,
  missing: ScopeFactDefinition[],
  answers: Record<string, string>
): ScopeFactDefinition[] {
  const groups =
    REQUIRED_FACT_OR_GROUPS[workAreaTypeKey] ??
    REQUIRED_FACT_OR_GROUPS[workAreaTypeKey.toLowerCase()] ??
    [];

  let filtered = [...missing];

  for (const group of groups) {
    if (orGroupSatisfied(group, answers)) {
      filtered = filtered.filter((f) => !group.includes(f.key));
      continue;
    }

    const present = filtered.filter((f) => group.includes(f.key));
    if (present.length > 1) {
      const primary = present.find((f) => f.key.includes("fence_type")) ?? present[0]!;
      filtered = filtered.filter(
        (f) => !group.includes(f.key) || f.key === primary.key
      );
      if (primary.key === "fence.fence_type") {
        filtered = filtered.map((f) =>
          f.key === "fence.fence_type"
            ? {
                ...f,
                label: "Fence type or material",
                questionText: "What type of fence should I assume?",
              }
            : f
        );
      }
    }
  }

  return filtered;
}

export function getRequiredFactsForWorkArea(
  workAreaTypeKey: string
): ScopeFactDefinition[] {
  const scope = getScopeByWorkAreaType(workAreaTypeKey);
  if (scope) {
    return scope.requiredFacts.filter((fact) => fact.required);
  }

  const canonical = getCanonicalScopeTemplateByWorkAreaType(workAreaTypeKey);
  if (canonical) {
    return canonical.facts.required.map((f) => canonicalToScopeFact(f, true));
  }

  return getTrackableFactsForWorkAreaType(workAreaTypeKey)
    .filter((f) => f.required)
    .map((f) => f as ScopeFactDefinition);
}

export function getMissingRequiredFactsForWorkArea(
  workAreaTypeKey: string,
  answers: Record<string, string>,
  options?: { projectQualityLevel?: QualityLevel | string | null }
): ScopeFactDefinition[] {
  const required = getRequiredFactsForWorkArea(workAreaTypeKey);
  const inferredAnswers = applyInferredFacts(answers);

  let missing = required.filter((fact) => {
    if (
      shouldSuppressQuestionAfterInference(fact.key, inferredAnswers) ||
      shouldSuppressQuestionForDerivedValue(fact.key, inferredAnswers)
    ) {
      return false;
    }
    if (
      fact.key === "deck.height_m" &&
      getAnswerValue(inferredAnswers, "deck.level_type") === "ground"
    ) {
      return false;
    }
    if (
      fact.key === "deck.level_type" &&
      shouldSuppressQuestionAfterInference(fact.key, inferredAnswers)
    ) {
      return false;
    }
    return !factIsAnsweredFromMap(fact, inferredAnswers);
  });

  missing = applyOrGroupFiltering(workAreaTypeKey, missing, inferredAnswers);

  return filterMissingFactsForGlobalFinish(
    missing,
    workAreaTypeKey,
    inferredAnswers,
    options?.projectQualityLevel
  );
}

export function getMissingUsefulFactsForWorkArea(
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
          !factIsAnsweredFromMap(canonicalToScopeFact(f, false), answers)
      )
      .map((f) => canonicalToScopeFact(f, false));
  }

  return filterMissingFactsForGlobalFinish(
    missing,
    workAreaTypeKey,
    answers,
    options?.projectQualityLevel
  );
}

export function isCanonicalRequiredFactKey(
  workAreaTypeKey: string,
  factKey: string
): boolean {
  const scope = getScopeByWorkAreaType(workAreaTypeKey);
  if (scope?.requiredFacts.some((f) => f.key === factKey)) return true;

  const canonical = getCanonicalScopeTemplateByWorkAreaType(workAreaTypeKey);
  return canonical?.facts.required.some((f) => f.key === factKey) ?? false;
}

export function buildScopeMissingFactsMessage(
  scopeName: string,
  workAreaTypeKey: string,
  answers: Record<string, string>
): string | null {
  const missing = getMissingRequiredFactsForWorkArea(workAreaTypeKey, answers);
  if (missing.length === 0) return null;

  if (workAreaTypeKey === "Fence") {
    const needsHeight = missing.some((f) => f.key === "fence.height_m");
    const needsType = missing.some(
      (f) => f.key === "fence.fence_type" || f.key === "fence.material_type"
    );
    if (needsHeight && needsType) {
      return `${scopeName} needs height and type before I can include it.`;
    }
    if (needsHeight) {
      return `${scopeName} needs height before I can include it.`;
    }
    if (needsType) {
      return `${scopeName} needs type before I can include it.`;
    }
  }

  const labels = missing.map((f) => f.label.toLowerCase()).join(", ");
  return `${scopeName} needs ${labels} before I can include it.`;
}

export function buildPartialEstimateExclusionMessage(
  scopeName: string,
  workAreaTypeKey: string,
  answers: Record<string, string>,
  pricingUnsupported: boolean
): string {
  const missingMessage = buildScopeMissingFactsMessage(
    scopeName,
    workAreaTypeKey,
    answers
  );
  if (missingMessage) return missingMessage;

  if (pricingUnsupported) {
    return `${scopeName} not included yet — pricing support/rates needed.`;
  }

  return `${scopeName} is not included in this estimate yet.`;
}
