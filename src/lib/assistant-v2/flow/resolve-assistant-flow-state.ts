import type { QualityLevel } from "@/lib/constants/quality-level";
import type { EvaluateWorkAreaInput } from "@/lib/assistant-v2/completeness/evaluate-project-completeness";
import type { PricingQuestion } from "@/lib/assistant-v2/get-next-pricing-question";
import {
  buildAutopilotInputFromAssistantData,
  getNextRequiredAssistantStep,
} from "@/lib/assistant-v2/autopilot/get-next-required-assistant-step";
import {
  countActionableConfidenceGaps,
  scopesHeldBackByRatesOnly,
} from "@/lib/assistant-v2/confidence/confidence-continuation";
import type { ConfidenceEvaluationResult } from "@/lib/assistant-v2/confidence/evaluate-confidence";
import { evaluateConfidence } from "@/lib/assistant-v2/confidence/evaluate-confidence";
import { isSiteConstraintsAssessed } from "@/lib/cost-engine/estimate-quality";

export type AssistantFlowState =
  | "needs_work_area_confirmation"
  | "needs_quality_confirmation"
  | "needs_required_scope_details"
  | "needs_pricing_source_confirmation"
  | "needs_site_conditions"
  | "needs_confidence_refinement"
  | "ready_for_estimate"
  | "estimate_ready"
  | "optional_refinement";

export type FlowNextBestAction = {
  type: string;
  label: string;
  scopeId?: string;
  scopeTypeKey?: string;
  questions?: PricingQuestion[];
};

export type AssistantFlowResult = {
  state: AssistantFlowState;
  reason: string;
  nextBestAction: FlowNextBestAction;
  pricingAlert?: { message: string; options: { id: string; label: string }[] };
};

export type ResolveAssistantFlowInput = {
  workAreas: EvaluateWorkAreaInput[];
  pendingSuggestionCount?: number;
  qualityLevel: QualityLevel;
  selectedConstraintSlugs: string[];
  declinedConstraintSlugs: string[];
  discoveryConstraintSlugs?: string[];
  answeredQuestionKeys?: Set<string>;
  hasEstimate?: boolean;
  estimateReady?: boolean;
  estimatePartial?: boolean;
  userSkippedDetails?: boolean;
  sourceNotes?: string;
  confidenceEvaluation?: ConfidenceEvaluationResult;
  siteConstraintsAssessed?: boolean;
};

export type FlowStatusMessage = {
  title: string;
  subtitle: string;
};

function buildConfidenceRefinementAction(
  confidence: ConfidenceEvaluationResult
): FlowNextBestAction {
  const gapCount = countActionableConfidenceGaps(confidence);
  const rateOnly = scopesHeldBackByRatesOnly(confidence);
  if (rateOnly.length > 0 && gapCount === 0) {
    return {
      type: "add_rate",
      label: "Add your rate",
      scopeTypeKey: rateOnly[0],
    };
  }

  const weakScope = confidence.scopes.find(
    (s) => s.status !== "good" && s.status !== "ready"
  );

  return {
    type: "improve_confidence",
    label:
      gapCount > 0 ? `Answer ${gapCount} details` : "Improve estimate",
    scopeId: weakScope?.scopeId,
    scopeTypeKey: weakScope?.scopeTypeKey,
  };
}

function mapAutopilotToFlow(
  input: ResolveAssistantFlowInput,
  areas: EvaluateWorkAreaInput[]
): AssistantFlowResult {
  const answeredKeys = input.answeredQuestionKeys ?? new Set<string>();
  const siteAssessed =
    input.siteConstraintsAssessed ??
    isSiteConstraintsAssessed({
      constraintCount: input.selectedConstraintSlugs.length,
      answeredQuestionKeys: answeredKeys,
      constraintsAssessed: input.declinedConstraintSlugs.length > 0,
    });

  const confidence =
    input.confidenceEvaluation ??
    evaluateConfidence({
      workAreas: areas,
      qualityLevel: input.qualityLevel,
      siteConstraintsAssessed: siteAssessed,
    });

  const autopilot = getNextRequiredAssistantStep(
    buildAutopilotInputFromAssistantData({
      confirmedScopes: areas.map((a) => ({
        id: a.scopeId,
        name: a.scopeName,
        scope_types: { name: a.workAreaTypeKey },
        include_in_quick_estimate: a.included !== false,
      })),
      scopeGroups: areas.map((a) => ({
        scopeId: a.scopeId,
        scopeName: a.scopeName,
        scopeTypeName: a.workAreaTypeKey,
        questions: [],
        answers: a.answers,
      })),
      scopeQuestions: [],
      discovery: null,
      qualityLevel: input.qualityLevel,
      sourceNotes: input.sourceNotes,
      selectedConstraintSlugs: input.selectedConstraintSlugs,
      declinedConstraintSlugs: input.declinedConstraintSlugs,
      answeredQuestionKeys: answeredKeys,
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
    })
  );

  switch (autopilot.step) {
    case "ask_quality":
      return {
        state: "needs_quality_confirmation",
        reason: "Quality/spec level should be confirmed before scope details.",
        nextBestAction: {
          type: "select_quality",
          label: "What spec should I assume?",
        },
      };
    case "ask_required_scope_questions":
      return {
        state: "needs_required_scope_details",
        reason: autopilot.message,
        nextBestAction: {
          type: "ask_required",
          label: "Answer missing details",
          scopeId: autopilot.targetScopeIds[0],
        },
      };
    case "ask_pricing_source":
      return {
        state: "needs_pricing_source_confirmation",
        reason: autopilot.message,
        nextBestAction: {
          type: "confirm_pricing_source",
          label:
            autopilot.pricingAlert?.options[0]?.label ?? "Resolve pricing",
          scopeId: autopilot.targetScopeIds[0],
        },
        pricingAlert: autopilot.pricingAlert,
      };
    case "ask_site_conditions":
      return {
        state: "needs_site_conditions",
        reason: "Required scope facts collected — site conditions come next.",
        nextBestAction: {
          type: "assess_constraints",
          label: "Confirm site conditions",
        },
      };
    case "generate_estimate":
      return {
        state: "ready_for_estimate",
        reason: autopilot.message,
        nextBestAction: {
          type: "generate_estimate",
          label: "Generate quick estimate",
        },
      };
    case "ask_useful_refinement":
      return {
        state: "needs_confidence_refinement",
        reason: "High-impact scope details would improve confidence.",
        nextBestAction: buildConfidenceRefinementAction(confidence),
      };
    case "ready":
    default:
      if (input.hasEstimate && input.estimateReady && !input.estimatePartial) {
        return {
          state: "estimate_ready",
          reason: autopilot.message,
          nextBestAction: {
            type: "view_estimate",
            label: "View estimate detail",
          },
        };
      }
      return {
        state: "ready_for_estimate",
        reason: autopilot.message,
        nextBestAction: {
          type: "generate_estimate",
          label: "Generate quick estimate",
        },
      };
  }
}

export function resolveAssistantFlowState(
  input: ResolveAssistantFlowInput
): AssistantFlowResult {
  const areas = input.workAreas.filter((a) => a.included !== false);

  if ((input.pendingSuggestionCount ?? 0) > 0 || areas.length === 0) {
    return {
      state: "needs_work_area_confirmation",
      reason: "Work areas from discovery still need confirmation.",
      nextBestAction: {
        type: "confirm_scopes",
        label: "Here's what I'll estimate",
      },
    };
  }

  return mapAutopilotToFlow(input, areas);
}

export function flowBlocksSiteConditions(state: AssistantFlowState): boolean {
  return (
    state === "needs_work_area_confirmation" ||
    state === "needs_quality_confirmation" ||
    state === "needs_required_scope_details" ||
    state === "needs_pricing_source_confirmation" ||
    state === "needs_confidence_refinement"
  );
}

export function flowBlocksOptionalRefinement(state: AssistantFlowState): boolean {
  return (
    flowBlocksSiteConditions(state) ||
    state === "needs_site_conditions" ||
    state === "ready_for_estimate"
  );
}

export function describeFlowStatusMessage(
  state: AssistantFlowState,
  options?: { hasUsefulGaps?: boolean }
): FlowStatusMessage {
  switch (state) {
    case "needs_work_area_confirmation":
      return {
        title: "Here's what I'll estimate",
        subtitle: "Confirm which work areas belong in this estimate.",
      };
    case "needs_quality_confirmation":
      return {
        title: "What spec level should I assume for this estimate?",
        subtitle: "Budget, standard, or premium — this sets finish allowances.",
      };
    case "needs_required_scope_details":
      return {
        title: "I need a few details before pricing this properly.",
        subtitle: "Answer the scope questions below — site conditions come after.",
      };
    case "needs_pricing_source_confirmation":
      return {
        title: "Some scopes need pricing before I can include them.",
        subtitle: "Choose how to handle scopes without a rate or enough detail.",
      };
    case "needs_site_conditions":
      return {
        title: "Almost there",
        subtitle:
          "Confirm site conditions — access, carting, and programme factors.",
      };
    case "needs_confidence_refinement":
      return {
        title: "A few more details will strengthen this estimate.",
        subtitle:
          "These are the highest-impact details. Site conditions come next.",
      };
    case "estimate_ready":
      return {
        title: "Ready for a draft quick estimate.",
        subtitle: "Enough detail for review — check the live estimate.",
      };
    case "optional_refinement":
      if (options?.hasUsefulGaps) {
        return {
          title: "Solid draft — a few details would sharpen it.",
          subtitle: "Optional details would tighten the range.",
        };
      }
      return {
        title: "Enough information has been provided for a draft estimate.",
        subtitle: "Add more detail anytime to sharpen the range.",
      };
    case "ready_for_estimate":
    default:
      return {
        title: "I need a few details before pricing this properly.",
        subtitle: "Answer the scope questions below — site conditions come after.",
      };
  }
}

export function buildRequiredScopeBatchIntro(
  scopeNames: string[],
  questionCount: number
): string {
  const uniqueScopes = [...new Set(scopeNames)];
  if (questionCount === 1) {
    return "I need this detail before pricing this properly.";
  }
  if (uniqueScopes.length === 1) {
    return `I need a few ${uniqueScopes[0]!.toLowerCase()} details before pricing this properly.`;
  }
  return `I need these details before pricing this properly.`;
}

export function formatGroupedScopeQuestions(
  questions: PricingQuestion[]
): string {
  const byScope = new Map<string, PricingQuestion[]>();
  for (const q of questions) {
    const list = byScope.get(q.scopeName) ?? [];
    list.push(q);
    byScope.set(q.scopeName, list);
  }

  const sections: string[] = [];
  for (const [scopeName, qs] of byScope) {
    const lines = qs.map((q) => `- ${contextualShortQuestion(q)}`);
    sections.push(`${scopeName}\n${lines.join("\n")}`);
  }
  return sections.join("\n\n");
}

function contextualShortQuestion(q: PricingQuestion): string {
  const key = q.questionKey.toLowerCase();
  if (key.includes("level_type")) return "Is the deck ground level or elevated?";
  if (key === "fence.height_m") return "What height should I allow for?";
  if (key === "fence.fence_type" || key === "fence.material_type") {
    return "What type of fence should I assume?";
  }
  if (key.includes("retaining_wall.material")) {
    return "What material should I assume?";
  }
  return q.questionText.replace(/\?$/, "") + "?";
}
