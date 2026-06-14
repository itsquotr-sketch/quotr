import { getTrackableFactsForWorkAreaType } from "@/lib/assistant-v2/discovery/generic-scope-discovery";
import { shouldSuppressQuestionForDerivedValue } from "@/lib/assistant-v2/facts/measurement-resolver";
import { getScopeByWorkAreaType } from "@/lib/scopes";
import {
  buildScopedMissingLabelsFromItems,
  getCriticalOrUsefulMissing,
  getCurrentMissingItems,
} from "@/lib/assistant-v2/missing/get-current-missing-items";
import {
  factIsAnsweredFromMap,
  getKnownFactsForScope,
} from "@/lib/scopes/missing-facts";
export type WorkAreaCompletenessInput = {
  scopeId?: string;
  scopeName?: string;
  workAreaTypeKey: string;
  answers: Record<string, string>;
  /** When false, excluded from project completeness (default true). */
  included?: boolean;
};

export type ScopeCompletenessResult = {
  percent: number;
  knownCount: number;
  totalCount: number;
  requiredComplete: boolean;
};

export function computeScopeCompleteness(
  input: WorkAreaCompletenessInput
): ScopeCompletenessResult {
  const trackableFacts = getTrackableFactsForWorkAreaType(input.workAreaTypeKey);
  if (trackableFacts.length === 0) {
    return { percent: 0, knownCount: 0, totalCount: 0, requiredComplete: false };
  }

  const knownCount = trackableFacts.filter((fact) => {
    if (shouldSuppressQuestionForDerivedValue(fact.key, input.answers)) {
      return true;
    }
    return factIsAnsweredFromMap(fact as import("@/lib/scopes/types").ScopeFactDefinition, input.answers);
  }).length;
  const totalCount = trackableFacts.length;
  const requiredComplete = trackableFacts
    .filter((f) => f.required)
    .every((fact) => {
      if (shouldSuppressQuestionForDerivedValue(fact.key, input.answers)) {
        return true;
      }
      return factIsAnsweredFromMap(fact as import("@/lib/scopes/types").ScopeFactDefinition, input.answers);
    });

  const percent =
    totalCount > 0 ? Math.round((knownCount / totalCount) * 100) : 0;

  return { percent, knownCount, totalCount, requiredComplete };
}

export function computeProjectCompleteness(
  workAreas: WorkAreaCompletenessInput[]
): number {
  const included = workAreas.filter((a) => a.included !== false);
  if (included.length === 0) return 0;

  let known = 0;
  let total = 0;

  for (const area of included) {
    const trackableFacts = getTrackableFactsForWorkAreaType(area.workAreaTypeKey);
    if (trackableFacts.length === 0) continue;

    total += trackableFacts.length;
    known += trackableFacts.filter((fact) => {
      if (shouldSuppressQuestionForDerivedValue(fact.key, area.answers)) {
        return true;
      }
      return factIsAnsweredFromMap(fact as import("@/lib/scopes/types").ScopeFactDefinition, area.answers);
    }).length;
  }

  if (total === 0) return 0;
  return Math.round((known / total) * 100);
}

export type ConfidenceFactor = {
  label: string;
  met: boolean;
};

export function buildScopeConfidenceFactors(
  workAreaTypeKey: string,
  answers: Record<string, string>
): ConfidenceFactor[] {
  const scope = getScopeByWorkAreaType(workAreaTypeKey);
  if (!scope) return [];

  const factors: ConfidenceFactor[] = [];

  for (const fact of scope.requiredFacts) {
    factors.push({
      label: `${fact.label} identified`,
      met: factIsAnsweredFromMap(fact, answers),
    });
  }

  const highImpact = new Set(scope.confidenceRules.highImpactOptionalKeys);
  for (const fact of scope.optionalFacts) {
    if (!highImpact.has(fact.key)) continue;
    const known = factIsAnsweredFromMap(fact, answers);
    factors.push({
      label: known ? `${fact.label} confirmed` : `${fact.label} unknown`,
      met: known,
    });
  }

  return factors;
}

export function formatKnownFactLabels(
  workAreaTypeKey: string,
  answers: Record<string, string>
): string[] {
  const known = getKnownFactsForScope(workAreaTypeKey, answers);
  return known.map((fact) => {
    const value = answers[fact.key] ?? "";
    if (fact.type === "select" && fact.options) {
      const opt = fact.options.find((o) => o.value === value);
      if (opt?.label === "Yes") return fact.label;
      if (opt?.label === "No") return `No ${fact.label.toLowerCase()}`;
      return opt?.label ?? value;
    }
    if (fact.type === "number") {
      return `${value}${fact.unit ? fact.unit : ""}`;
    }
    return fact.label;
  });
}


export function buildMissingInformationLabels(
  workAreas: WorkAreaCompletenessInput[]
): string[] {
  const items = getCurrentMissingItems({
    workAreas: workAreas.map((area) => ({
      scopeId: area.scopeId ?? "",
      scopeName: area.scopeName ?? "Work area",
      workAreaTypeKey: area.workAreaTypeKey,
      answers: area.answers,
      included: area.included !== false,
    })),
  });
  return buildScopedMissingLabelsFromItems(getCriticalOrUsefulMissing(items));
}
