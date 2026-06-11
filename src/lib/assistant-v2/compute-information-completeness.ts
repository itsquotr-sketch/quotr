import { getScopeByWorkAreaType } from "@/lib/scopes";
import {
  factIsAnsweredFromMap,
  getKnownFactsForScope,
  getMissingOptionalHighImpact,
  getMissingRequiredFacts,
} from "@/lib/scopes/missing-facts";

export type WorkAreaCompletenessInput = {
  workAreaTypeKey: string;
  answers: Record<string, string>;
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
  const scope = getScopeByWorkAreaType(input.workAreaTypeKey);
  if (!scope) {
    return { percent: 0, knownCount: 0, totalCount: 0, requiredComplete: false };
  }

  const highImpact = new Set(scope.confidenceRules.highImpactOptionalKeys);
  const trackableFacts = [
    ...scope.requiredFacts,
    ...scope.optionalFacts.filter((f) => highImpact.has(f.key)),
  ];

  const knownCount = trackableFacts.filter((fact) =>
    factIsAnsweredFromMap(fact, input.answers)
  ).length;
  const totalCount = trackableFacts.length;
  const requiredComplete =
    getMissingRequiredFacts(input.workAreaTypeKey, input.answers).length === 0;

  const percent =
    totalCount > 0 ? Math.round((knownCount / totalCount) * 100) : 0;

  return { percent, knownCount, totalCount, requiredComplete };
}

export function computeProjectCompleteness(
  workAreas: WorkAreaCompletenessInput[]
): number {
  if (workAreas.length === 0) return 0;

  let known = 0;
  let total = 0;

  for (const area of workAreas) {
    const scope = getScopeByWorkAreaType(area.workAreaTypeKey);
    if (!scope) continue;

    const highImpact = new Set(scope.confidenceRules.highImpactOptionalKeys);
    const trackableFacts = [
      ...scope.requiredFacts,
      ...scope.optionalFacts.filter((f) => highImpact.has(f.key)),
    ];

    total += trackableFacts.length;
    known += trackableFacts.filter((fact) =>
      factIsAnsweredFromMap(fact, area.answers)
    ).length;
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
  const missing: string[] = [];

  for (const area of workAreas) {
    const scope = getScopeByWorkAreaType(area.workAreaTypeKey);
    if (!scope) continue;

    for (const fact of getMissingRequiredFacts(
      area.workAreaTypeKey,
      area.answers
    )) {
      missing.push(`${fact.label} not confirmed`);
    }

    for (const fact of getMissingOptionalHighImpact(
      area.workAreaTypeKey,
      area.answers
    )) {
      missing.push(`${fact.label} not confirmed`);
    }
  }

  return [...new Set(missing)];
}
