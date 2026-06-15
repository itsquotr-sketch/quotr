import type { EvaluateWorkAreaInput } from "@/lib/assistant-v2/completeness/evaluate-project-completeness";
import type { QualityLevel } from "@/lib/constants/quality-level";
import type { EstimateQualityFactor, EstimateQualityTier } from "@/lib/cost-engine/estimate-quality";
import { TRUST_COPY } from "@/lib/assistant-v2/trust-messages";
import type { WorkAreaRateSourceLine } from "@/lib/cost-engine/estimate-trace";
import {
  isBenchmarkRateSource,
  type RateSource,
} from "@/lib/cost-engine/rates/get-base-rate-for-scope";
import { getCanonicalScopeTemplateByWorkAreaType } from "@/lib/scopes/templates";
import type {
  ScopeConfidenceWeight,
  ScopeTemplate,
} from "@/lib/scopes/templates/types";
import { getScopeByWorkAreaType } from "@/lib/scopes";
import {
  factIsAnsweredFromMap,
  getMissingOptionalHighImpact,
  getMissingRequiredFacts,
} from "@/lib/scopes/missing-facts";
import { isFinishLevelKnown } from "@/lib/scopes/resolve-effective-finish";
import { getAnswerValue } from "@/lib/question-keys";
import type { ScopeFactDefinition } from "@/lib/scopes/types";

export type ConfidenceStatus = "low" | "fair" | "good" | "ready";

export type ScopeConfidenceResult = {
  scopeId: string;
  scopeTypeKey: string;
  label: string;
  score: number;
  status: ConfidenceStatus;
  confirmed: string[];
  missingCritical: string[];
  missingUseful: string[];
  optional: string[];
  nextBestAction: string;
};

export type ConfidenceEvaluationResult = {
  overallScore: number;
  overallStatus: ConfidenceStatus;
  reason: string;
  scopes: ScopeConfidenceResult[];
  nextBestProjectAction: string;
  optionalOnlyMissing: boolean;
};

export type EvaluateConfidenceInput = {
  workAreas: EvaluateWorkAreaInput[];
  qualityLevel: QualityLevel;
  siteConstraintsAssessed?: boolean;
  rateSourceLines?: WorkAreaRateSourceLine[];
  rateSourcesByScopeId?: Record<string, RateSource>;
};

const SAVED_RATE_SOURCES = new Set<RateSource>([
  "scope_rate",
  "package_rate",
  "org_rate",
]);

const LOW_CONFIDENCE_RATE_SOURCES = new Set<RateSource>([
  "placeholder",
  "regional_fallback",
]);

function clampScore(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function scoreToConfidenceStatus(score: number): ConfidenceStatus {
  if (score >= 90) return "ready";
  if (score >= 70) return "good";
  if (score >= 40) return "fair";
  return "low";
}

export function confidenceStatusToTier(
  status: ConfidenceStatus
): EstimateQualityTier {
  switch (status) {
    case "ready":
      return "READY";
    case "good":
      return "GOOD";
    case "fair":
      return "FAIR";
    case "low":
    default:
      return "LOW";
  }
}

export function describeConfidenceStatus(
  status: ConfidenceStatus,
  options?: { optionalOnlyMissing?: boolean }
): string {
  switch (status) {
    case "ready":
      return options?.optionalOnlyMissing
        ? `${TRUST_COPY.readyForDraft} — optional details available.`
        : `${TRUST_COPY.readyForDraft}.`;
    case "good":
      return `${TRUST_COPY.solidDraft}.`;
    case "fair":
      return `${TRUST_COPY.roughRange}.`;
    case "low":
    default:
      return "Early estimate — more scope information needed.";
  }
}

function isConfidentAnswer(
  fact: Pick<ScopeFactDefinition, "key" | "type" | "options">,
  answers: Record<string, string>
): boolean {
  if (!factIsAnsweredFromMap(fact as ScopeFactDefinition, answers)) {
    return false;
  }
  const value = getAnswerValue(answers, fact.key)?.trim().toLowerCase() ?? "";
  return value !== "" && value !== "unknown" && value !== "not_sure";
}

function findFactInTemplate(
  template: ScopeTemplate,
  factKey: string
): ScopeFactDefinition | undefined {
  const all = [
    ...template.facts.required,
    ...template.facts.useful,
    ...template.facts.optional,
  ];
  const match = all.find((f) => f.key === factKey);
  if (!match) return undefined;
  return match as ScopeFactDefinition;
}

function weightConditionMet(
  weight: ScopeConfidenceWeight,
  answers: Record<string, string>
): boolean {
  if (!weight.conditionalOn) return true;
  const value =
    getAnswerValue(answers, weight.conditionalOn.factKey)?.trim() ?? "";
  return weight.conditionalOn.values.includes(value);
}

function evaluateWeightCategory(
  weight: ScopeConfidenceWeight,
  template: ScopeTemplate,
  answers: Record<string, string>,
  qualityLevel: QualityLevel,
  workAreaTypeKey: string,
  rateSource?: RateSource,
  siteConstraintsAssessed?: boolean
): { earned: number; confirmedLabel?: string } {
  if (!weightConditionMet(weight, answers)) {
    return { earned: 0 };
  }

  if (weight.category === "rate_source") {
    if (!rateSource) {
      return { earned: Math.round(weight.weight * 0.4) };
    }
    if (SAVED_RATE_SOURCES.has(rateSource)) {
      return { earned: weight.weight, confirmedLabel: "User rate available" };
    }
    if (isBenchmarkRateSource(rateSource)) {
      return {
        earned: Math.round(weight.weight * 0.7),
        confirmedLabel: "Benchmark rate in use",
      };
    }
    if (LOW_CONFIDENCE_RATE_SOURCES.has(rateSource)) {
      return { earned: 0 };
    }
    return { earned: Math.round(weight.weight * 0.5) };
  }

  if (weight.category === "finish") {
    const finishKnown =
      weight.factKeys.some((key) => {
        const fact = findFactInTemplate(template, key);
        return fact ? isConfidentAnswer(fact, answers) : false;
      }) ||
      isFinishLevelKnown({
        scopeTypeKey: workAreaTypeKey,
        answers,
        projectQualityLevel: qualityLevel,
      });
    return finishKnown
      ? { earned: weight.weight, confirmedLabel: weight.label }
      : { earned: 0 };
  }

  if (weight.category === "site_access") {
    const accessFromFacts = weight.factKeys.some((key) => {
      const fact = findFactInTemplate(template, key);
      return fact ? isConfidentAnswer(fact, answers) : false;
    });
    if (accessFromFacts || siteConstraintsAssessed) {
      return { earned: weight.weight, confirmedLabel: weight.label };
    }
    return { earned: 0 };
  }

  if (weight.factKeys.length === 0) {
    return { earned: 0 };
  }

  const mode = weight.matchMode ?? "all";
  const factResults = weight.factKeys.map((key) => {
    const fact = findFactInTemplate(template, key);
    if (!fact) return false;
    return isConfidentAnswer(fact, answers);
  });

  const met =
    mode === "any"
      ? factResults.some(Boolean)
      : factResults.every(Boolean);

  if (weight.key === "elevation") {
    const levelType = getAnswerValue(answers, "deck.level_type")?.trim();
    if (levelType === "elevated") {
      const heightFact = findFactInTemplate(template, "deck.height_m");
      const heightKnown = heightFact
        ? isConfidentAnswer(heightFact, answers)
        : false;
      if (met && !heightKnown) {
        return {
          earned: Math.round(weight.weight * 0.6),
          confirmedLabel: "Elevation type known",
        };
      }
    }
  }

  return met ? { earned: weight.weight, confirmedLabel: weight.label } : { earned: 0 };
}

function resolveRateSourceForScope(
  area: EvaluateWorkAreaInput,
  input: EvaluateConfidenceInput
): RateSource | undefined {
  if (input.rateSourcesByScopeId?.[area.scopeId]) {
    return input.rateSourcesByScopeId[area.scopeId];
  }
  const line = input.rateSourceLines?.find(
    (row) =>
      row.workAreaName === area.scopeName ||
      row.workAreaTypeKey === area.workAreaTypeKey
  );
  return line?.rateSource as RateSource | undefined;
}

function isCriticallyMissingFact(
  fact: ScopeFactDefinition,
  answers: Record<string, string>,
  template: ScopeTemplate | undefined
): boolean {
  if (fact.required === false) {
    const dependent = template?.followUps.dependentQuestions.find(
      (rule) => rule.askFactKey === fact.key
    );
    if (!dependent) return false;

    const triggerValue = getAnswerValue(answers, dependent.whenFactKey)?.trim();
    const whenValues = Array.isArray(dependent.whenValue)
      ? dependent.whenValue
      : [dependent.whenValue];
    return whenValues.includes(triggerValue ?? "");
  }

  return true;
}

function buildDefaultWeights(template: ScopeTemplate): ScopeConfidenceWeight[] {
  const weights: ScopeConfidenceWeight[] = [];
  let remaining = 100;

  const quantityKeys = template.quantity.requiredFields;
  if (quantityKeys.length > 0) {
    const w = 25;
    weights.push({
      key: "quantity",
      label: "Quantity known",
      weight: w,
      category: "quantity",
      factKeys: quantityKeys,
      matchMode: "any",
    });
    remaining -= w;
  }

  const materialFacts = template.facts.required.filter((f) =>
    f.key.includes("material")
  );
  if (materialFacts.length > 0) {
    const w = 15;
    weights.push({
      key: "material",
      label: "Material known",
      weight: w,
      category: "material",
      factKeys: materialFacts.map((f) => f.key),
    });
    remaining -= w;
  }

  const finishFacts = [
    ...template.facts.required,
    ...template.facts.useful,
  ].filter((f) => f.key.includes("finish"));
  if (finishFacts.length > 0) {
    const w = 10;
    weights.push({
      key: "finish",
      label: "Finish level known",
      weight: w,
      category: "finish",
      factKeys: finishFacts.map((f) => f.key),
    });
    remaining -= w;
  }

  const inclusionFacts = template.facts.useful
    .filter((f) => f.affectsEstimate || f.affectsConfidence)
    .slice(0, 3)
    .map((f) => f.key);
  if (inclusionFacts.length > 0) {
    const w = 15;
    weights.push({
      key: "inclusions",
      label: "Scope inclusions confirmed",
      weight: w,
      category: "inclusions",
      factKeys: inclusionFacts,
    });
    remaining -= w;
  }

  const accessFacts = template.facts.useful.filter((f) =>
    /access|machine|occupied/i.test(f.key)
  );
  if (accessFacts.length > 0) {
    const w = 10;
    weights.push({
      key: "site_access",
      label: "Site access assessed",
      weight: w,
      category: "site_access",
      factKeys: accessFacts.map((f) => f.key),
      matchMode: "any",
    });
    remaining -= w;
  }

  const supplyFacts = template.facts.useful
    .filter((f) => /supply|supplied|client/i.test(f.key))
    .slice(0, 2)
    .map((f) => f.key);
  if (supplyFacts.length > 0) {
    const w = Math.min(10, remaining - 10);
    weights.push({
      key: "supply",
      label: "Supply arrangements confirmed",
      weight: w,
      category: "supply",
      factKeys: supplyFacts,
      matchMode: "any",
    });
    remaining -= w;
  }

  weights.push({
    key: "rate_source",
    label: "Rate source known",
    weight: Math.max(5, remaining),
    category: "rate_source",
    factKeys: [],
  });

  return weights;
}

function resolveScopeWeights(template: ScopeTemplate): ScopeConfidenceWeight[] {
  return template.confidenceWeights ?? buildDefaultWeights(template);
}

export function evaluateScopeConfidence(
  area: EvaluateWorkAreaInput,
  input: Omit<EvaluateConfidenceInput, "workAreas">
): ScopeConfidenceResult {
  const template = getCanonicalScopeTemplateByWorkAreaType(area.workAreaTypeKey);
  const legacyScope = getScopeByWorkAreaType(area.workAreaTypeKey);
  const rateSource = resolveRateSourceForScope(area, {
    workAreas: [area],
    ...input,
  });

  if (!area.included) {
    return {
      scopeId: area.scopeId,
      scopeTypeKey: template?.scopeTypeKey ?? area.workAreaTypeKey,
      label: area.scopeName,
      score: 100,
      status: "ready",
      confirmed: [],
      missingCritical: [],
      missingUseful: [],
      optional: [],
      nextBestAction: "",
    };
  }

  if (!template) {
    return {
      scopeId: area.scopeId,
      scopeTypeKey: area.workAreaTypeKey,
      label: area.scopeName,
      score: 20,
      status: "low",
      confirmed: ["Work area confirmed"],
      missingCritical: ["Scope template matched"],
      missingUseful: [],
      optional: [],
      nextBestAction: "Confirm scope type or add pricing support.",
    };
  }

  const weights = resolveScopeWeights(template);
  let rawScore = 0;
  const confirmed: string[] = [];

  for (const weight of weights) {
    const result = evaluateWeightCategory(
      weight,
      template,
      area.answers,
      input.qualityLevel,
      area.workAreaTypeKey,
      rateSource,
      input.siteConstraintsAssessed
    );
    rawScore += result.earned;
    if (result.confirmedLabel && result.earned >= weight.weight * 0.9) {
      confirmed.push(result.confirmedLabel);
    }
  }

  const missingCriticalFacts = getMissingRequiredFacts(
    area.workAreaTypeKey,
    area.answers,
    { projectQualityLevel: input.qualityLevel }
  ).filter((fact) => isCriticallyMissingFact(fact, area.answers, template));

  const missingCritical = missingCriticalFacts.map((f) => f.label);

  const missingUseful = getMissingOptionalHighImpact(
    area.workAreaTypeKey,
    area.answers
  ).map((f) => f.label);

  const optionalFacts = legacyScope?.optionalFacts ?? [];
  const highImpact = new Set(
    legacyScope?.confidenceRules.highImpactOptionalKeys ?? []
  );
  const optional = optionalFacts
    .filter(
      (f) =>
        !highImpact.has(f.key) &&
        !factIsAnsweredFromMap(f, area.answers)
    )
    .map((f) => f.label);

  const score = clampScore(rawScore);

  const status = scoreToConfidenceStatus(score);

  let nextBestAction = "";
  if (missingCritical.length > 0) {
    nextBestAction = `Confirm ${missingCritical[0]!.toLowerCase()}.`;
  } else if (missingUseful.length > 0) {
    nextBestAction = `Confirm ${missingUseful[0]!.toLowerCase()} to sharpen the estimate.`;
  } else if (
    rateSource &&
    !SAVED_RATE_SOURCES.has(rateSource) &&
    isBenchmarkRateSource(rateSource)
  ) {
    nextBestAction = "Add your own rates for stronger confidence.";
  } else if (optional.length > 0) {
    nextBestAction = `Optional: confirm ${optional[0]!.toLowerCase()}.`;
  } else {
    nextBestAction = "Review the draft estimate.";
  }

  return {
    scopeId: area.scopeId,
    scopeTypeKey: template.scopeTypeKey,
    label: area.scopeName,
    score,
    status,
    confirmed: [...new Set(confirmed)],
    missingCritical,
    missingUseful,
    optional,
    nextBestAction,
  };
}

export function evaluateConfidence(
  input: EvaluateConfidenceInput
): ConfidenceEvaluationResult {
  const includedAreas = input.workAreas.filter((a) => a.included !== false);

  if (includedAreas.length === 0) {
    return {
      overallScore: 0,
      overallStatus: "low",
      reason: describeConfidenceStatus("low"),
      scopes: [],
      nextBestProjectAction: "Confirm work areas for this project.",
      optionalOnlyMissing: false,
    };
  }

  const scopes = includedAreas.map((area) => evaluateScopeConfidence(area, input));

  const overallScore = clampScore(
    scopes.reduce((sum, s) => sum + s.score, 0) / scopes.length
  );

  const anyCritical = scopes.some((s) => s.missingCritical.length > 0);
  const anyUseful = scopes.some((s) => s.missingUseful.length > 0);
  const anyOptional = scopes.some((s) => s.optional.length > 0);
  const optionalOnlyMissing = !anyCritical && !anyUseful && anyOptional;

  const overallStatus = scoreToConfidenceStatus(overallScore);

  const reason = describeConfidenceStatus(overallStatus, { optionalOnlyMissing });

  const nextScope = scopes.find(
    (s) => s.missingCritical.length > 0 || s.missingUseful.length > 0
  );
  const nextBestProjectAction =
    nextScope?.nextBestAction ??
    scopes.find((s) => s.optional.length > 0)?.nextBestAction ??
    "Review the draft estimate.";

  return {
    overallScore,
    overallStatus,
    reason,
    scopes,
    nextBestProjectAction,
    optionalOnlyMissing,
  };
}

export function buildQualityFactorsFromEvaluation(
  evaluation: ConfidenceEvaluationResult
): EstimateQualityFactor[] {
  const confirmed = new Set<string>();
  for (const scope of evaluation.scopes) {
    for (const item of scope.confirmed) {
      confirmed.add(item);
    }
  }

  const defaults: EstimateQualityFactor[] = [
    { label: "Area confirmed", met: confirmed.has("Area known") || confirmed.has("Quantity known") },
    { label: "Work area confirmed", met: evaluation.scopes.length > 0 },
    {
      label: "Materials confirmed",
      met: [...confirmed].some((c) => /material/i.test(c)),
    },
    {
      label: "Finish level selected",
      met: [...confirmed].some((c) => /finish/i.test(c)),
    },
    {
      label: "Site constraints assessed",
      met: [...confirmed].some((c) => /access|site/i.test(c)),
    },
    {
      label: "User rate available",
      met: confirmed.has("User rate available"),
    },
  ];

  return defaults;
}

export function buildConfidenceExplanationFromEvaluation(
  evaluation: ConfidenceEvaluationResult
): string {
  const tier = confidenceStatusToTier(evaluation.overallStatus);
  const lines: string[] = [
    `This is a ${tier} draft. ${evaluation.reason}`,
  ];

  const confirmed = evaluation.scopes.flatMap((s) => s.confirmed).slice(0, 5);
  if (confirmed.length > 0) {
    lines.push("");
    lines.push(
      `The ${evaluation.scopes.map((s) => s.label.toLowerCase()).join(", ") || "work areas"} ${confirmed.length === 1 ? "has" : "have"} ${confirmed.slice(0, 3).join(", ").toLowerCase()} confirmed.`
    );
  }

  const useful = evaluation.scopes.flatMap((s) => s.missingUseful);
  const critical = evaluation.scopes.flatMap((s) => s.missingCritical);
  const optional = evaluation.scopes.flatMap((s) => s.optional);

  if (evaluation.overallStatus !== "ready" && (useful.length > 0 || critical.length > 0)) {
    lines.push("");
    const toReady = [...critical, ...useful].slice(0, 3);
    lines.push(
      `To make it READY, confirm ${toReady.map((l) => l.toLowerCase()).join(", ")}.`
    );
  } else if (optional.length > 0 && evaluation.optionalOnlyMissing) {
    lines.push("");
    lines.push("Optional details available — none are required for a draft estimate.");
  }

  if (evaluation.nextBestProjectAction) {
    lines.push("");
    lines.push(`Next best step: ${evaluation.nextBestProjectAction}`);
  }

  return lines.join("\n");
}

/**
 * Project-level assistant copy that reflects overall and weakest included scopes.
 */
export function buildProjectConfidenceMessage(
  evaluation: ConfidenceEvaluationResult
): string {
  const scopes = evaluation.scopes;
  if (scopes.length === 0) {
    return "I need a few more details before this is a strong estimate.";
  }

  const anyCritical = scopes.some((s) => s.missingCritical.length > 0);
  if (anyCritical) {
    return "I need a few more details before this is a strong estimate.";
  }

  const weakScopes = scopes.filter(
    (s) => s.status === "low" || s.status === "fair"
  );
  const strongScopes = scopes.filter(
    (s) => s.status === "good" || s.status === "ready"
  );

  if (weakScopes.length > 0 && strongScopes.length > 0) {
    const strongLabel = strongScopes.map((s) => s.label).join(", ");
    const weakLabel = weakScopes.map((s) => s.label).join(", ");
    return `${strongLabel} ${strongScopes.length === 1 ? "is" : "are"} strong, but ${weakLabel} still need${weakScopes.length === 1 ? "s" : ""} a few details.`;
  }

  if (weakScopes.length > 0) {
    if (weakScopes.every((s) => s.status === "fair")) {
      return "This is a usable draft estimate. A few details would sharpen it.";
    }
    return "I need a few more details before this is a strong estimate.";
  }

  if (scopes.every((s) => s.status === "good" || s.status === "ready")) {
    return "You've provided enough information for a strong draft estimate.";
  }

  return describeConfidenceStatus(evaluation.overallStatus, {
    optionalOnlyMissing: evaluation.optionalOnlyMissing,
  });
}
