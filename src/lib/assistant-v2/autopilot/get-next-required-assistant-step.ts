import type { QualityLevel } from "@/lib/constants/quality-level";
import { normaliseQualityLevel } from "@/lib/constants/quality-level";
import { extractQualityLevelFromNotes } from "@/lib/ai/discovery/quality-level-rules";
import type { DiscoveryResult } from "@/lib/ai/discovery/types";
import type { EvaluateWorkAreaInput } from "@/lib/assistant-v2/completeness/evaluate-project-completeness";
import { buildMergedAnswersForScope } from "@/lib/assistant-v2/build-merged-answers";
import {
  buildPostEstimateBatchIntro,
  buildPreEstimateUsefulIntro,
  countActionableConfidenceGaps,
  needsConfidenceContinuation,
  scopeMeetsContinuationTarget,
  shouldStopProactiveQuestions,
  buildStoppingStatusMessage,
} from "@/lib/assistant-v2/confidence/confidence-continuation";
import {
  evaluateConfidence,
  type ConfidenceEvaluationResult,
} from "@/lib/assistant-v2/confidence/evaluate-confidence";
import {
  getUnknownSiteConditions,
  type ConstraintQuestion,
} from "@/lib/assistant-v2/get-next-constraint-question";
import {
  getNextPricingQuestions,
  type PricingQuestion,
  type ScopeGroupInput,
} from "@/lib/assistant-v2/get-next-pricing-question";
import {
  buildPricingSourceAlert,
  resolveWorkAreasPricingReadiness,
  scopesNeedingPricingConfirmation,
  type ScopePricingReadiness,
} from "@/lib/assistant-v2/flow/pricing-readiness";
import {
  buildRequiredScopeBatchIntro,
  formatGroupedScopeQuestions,
} from "@/lib/assistant-v2/flow/resolve-assistant-flow-state";
import {
  getMissingRequiredFactsForWorkArea,
} from "@/lib/assistant-v2/stages/required-fact-gating";
import { isSiteConstraintsAssessed } from "@/lib/cost-engine/estimate-quality";
import { resolveWorkAreaTypeKey } from "@/lib/project-assistant-questions";
import type { ScopeQuestionWithAnswers } from "@/lib/project-assistant-data";
import { shouldSkipFinishLevelQuestion } from "@/lib/scopes/resolve-effective-finish";
import { isPricingSupportedWorkAreaType } from "@/lib/scopes/templates";

export type AssistantAutopilotStep =
  | "ask_quality"
  | "ask_required_scope_questions"
  | "ask_pricing_source"
  | "ask_site_conditions"
  | "generate_estimate"
  | "ask_useful_refinement"
  | "ready";

export type AutopilotQuestion = PricingQuestion;

export type GetNextRequiredAssistantStepInput = {
  includedScopes: EvaluateWorkAreaInput[];
  pendingSuggestionCount?: number;
  globalFacts: {
    qualityLevel: QualityLevel;
    sourceNotes?: string;
  };
  knownFactsByScope: ScopeGroupInput[];
  scopeQuestions: ScopeQuestionWithAnswers[];
  discovery: DiscoveryResult | null;
  workAreaTypeKeys: string[];
  selectedConstraintSlugs: string[];
  declinedConstraintSlugs: string[];
  discoveryConstraintSlugs?: string[];
  answeredQuestionKeys?: Set<string>;
  hasEstimate?: boolean;
  estimateReady?: boolean;
  estimatePartial?: boolean;
  userSkippedDetails?: boolean;
  confidenceEvaluation?: ConfidenceEvaluationResult;
  siteConstraintsAssessed?: boolean;
  pricingReadiness?: ScopePricingReadiness[];
};

export type GetNextRequiredAssistantStepResult = {
  shouldContinue: boolean;
  step: AssistantAutopilotStep;
  message: string;
  questions: AutopilotQuestion[];
  targetScopeIds: string[];
  constraints?: ConstraintQuestion[];
  pricingAlert?: { message: string; options: { id: string; label: string }[] };
};

const MAX_SCOPE_BATCH = 8;
const MAX_PER_SCOPE = 4;

const QUALITY_PROMPT =
  "What spec level should I assume for this estimate?";

function logAutopilotDecision(payload: Record<string, unknown>): void {
  if (process.env.NODE_ENV !== "development") return;
  console.log("[assistant.autopilot]", payload);
}

function includedAreas(input: GetNextRequiredAssistantStepInput) {
  return input.includedScopes.filter((a) => a.included !== false);
}

function projectQualityResolved(input: GetNextRequiredAssistantStepInput): boolean {
  if (input.globalFacts.qualityLevel !== "unknown") return true;

  const fromNotes = input.globalFacts.sourceNotes
    ? extractQualityLevelFromNotes(input.globalFacts.sourceNotes)
    : null;
  if (fromNotes?.value && fromNotes.value !== "unknown") return true;

  return false;
}

function missingRequiredByScope(
  areas: EvaluateWorkAreaInput[],
  qualityLevel: QualityLevel
): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const area of areas) {
    const missing = getMissingRequiredFactsForWorkArea(
      area.workAreaTypeKey,
      area.answers,
      { projectQualityLevel: qualityLevel }
    );
    if (missing.length > 0) {
      result[area.scopeId] = missing.map((f) => f.key);
    } else if (
      !isPricingSupportedWorkAreaType(area.workAreaTypeKey) &&
      getMissingRequiredFactsForWorkArea(area.workAreaTypeKey, area.answers)
        .length > 0
    ) {
      result[area.scopeId] = getMissingRequiredFactsForWorkArea(
        area.workAreaTypeKey,
        area.answers
      ).map((f) => f.key);
    }
  }
  return result;
}

function allRequiredFactsComplete(
  areas: EvaluateWorkAreaInput[],
  qualityLevel: QualityLevel
): boolean {
  return (
    areas.length > 0 &&
    Object.keys(missingRequiredByScope(areas, qualityLevel)).length === 0
  );
}

function filterFinishQuestions(
  questions: PricingQuestion[],
  input: GetNextRequiredAssistantStepInput
): PricingQuestion[] {
  return questions.filter((q) => {
    if (
      shouldSkipFinishLevelQuestion({
        factKey: q.questionKey,
        scopeTypeKey: q.workAreaTypeKey,
        answers: buildMergedAnswersForScope(
          q.scopeId,
          q.scopeName,
          input.knownFactsByScope.find((g) => g.scopeId === q.scopeId)
            ?.scopeTypeName ?? null,
          input.scopeQuestions,
          input.discovery
        ),
        projectQualityLevel: input.globalFacts.qualityLevel,
      })
    ) {
      return !q.questionKey.includes("finish_level");
    }
    return true;
  });
}

function collectScopeQuestions(
  input: GetNextRequiredAssistantStepInput,
  requiredOnly: boolean
): PricingQuestion[] {
  const scopeGroupsWithAnswers = input.knownFactsByScope.map((group) => {
    const area = input.includedScopes.find((a) => a.scopeId === group.scopeId);
    return {
      ...group,
      answers: area?.answers ?? group.answers,
    };
  });

  const all = getNextPricingQuestions(
    {
      scopeGroups: scopeGroupsWithAnswers,
      discovery: input.discovery,
      scopeQuestions: input.scopeQuestions,
      answeredQuestionKeys: input.answeredQuestionKeys,
      qualityLevel: input.globalFacts.qualityLevel,
      selectedConstraintSlugs: input.selectedConstraintSlugs,
    },
    MAX_SCOPE_BATCH,
    requiredOnly ? "required_only" : "optional_only"
  );

  const filtered = all.filter((q) => (requiredOnly ? q.required : !q.required));
  return filterFinishQuestions(filtered, input);
}

function resolveConfidence(
  input: GetNextRequiredAssistantStepInput,
  areas: EvaluateWorkAreaInput[]
): ConfidenceEvaluationResult {
  if (input.confidenceEvaluation) return input.confidenceEvaluation;

  const answeredKeys = input.answeredQuestionKeys ?? new Set<string>();
  const siteAssessed =
    input.siteConstraintsAssessed ??
    isSiteConstraintsAssessed({
      constraintCount: input.selectedConstraintSlugs.length,
      answeredQuestionKeys: answeredKeys,
      constraintsAssessed: input.declinedConstraintSlugs.length > 0,
    });

  return evaluateConfidence({
    workAreas: areas,
    qualityLevel: input.globalFacts.qualityLevel,
    siteConstraintsAssessed: siteAssessed,
  });
}

function buildRequiredIntro(questions: PricingQuestion[]): string {
  const scopeNames = questions.map((q) => q.scopeName);
  if (questions.length === 1) {
    return "I need this detail before pricing this properly.";
  }
  const grouped = formatGroupedScopeQuestions(questions);
  return `${buildRequiredScopeBatchIntro(scopeNames, questions.length)}\n\n${grouped}`;
}

function buildUsefulIntro(
  questions: PricingQuestion[],
  confidence: ConfidenceEvaluationResult,
  hasEstimate: boolean
): string {
  if (hasEstimate) {
    return buildPostEstimateBatchIntro(confidence);
  }
  return `${buildPreEstimateUsefulIntro(confidence, questions.length)}\n\n${formatGroupedScopeQuestions(questions)}`;
}

function hasUsefulGapsBelowTarget(
  confidence: ConfidenceEvaluationResult
): boolean {
  return confidence.scopes.some(
    (s) =>
      !scopeMeetsContinuationTarget(s.status) &&
      (s.missingUseful.length > 0 || s.missingCritical.length > 0)
  );
}

function inferCurrentStep(input: {
  pendingSuggestions: boolean;
  missingGlobalQuality: boolean;
  missingRequiredByScope: Record<string, string[]>;
  pricingBlocked: ScopePricingReadiness[];
  sitePending: number;
  hasEstimate: boolean;
  estimateReady: boolean;
}): AssistantAutopilotStep {
  if (input.pendingSuggestions) return "ready";
  if (input.missingGlobalQuality) return "ask_quality";
  if (Object.keys(input.missingRequiredByScope).length > 0) {
    return "ask_required_scope_questions";
  }
  if (input.pricingBlocked.length > 0) return "ask_pricing_source";
  if (input.sitePending > 0) return "ask_site_conditions";
  if (!input.hasEstimate || !input.estimateReady) return "generate_estimate";
  return "ready";
}

export function getNextRequiredAssistantStep(
  input: GetNextRequiredAssistantStepInput
): GetNextRequiredAssistantStepResult {
  const areas = includedAreas(input);
  const qualityLevel = normaliseQualityLevel(input.globalFacts.qualityLevel);
  const pendingSuggestions =
    (input.pendingSuggestionCount ?? 0) > 0 || areas.length === 0;

  if (pendingSuggestions) {
    logAutopilotDecision({
      currentStep: "ready",
      missingGlobalQuality: !projectQualityResolved(input),
      missingRequiredByScope: {},
      pricingReadiness: [],
      nextStep: "ready",
      questionsGenerated: 0,
    });
    return {
      shouldContinue: false,
      step: "ready",
      message: "Work areas from discovery still need confirmation.",
      questions: [],
      targetScopeIds: [],
    };
  }

  const missingGlobalQuality = !projectQualityResolved(input);
  const missingRequiredMap = missingRequiredByScope(areas, qualityLevel);
  const pricingReadiness =
    input.pricingReadiness ??
    resolveWorkAreasPricingReadiness(areas, qualityLevel);
  const pricingBlocked = scopesNeedingPricingConfirmation(pricingReadiness);
  const pricingAlert = buildPricingSourceAlert(pricingReadiness);

  const answeredKeys = input.answeredQuestionKeys ?? new Set<string>();
  const pendingConstraints = getUnknownSiteConditions({
    workAreaTypeKeys: input.workAreaTypeKeys,
    selectedConstraintSlugs: input.selectedConstraintSlugs,
    declinedConstraintSlugs: input.declinedConstraintSlugs,
    discoveryConstraintSlugs: input.discoveryConstraintSlugs ?? [],
    answeredQuestionKeys: answeredKeys,
  });

  const siteAssessed = isSiteConstraintsAssessed({
    constraintCount: input.selectedConstraintSlugs.length,
    answeredQuestionKeys: answeredKeys,
    constraintsAssessed: input.declinedConstraintSlugs.length > 0,
  });

  const hasEstimate = input.hasEstimate === true;
  const estimateReady = input.estimateReady === true;
  const requiredComplete = allRequiredFactsComplete(areas, qualityLevel);
  const confidence = resolveConfidence(input, areas);

  const currentStep = inferCurrentStep({
    pendingSuggestions: false,
    missingGlobalQuality,
    missingRequiredByScope: missingRequiredMap,
    pricingBlocked,
    sitePending: siteAssessed ? 0 : pendingConstraints.length,
    hasEstimate,
    estimateReady,
  });

  if (missingGlobalQuality) {
    logAutopilotDecision({
      currentStep,
      missingGlobalQuality: true,
      missingRequiredByScope: missingRequiredMap,
      pricingReadiness,
      nextStep: "ask_quality",
      questionsGenerated: 0,
    });
    return {
      shouldContinue: true,
      step: "ask_quality",
      message: QUALITY_PROMPT,
      questions: [],
      targetScopeIds: areas.map((a) => a.scopeId),
    };
  }

  if (!input.userSkippedDetails) {
    const requiredQuestions = collectScopeQuestions(input, true);
    if (requiredQuestions.length > 0) {
      const perScope = new Map<string, number>();
      const capped = requiredQuestions.filter((q) => {
        const count = perScope.get(q.scopeId) ?? 0;
        if (count >= MAX_PER_SCOPE) return false;
        perScope.set(q.scopeId, count + 1);
        return true;
      }).slice(0, MAX_SCOPE_BATCH);

      logAutopilotDecision({
        currentStep,
        missingGlobalQuality: false,
        missingRequiredByScope: missingRequiredMap,
        pricingReadiness,
        nextStep: "ask_required_scope_questions",
        questionsGenerated: capped.length,
      });

      return {
        shouldContinue: true,
        step: "ask_required_scope_questions",
        message: buildRequiredIntro(capped),
        questions: capped,
        targetScopeIds: [...new Set(capped.map((q) => q.scopeId))],
      };
    }
  }

  if (pricingBlocked.length > 0 && pricingAlert && !input.userSkippedDetails) {
    logAutopilotDecision({
      currentStep,
      missingGlobalQuality: false,
      missingRequiredByScope: missingRequiredMap,
      pricingReadiness,
      nextStep: "ask_pricing_source",
      questionsGenerated: 0,
    });
    return {
      shouldContinue: true,
      step: "ask_pricing_source",
      message: pricingAlert.message,
      questions: [],
      targetScopeIds: pricingBlocked.map((s) => s.scopeId),
      pricingAlert,
    };
  }

  if (
    requiredComplete &&
    !siteAssessed &&
    pendingConstraints.length > 0
  ) {
    logAutopilotDecision({
      currentStep,
      missingGlobalQuality: false,
      missingRequiredByScope: missingRequiredMap,
      pricingReadiness,
      nextStep: "ask_site_conditions",
      questionsGenerated: 0,
    });
    return {
      shouldContinue: true,
      step: "ask_site_conditions",
      message: "Confirm site conditions — access, carting, and programme factors.",
      questions: [],
      targetScopeIds: areas.map((a) => a.scopeId),
      constraints: pendingConstraints,
    };
  }

  const prerequisitesMet =
    !missingGlobalQuality &&
    requiredComplete &&
    pricingBlocked.length === 0 &&
    (siteAssessed || pendingConstraints.length === 0);

  if (prerequisitesMet && (!hasEstimate || !estimateReady)) {
    logAutopilotDecision({
      currentStep,
      missingGlobalQuality: false,
      missingRequiredByScope: missingRequiredMap,
      pricingReadiness,
      nextStep: "generate_estimate",
      questionsGenerated: 0,
    });
    return {
      shouldContinue: false,
      step: "generate_estimate",
      message: "Enough detail collected — generating draft estimate.",
      questions: [],
      targetScopeIds: areas.map((a) => a.scopeId),
    };
  }

  if (
    hasEstimate &&
    estimateReady &&
    needsConfidenceContinuation({
      evaluation: confidence,
      userSkippedDetails: input.userSkippedDetails,
    }) &&
    !input.userSkippedDetails
  ) {
    const optionalQuestions = collectScopeQuestions(input, false);
    if (optionalQuestions.length > 0) {
      const capped = optionalQuestions.slice(0, MAX_SCOPE_BATCH);
      logAutopilotDecision({
        currentStep,
        missingGlobalQuality: false,
        missingRequiredByScope: missingRequiredMap,
        pricingReadiness,
        nextStep: "ask_useful_refinement",
        questionsGenerated: capped.length,
      });
      return {
        shouldContinue: true,
        step: "ask_useful_refinement",
        message: buildUsefulIntro(capped, confidence, hasEstimate),
        questions: capped,
        targetScopeIds: [...new Set(capped.map((q) => q.scopeId))],
      };
    }
  }

  if (
    prerequisitesMet &&
    hasEstimate &&
    estimateReady &&
    !input.estimatePartial &&
    shouldStopProactiveQuestions({
      evaluation: confidence,
      userSkippedDetails: input.userSkippedDetails,
    })
  ) {
    logAutopilotDecision({
      currentStep,
      missingGlobalQuality: false,
      missingRequiredByScope: missingRequiredMap,
      pricingReadiness,
      nextStep: "ready",
      questionsGenerated: 0,
    });
    return {
      shouldContinue: false,
      step: "ready",
      message: buildStoppingStatusMessage(confidence).title,
      questions: [],
      targetScopeIds: areas.map((a) => a.scopeId),
    };
  }

  if (
    prerequisitesMet &&
    hasEstimate &&
    estimateReady &&
    needsConfidenceContinuation({
      evaluation: confidence,
      userSkippedDetails: input.userSkippedDetails,
    }) &&
    hasUsefulGapsBelowTarget(confidence) &&
    !input.userSkippedDetails
  ) {
    const gapCount = countActionableConfidenceGaps(confidence);
    const optionalQuestions = collectScopeQuestions(input, false);
    if (optionalQuestions.length > 0) {
      const capped = optionalQuestions.slice(0, MAX_SCOPE_BATCH);
      return {
        shouldContinue: true,
        step: "ask_useful_refinement",
        message: buildUsefulIntro(capped, confidence, hasEstimate),
        questions: capped,
        targetScopeIds: [...new Set(capped.map((q) => q.scopeId))],
      };
    }
    return {
      shouldContinue: false,
      step: "ready",
      message: `A few more details will strengthen this estimate (${gapCount} gaps).`,
      questions: [],
      targetScopeIds: areas.map((a) => a.scopeId),
    };
  }

  logAutopilotDecision({
    currentStep,
    missingGlobalQuality,
    missingRequiredByScope: missingRequiredMap,
    pricingReadiness,
    nextStep: missingGlobalQuality
      ? "ask_quality"
      : Object.keys(missingRequiredMap).length > 0
        ? "ask_required_scope_questions"
        : "ready",
    questionsGenerated: 0,
  });

  if (missingGlobalQuality || Object.keys(missingRequiredMap).length > 0) {
    return {
      shouldContinue: true,
      step: missingGlobalQuality
        ? "ask_quality"
        : "ask_required_scope_questions",
      message: "I need a few details before pricing this properly.",
      questions: [],
      targetScopeIds: areas.map((a) => a.scopeId),
    };
  }

  return {
    shouldContinue: false,
    step: "ready",
    message: buildStoppingStatusMessage(confidence).title,
    questions: [],
    targetScopeIds: areas.map((a) => a.scopeId),
  };
}

export function buildAutopilotInputFromAssistantData(input: {
  confirmedScopes: {
    id: string;
    name: string;
    scope_types: { name: string } | null;
    include_in_quick_estimate?: boolean | null;
  }[];
  scopeGroups: ScopeGroupInput[];
  scopeQuestions: ScopeQuestionWithAnswers[];
  discovery: DiscoveryResult | null;
  qualityLevel: QualityLevel;
  sourceNotes?: string;
  selectedConstraintSlugs: string[];
  declinedConstraintSlugs: string[];
  answeredQuestionKeys?: Set<string>;
  pendingSuggestionCount?: number;
  quickEstimate?: {
    estimated_cost_low: number | null;
    estimated_cost_high: number | null;
    estimate_status?: string | null;
  } | null;
  userSkippedDetails?: boolean;
}): GetNextRequiredAssistantStepInput {
  const includedScopes = input.confirmedScopes
    .filter((s) => s.include_in_quick_estimate !== false)
    .map((scope) => {
      const typeKey = resolveWorkAreaTypeKey(
        scope.scope_types?.name,
        scope.name
      );
      const group = input.scopeGroups.find((g) => g.scopeId === scope.id);
      const merged = buildMergedAnswersForScope(
        scope.id,
        scope.name,
        scope.scope_types?.name ?? null,
        input.scopeQuestions,
        input.discovery
      );
      return {
        scopeId: scope.id,
        scopeName: scope.name,
        workAreaTypeKey: typeKey,
        answers: { ...merged, ...(group?.answers ?? {}) },
        included: true as const,
      };
    });

  const hasEstimate = input.quickEstimate != null;
  const estimateReady =
    hasEstimate &&
    input.quickEstimate!.estimated_cost_low != null &&
    input.quickEstimate!.estimated_cost_high != null &&
    (input.quickEstimate!.estimate_status === "ready" ||
      input.quickEstimate!.estimate_status === "partial");
  const estimatePartial = input.quickEstimate?.estimate_status === "partial";

  return {
    includedScopes,
    pendingSuggestionCount: input.pendingSuggestionCount,
    globalFacts: {
      qualityLevel: input.qualityLevel,
      sourceNotes: input.sourceNotes,
    },
    knownFactsByScope: input.scopeGroups,
    scopeQuestions: input.scopeQuestions,
    discovery: input.discovery,
    workAreaTypeKeys: includedScopes.map((a) => a.workAreaTypeKey),
    selectedConstraintSlugs: input.selectedConstraintSlugs,
    declinedConstraintSlugs: input.declinedConstraintSlugs,
    discoveryConstraintSlugs: input.discovery?.constraints?.map((c) => c.slug),
    answeredQuestionKeys: input.answeredQuestionKeys,
    hasEstimate,
    estimateReady,
    estimatePartial,
    userSkippedDetails: input.userSkippedDetails,
  };
}
