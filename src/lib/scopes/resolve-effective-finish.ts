import type { QualityLevel } from "@/lib/constants/quality-level";
import { normaliseQualityLevel } from "@/lib/constants/quality-level";
import { getAnswerValue } from "@/lib/question-keys";
import { getAllFactsForScope, getScopeByWorkAreaType } from "@/lib/scopes";
import { factIsAnsweredFromMap } from "@/lib/scopes/missing-facts";
import type { ScopeFactDefinition } from "@/lib/scopes/types";
import { KNOWN_FACT_CONFIDENCE_THRESHOLD } from "@/lib/assistant-v2/facts/get-known-facts-for-scope";

export function resolveEffectiveFinishLevel(input: {
  scopeTypeKey: string;
  answers: Record<string, string>;
  projectQualityLevel?: QualityLevel | string | null;
  scopeOverrides?: Record<string, string>;
}): QualityLevel {
  const scope = getScopeByWorkAreaType(input.scopeTypeKey);
  if (!scope) {
    return normaliseQualityLevel(input.projectQualityLevel);
  }

  for (const fact of getAllFactsForScope(scope)) {
    if (!fact.key.includes("finish_level")) continue;

    const override = input.scopeOverrides?.[fact.key];
    if (override && override !== "unknown") {
      return normaliseQualityLevel(override);
    }

    const answer = getAnswerValue(input.answers, fact.key);
    if (answer && answer !== "unknown") {
      return normaliseQualityLevel(answer);
    }
  }

  const project = normaliseQualityLevel(input.projectQualityLevel);
  if (project !== "unknown") return project;

  return "unknown";
}

export function isFinishLevelKnown(input: {
  scopeTypeKey: string;
  answers: Record<string, string>;
  projectQualityLevel?: QualityLevel | string | null;
  scopeOverrides?: Record<string, string>;
  minConfidence?: number;
}): boolean {
  const effective = resolveEffectiveFinishLevel(input);
  if (effective !== "unknown") return true;

  const scope = getScopeByWorkAreaType(input.scopeTypeKey);
  if (!scope) return false;

  for (const fact of getAllFactsForScope(scope)) {
    if (!fact.key.includes("finish_level")) continue;
    if (factIsAnsweredFromMap(fact, input.answers)) return true;
  }

  return false;
}

export function shouldSkipFinishLevelQuestion(input: {
  factKey: string;
  scopeTypeKey: string;
  answers: Record<string, string>;
  projectQualityLevel?: QualityLevel | string | null;
}): boolean {
  if (!input.factKey.includes("finish_level")) return false;
  return isFinishLevelKnown({
    scopeTypeKey: input.scopeTypeKey,
    answers: input.answers,
    projectQualityLevel: input.projectQualityLevel,
    minConfidence: KNOWN_FACT_CONFIDENCE_THRESHOLD,
  });
}

export function filterMissingFactsForGlobalFinish(
  facts: ScopeFactDefinition[],
  scopeTypeKey: string,
  answers: Record<string, string>,
  projectQualityLevel?: QualityLevel | string | null
): ScopeFactDefinition[] {
  if (
    !isFinishLevelKnown({
      scopeTypeKey,
      answers,
      projectQualityLevel,
    })
  ) {
    return facts;
  }

  return facts.filter((fact) => !fact.key.includes("finish_level"));
}
