import { z } from "zod";
import type { QualityLevel } from "@/lib/constants/quality-level";
import { isSiteConstraintsAssessed } from "@/lib/cost-engine/estimate-quality";
import type { EstimateTrace } from "@/lib/cost-engine/estimate-trace";
import { computeScopeCompleteness } from "@/lib/assistant-v2/compute-information-completeness";
import { getUnknownSiteConditions } from "@/lib/assistant-v2/get-next-constraint-question";
import { getScopeByWorkAreaType } from "@/lib/scopes";
import {
  factIsAnsweredFromMap,
  getKnownFactsForScope,
  getMissingOptionalHighImpact,
  getMissingRequiredFacts,
} from "@/lib/scopes/missing-facts";
import { isFinishLevelKnown } from "@/lib/scopes/resolve-effective-finish";
import {
  describeFlowStatusMessage,
  resolveAssistantFlowState,
} from "@/lib/assistant-v2/flow/resolve-assistant-flow-state";
import type { ScopeFactDefinition } from "@/lib/scopes/types";

export const projectStatusSchema = z.enum([
  "needs_scope_confirmation",
  "needs_questions",
  "needs_constraints",
  "enough_for_draft",
  "quote_ready",
]);

export type ProjectStatus = z.infer<typeof projectStatusSchema>;

export const nextBestActionTypeSchema = z.enum([
  "confirm_scopes",
  "ask_questions",
  "assess_constraints",
  "select_finish",
  "ready_for_draft",
  "quote_ready",
]);

export type NextBestActionType = z.infer<typeof nextBestActionTypeSchema>;

export const workAreaCompletenessSchema = z.object({
  scopeId: z.string(),
  scopeTypeKey: z.string(),
  label: z.string(),
  completeness: z.number(),
  missingCriticalFacts: z.array(z.string()),
  missingUsefulFacts: z.array(z.string()),
  nextBestQuestions: z.array(z.string()),
  estimateReady: z.boolean(),
});

export type WorkAreaCompleteness = z.infer<typeof workAreaCompletenessSchema>;

export const nextBestActionSchema = z.object({
  type: nextBestActionTypeSchema,
  label: z.string(),
  scopeId: z.string().optional(),
  questionIds: z.array(z.string()).optional(),
  reason: z.string(),
});

export type NextBestAction = z.infer<typeof nextBestActionSchema>;

export const projectCompletenessResultSchema = z.object({
  projectStatus: projectStatusSchema,
  overallCompleteness: z.number(),
  workAreas: z.array(workAreaCompletenessSchema),
  nextBestAction: nextBestActionSchema,
});

export type ProjectCompletenessResult = z.infer<
  typeof projectCompletenessResultSchema
>;

export type EvaluateWorkAreaInput = {
  scopeId: string;
  scopeName: string;
  workAreaTypeKey: string;
  answers: Record<string, string>;
  included: boolean;
};

export type EvaluateProjectCompletenessInput = {
  workAreas: EvaluateWorkAreaInput[];
  pendingSuggestionCount?: number;
  qualityLevel: QualityLevel;
  selectedConstraintSlugs: string[];
  declinedConstraintSlugs: string[];
  discoveryConstraintSlugs?: string[];
  answeredQuestionKeys?: Set<string>;
  estimateTrace?: EstimateTrace | null;
  rateSourcesUseBenchmark?: boolean;
};

const QUOTE_READY_COMPLETENESS_MIN = 75;

function formatFactValue(
  fact: ScopeFactDefinition,
  value: string
): string {
  if (fact.type === "select" && fact.options) {
    const opt = fact.options.find((o) => o.value === value);
    if (opt?.label === "Yes") return "Yes";
    if (opt?.label === "No") return "No";
    return opt?.label ?? value;
  }
  if (fact.type === "number") {
    return `${value}${fact.unit ?? ""}`;
  }
  return value;
}

export function formatKnownFactsForScope(
  workAreaTypeKey: string,
  answers: Record<string, string>
): { label: string; display: string }[] {
  return getKnownFactsForScope(workAreaTypeKey, answers).map((fact) => ({
    label: fact.label,
    display: formatFactValue(fact, answers[fact.key] ?? ""),
  }));
}

export function scopedMissingLabel(scopeName: string, factLabel: string): string {
  return `${scopeName} ${factLabel.charAt(0).toLowerCase()}${factLabel.slice(1)}`;
}

export function buildScopedMissingInformationLabels(
  workAreas: EvaluateWorkAreaInput[],
  projectQualityLevel?: QualityLevel
): string[] {
  const labels: string[] = [];

  for (const area of workAreas) {
    if (!area.included) continue;

    for (const fact of getMissingRequiredFacts(
      area.workAreaTypeKey,
      area.answers,
      { projectQualityLevel }
    )) {
      labels.push(scopedMissingLabel(area.scopeName, fact.label));
    }

    for (const fact of getMissingOptionalHighImpact(
      area.workAreaTypeKey,
      area.answers,
      { projectQualityLevel }
    )) {
      labels.push(scopedMissingLabel(area.scopeName, fact.label));
    }
  }

  return [...new Set(labels)];
}

function allScopesReadyForConstraints(
  includedAreas: EvaluateWorkAreaInput[],
  projectQualityLevel?: QualityLevel
): boolean {
  return (
    includedAreas.length > 0 &&
    includedAreas.every(
      (area) =>
        getMissingRequiredFacts(area.workAreaTypeKey, area.answers, {
          projectQualityLevel,
        }).length === 0
    )
  );
}

function projectFinishLevelResolved(
  input: EvaluateProjectCompletenessInput,
  includedAreas: EvaluateWorkAreaInput[]
): boolean {
  if (input.qualityLevel !== "unknown") return true;

  return includedAreas.every((area) =>
    isFinishLevelKnown({
      scopeTypeKey: area.workAreaTypeKey,
      answers: area.answers,
      projectQualityLevel: input.qualityLevel,
    })
  );
}

function scopeHasMeasurementOrBenchmark(
  workAreaTypeKey: string,
  answers: Record<string, string>
): boolean {
  const scope = getScopeByWorkAreaType(workAreaTypeKey);
  if (!scope) return false;

  const measurementKeys = scope.confidenceRules.measurementFactKeys;
  const hasMeasurement = measurementKeys.some((key) => {
    const fact =
      scope.requiredFacts.find((f) => f.key === key) ??
      scope.optionalFacts.find((f) => f.key === key);
    return fact ? factIsAnsweredFromMap(fact, answers) : false;
  });

  return hasMeasurement || Boolean(scope.benchmarkRates);
}

function scopeMeetsDraftThreshold(
  area: EvaluateWorkAreaInput,
  projectQualityLevel?: QualityLevel
): boolean {
  if (!area.included) return true;

  const scope = getScopeByWorkAreaType(area.workAreaTypeKey);
  if (!scope) return false;

  if (
    getMissingRequiredFacts(area.workAreaTypeKey, area.answers, {
      projectQualityLevel,
    }).length > 0
  ) {
    return false;
  }

  return scopeHasMeasurementOrBenchmark(area.workAreaTypeKey, area.answers);
}

function buildWorkAreaCompleteness(
  area: EvaluateWorkAreaInput,
  projectQualityLevel?: QualityLevel
): WorkAreaCompleteness {
  const scope = getScopeByWorkAreaType(area.workAreaTypeKey);
  const { percent, requiredComplete } = computeScopeCompleteness({
    workAreaTypeKey: area.workAreaTypeKey,
    answers: area.answers,
  });

  const missingCritical = getMissingRequiredFacts(
    area.workAreaTypeKey,
    area.answers,
    { projectQualityLevel }
  ).map((f) => f.label);

  const missingUseful = getMissingOptionalHighImpact(
    area.workAreaTypeKey,
    area.answers,
    { projectQualityLevel }
  ).map((f) => f.label);

  const nextBestQuestions = [
    ...getMissingRequiredFacts(area.workAreaTypeKey, area.answers, {
      projectQualityLevel,
    }),
    ...getMissingOptionalHighImpact(area.workAreaTypeKey, area.answers),
  ]
    .slice(0, 3)
    .map((f) => f.questionText || f.label);

  const estimateReady =
    area.included &&
    Boolean(scope) &&
    requiredComplete &&
    scopeHasMeasurementOrBenchmark(area.workAreaTypeKey, area.answers);

  return {
    scopeId: area.scopeId,
    scopeTypeKey: scope?.id ?? area.workAreaTypeKey,
    label: area.scopeName,
    completeness: area.included ? percent : 100,
    missingCriticalFacts: missingCritical,
    missingUsefulFacts: missingUseful,
    nextBestQuestions,
    estimateReady,
  };
}

function resolveNextBestAction(
  input: EvaluateProjectCompletenessInput,
  includedAreas: EvaluateWorkAreaInput[],
  workAreaResults: WorkAreaCompleteness[],
  projectStatus: ProjectStatus,
  pendingConstraints: number
): NextBestAction {
  if (projectStatus === "needs_scope_confirmation") {
    return {
      type: "confirm_scopes",
      label: "Here's what I'll estimate",
      reason: "Work areas from discovery still need confirmation.",
    };
  }

  const incompleteScope = workAreaResults.find(
    (w) =>
      includedAreas.some((a) => a.scopeId === w.scopeId) &&
      w.missingCriticalFacts.length > 0
  );

  if (incompleteScope) {
    const factLabel = incompleteScope.missingCriticalFacts[0] ?? "details";
    const shortLabel =
      factLabel.toLowerCase().includes("height")
        ? `Add ${incompleteScope.label.toLowerCase()} height`
        : factLabel.toLowerCase().includes("material") ||
            factLabel.toLowerCase().includes("type")
          ? `Add ${incompleteScope.label.toLowerCase()} details`
          : `Answer ${incompleteScope.label.toLowerCase()} details`;
    return {
      type: "ask_questions",
      label: shortLabel,
      scopeId: incompleteScope.scopeId,
      reason: `${incompleteScope.label} is missing key pricing details.`,
    };
  }

  const incompleteUseful = workAreaResults.find(
    (w) =>
      includedAreas.some((a) => a.scopeId === w.scopeId) &&
      w.missingUsefulFacts.length > 0
  );

  if (incompleteUseful) {
    return {
      type: "ask_questions",
      label: `Answer ${incompleteUseful.label} questions`,
      scopeId: incompleteUseful.scopeId,
      reason: `${incompleteUseful.label} has useful details that would sharpen the estimate.`,
    };
  }

  if (
    !projectFinishLevelResolved(input, includedAreas) &&
    includedAreas.length > 0
  ) {
    return {
      type: "select_finish",
      label: "Select finish level",
      reason: "Finish level helps price materials and labour.",
    };
  }

  if (
    pendingConstraints > 0 &&
    allScopesReadyForConstraints(includedAreas, input.qualityLevel)
  ) {
    return {
      type: "assess_constraints",
      label: "Confirm site conditions",
      reason: "Site conditions affect access, waste, and programme.",
    };
  }

  if (projectStatus === "quote_ready") {
    return {
      type: "quote_ready",
      label: "View estimate detail",
      reason: "Estimate has enough detail for quote-ready pricing.",
    };
  }

  if (projectStatus === "enough_for_draft") {
    return {
      type: "ready_for_draft",
      label: "View estimate detail",
      reason: "Enough detail for a draft quick estimate.",
    };
  }

  return {
    type: "ready_for_draft",
    label: "Generate quick estimate",
    reason: "Enough detail for a draft quick estimate.",
  };
}

export function evaluateProjectCompleteness(
  input: EvaluateProjectCompletenessInput
): ProjectCompletenessResult {
  const includedAreas = input.workAreas.filter((a) => a.included);
  const workAreaResults = input.workAreas.map((area) =>
    buildWorkAreaCompleteness(area, input.qualityLevel)
  );

  const includedResults = workAreaResults.filter((w) =>
    includedAreas.some((a) => a.scopeId === w.scopeId)
  );

  const totalKnown = includedResults.reduce(
    (sum, w) => sum + w.completeness,
    0
  );
  const overallCompleteness =
    includedResults.length > 0
      ? Math.round(totalKnown / includedResults.length)
      : 0;

  const workAreaTypeKeys = includedAreas.map((a) => a.workAreaTypeKey);
  const answeredKeys = input.answeredQuestionKeys ?? new Set<string>();

  const pendingConstraints = getUnknownSiteConditions({
    workAreaTypeKeys,
    selectedConstraintSlugs: input.selectedConstraintSlugs,
    declinedConstraintSlugs: input.declinedConstraintSlugs,
    discoveryConstraintSlugs: input.discoveryConstraintSlugs ?? [],
    answeredQuestionKeys: answeredKeys,
  }).length;

  const siteConstraintsAssessed = isSiteConstraintsAssessed({
    constraintCount: input.selectedConstraintSlugs.length,
    answeredQuestionKeys: answeredKeys,
    constraintsAssessed: input.declinedConstraintSlugs.length > 0,
  });

  const allDraftReady =
    includedAreas.length > 0 &&
    includedAreas.every((area) =>
      scopeMeetsDraftThreshold(area, input.qualityLevel)
    );

  const anyMissingCritical = includedResults.some(
    (w) => w.missingCriticalFacts.length > 0
  );

  const finishResolved = projectFinishLevelResolved(input, includedAreas);
  const constraintsReady = allScopesReadyForConstraints(
    includedAreas,
    input.qualityLevel
  );

  let projectStatus: ProjectStatus;

  if ((input.pendingSuggestionCount ?? 0) > 0) {
    projectStatus = "needs_scope_confirmation";
  } else if (includedAreas.length === 0) {
    projectStatus = "needs_scope_confirmation";
  } else if (anyMissingCritical) {
    projectStatus = "needs_questions";
  } else if (
    !finishResolved ||
    (constraintsReady &&
      !siteConstraintsAssessed &&
      pendingConstraints > 0)
  ) {
    projectStatus = "needs_constraints";
  } else if (
    allDraftReady &&
    overallCompleteness >= QUOTE_READY_COMPLETENESS_MIN &&
    siteConstraintsAssessed &&
    includedResults.every((w) => w.estimateReady)
  ) {
    projectStatus = "quote_ready";
  } else if (allDraftReady) {
    projectStatus = "enough_for_draft";
  } else {
    projectStatus = "needs_questions";
  }

  const nextBestAction = resolveNextBestAction(
    input,
    includedAreas,
    workAreaResults,
    projectStatus,
    pendingConstraints
  );

  return projectCompletenessResultSchema.parse({
    projectStatus,
    overallCompleteness,
    workAreas: workAreaResults,
    nextBestAction,
  });
}

export type CompletenessStatusMessage = {
  title: string;
  subtitle: string;
};

export function describeCompletenessStatus(
  result: ProjectCompletenessResult,
  options?: {
    flowState?: ReturnType<typeof resolveAssistantFlowState>["state"];
    hasUsefulGaps?: boolean;
  }
): CompletenessStatusMessage {
  if (options?.flowState) {
    return describeFlowStatusMessage(options.flowState, {
      hasUsefulGaps: options.hasUsefulGaps,
    });
  }

  switch (result.projectStatus) {
    case "quote_ready":
      return {
        title: "Quote-ready estimate",
        subtitle: "Ready to move into detailed pricing.",
      };
    case "enough_for_draft":
      if (result.overallCompleteness >= 70) {
        return {
          title: "Solid draft — a few details would sharpen it.",
          subtitle: "Optional details would tighten the range — check the live estimate.",
        };
      }
      return {
        title: "That's enough for a draft quick estimate",
        subtitle: "Check the live estimate on the right — add more notes anytime to refine.",
      };
    case "needs_constraints":
      return {
        title: "Almost there",
        subtitle:
          "I can give a rough range, but finish level or site conditions would sharpen it.",
      };
    case "needs_scope_confirmation":
      return {
        title: "Here's what I'll estimate",
        subtitle: "Confirm which work areas belong in this estimate.",
      };
    case "needs_questions":
    default:
      return {
        title: "I need a few details before pricing this properly.",
        subtitle:
          "Answer the scope questions below — site conditions come after.",
      };
  }
}

export function buildScopeFollowUpMessage(
  scopeName: string,
  questions: string[],
  action: "added" | "included"
): string {
  const intro =
    action === "added"
      ? `I've added ${scopeName} to the estimate. I still need a few details to price it properly.`
      : `I've added ${scopeName} back into the estimate. I still need a few details to price it properly.`;

  if (questions.length === 0) {
    return intro;
  }

  const numbered = questions
    .slice(0, 3)
    .map((q, i) => `${i + 1}. ${q}`)
    .join("\n");

  return `${intro}\n\n${numbered}`;
}
