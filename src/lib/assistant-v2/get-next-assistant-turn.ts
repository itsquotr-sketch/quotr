import type { QualityLevel } from "@/lib/constants/quality-level";
import type { DiscoveryResult } from "@/lib/ai/discovery/types";
import {
  getUnknownSiteConditions,
  type ConstraintQuestion,
} from "@/lib/assistant-v2/get-next-constraint-question";
import { buildMergedAnswersForScope } from "@/lib/assistant-v2/build-merged-answers";
import { resolveWorkAreaTypeKey } from "@/lib/project-assistant-questions";
import type { PricingQuestion } from "@/lib/assistant-v2/get-next-pricing-question";
import type { ScopeGroupInput } from "@/lib/assistant-v2/get-next-pricing-question";
import type { ScopeQuestionWithAnswers } from "@/lib/project-assistant-data";
import { normalizeQuestionKey } from "@/lib/question-keys";
import {
  buildAutopilotInputFromAssistantData,
  getNextRequiredAssistantStep,
} from "@/lib/assistant-v2/autopilot/get-next-required-assistant-step";

export type QualityTurn = {
  kind: "quality";
  prompt: string;
  currentLevel: QualityLevel;
  options: { value: QualityLevel; label: string }[];
};

export type PricingSourceTurn = {
  kind: "pricing_source";
  message: string;
  options: { id: string; label: string }[];
};

export type AssistantTurn =
  | {
      kind: "scope_batch";
      questions: PricingQuestion[];
      intro: string;
      hasRequired: boolean;
    }
  | { kind: "constraint_batch"; constraints: ConstraintQuestion[] }
  | { kind: "quality"; turn: QualityTurn }
  | { kind: "pricing_source"; turn: PricingSourceTurn };

const QUALITY_OPTIONS: { value: QualityLevel; label: string }[] = [
  { value: "budget", label: "Budget / basic" },
  { value: "standard", label: "Standard / mid-spec" },
  { value: "premium", label: "Premium / high-spec" },
  { value: "unknown", label: "Not sure" },
];

function buildStageWorkAreas(
  scopeGroups: ScopeGroupInput[],
  scopeQuestions: ScopeQuestionWithAnswers[],
  discovery: DiscoveryResult | null
) {
  return scopeGroups.map((group) => ({
    scopeId: group.scopeId,
    scopeName: group.scopeName,
    workAreaTypeKey: resolveWorkAreaTypeKey(
      group.scopeTypeName,
      group.scopeName
    ),
    answers: {
      ...buildMergedAnswersForScope(
        group.scopeId,
        group.scopeName,
        group.scopeTypeName,
        scopeQuestions,
        discovery
      ),
      ...(group.answers ?? {}),
    },
    included: true,
  }));
}

export function getNextAssistantTurn(input: {
  scopeGroups: ScopeGroupInput[];
  workAreaTypeKeys: string[];
  discovery: DiscoveryResult | null;
  scopeQuestions: ScopeQuestionWithAnswers[];
  selectedConstraintSlugs: string[];
  declinedConstraintSlugs: Set<string>;
  qualityLevel: QualityLevel;
  answeredQuestionKeys: Set<string>;
  pendingSuggestionCount?: number;
  hasEstimate?: boolean;
  estimateReady?: boolean;
  estimatePartial?: boolean;
  userSkippedDetails?: boolean;
  sourceNotes?: string;
}): AssistantTurn | null {
  const workAreas = buildStageWorkAreas(
    input.scopeGroups,
    input.scopeQuestions,
    input.discovery
  );

  const autopilotInput = buildAutopilotInputFromAssistantData({
    confirmedScopes: workAreas.map((a) => ({
      id: a.scopeId,
      name: a.scopeName,
      scope_types: { name: a.workAreaTypeKey },
      include_in_quick_estimate: true,
    })),
    scopeGroups: input.scopeGroups,
    scopeQuestions: input.scopeQuestions,
    discovery: input.discovery,
    qualityLevel: input.qualityLevel,
    sourceNotes: input.sourceNotes,
    selectedConstraintSlugs: input.selectedConstraintSlugs,
    declinedConstraintSlugs: [...input.declinedConstraintSlugs],
    answeredQuestionKeys: input.answeredQuestionKeys,
    pendingSuggestionCount: input.pendingSuggestionCount,
    quickEstimate: input.hasEstimate
      ? {
          estimated_cost_low: input.estimateReady ? 1 : null,
          estimated_cost_high: input.estimateReady ? 1 : null,
          estimate_status: input.estimatePartial
            ? "partial"
            : input.estimateReady
              ? "ready"
              : null,
        }
      : null,
    userSkippedDetails: input.userSkippedDetails,
  });

  const step = getNextRequiredAssistantStep(autopilotInput);

  if (!step.shouldContinue) {
    return null;
  }

  switch (step.step) {
    case "ask_quality":
      return {
        kind: "quality",
        turn: {
          kind: "quality",
          prompt: step.message,
          currentLevel: input.qualityLevel,
          options: QUALITY_OPTIONS,
        },
      };

    case "ask_required_scope_questions":
      if (step.questions.length > 0) {
        return {
          kind: "scope_batch",
          questions: step.questions,
          intro: step.message,
          hasRequired: true,
        };
      }
      return null;

    case "ask_useful_refinement":
      if (step.questions.length > 0) {
        return {
          kind: "scope_batch",
          questions: step.questions,
          intro: step.message,
          hasRequired: false,
        };
      }
      return null;

    case "ask_pricing_source":
      if (step.pricingAlert) {
        return {
          kind: "pricing_source",
          turn: {
            kind: "pricing_source",
            message: step.message,
            options: step.pricingAlert.options,
          },
        };
      }
      return null;

    case "ask_site_conditions":
      if (step.constraints && step.constraints.length > 0) {
        return { kind: "constraint_batch", constraints: step.constraints };
      }
      {
        const discoverySlugs =
          input.discovery?.constraints?.map((c) => c.slug) ?? [];
        const pendingConstraints = getUnknownSiteConditions({
          workAreaTypeKeys: input.workAreaTypeKeys,
          selectedConstraintSlugs: input.selectedConstraintSlugs,
          discoveryConstraintSlugs: discoverySlugs,
          answeredQuestionKeys: input.answeredQuestionKeys,
          declinedConstraintSlugs: [...input.declinedConstraintSlugs],
        });
        if (pendingConstraints.length > 0) {
          return { kind: "constraint_batch", constraints: pendingConstraints };
        }
      }
      return null;

    default:
      return null;
  }
}

export function collectAnsweredQuestionKeys(
  scopeQuestions: ScopeQuestionWithAnswers[]
): Set<string> {
  const keys = new Set<string>();
  for (const question of scopeQuestions) {
    const key = normalizeQuestionKey(question.question_key);
    if (key) keys.add(key);
    if (question.scope_answers?.[0] && question.question_key) {
      keys.add(question.question_key);
    }
  }
  return keys;
}
