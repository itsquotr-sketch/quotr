import { isSiteConstraintsAssessed } from "@/lib/cost-engine/estimate-quality";
import {
  resolveQuestionDef,
  resolveWorkAreaTypeKey,
} from "@/lib/project-assistant-questions";
import { normalizeQuestionKey } from "@/lib/question-keys";
import { isAnswered } from "@/lib/scope-answer-state";
import {
  getScopeByWorkAreaType,
  isScopeSupportedWorkArea,
  questionKeyMatchesScopeFact,
} from "@/lib/scopes";
import { isTemplateRequiredQuestion } from "@/lib/scope-templates";
import type { ScopeQuestionWithAnswers } from "@/lib/project-assistant-data";
import type {
  ProjectScope,
  ProjectScopeSuggestion,
  QuickEstimate,
} from "@/types/database";

export type AssistantNextStepAction =
  | "analyse"
  | "confirm_work_areas"
  | "answer_questions"
  | "site_conditions"
  | "generate_estimate"
  | "update_estimate";

export type AssistantNextStep = {
  action: AssistantNextStepAction;
  message: string;
  buttonLabel: string;
  scrollTarget?: "brain_dump" | "found" | "needs" | "site_conditions" | "estimate";
  missingQuestionCount?: number;
  pendingWorkAreaCount?: number;
};

function isRequiredQuestionAnswered(
  question: ScopeQuestionWithAnswers,
  typeKey: string
): boolean {
  const row = question.scope_answers?.[0];
  const def = resolveQuestionDef(question, typeKey);
  const inputType = question.question_type ?? def?.inputType ?? "text";
  return isAnswered(row?.answer, row?.source, {
    inputType: inputType as "text" | "number" | "select" | "boolean",
    requiresPositiveNumber: inputType === "number",
  });
}

function countMissingRequiredQuestions(
  confirmedScopes: (ProjectScope & { scope_types: { name: string } | null })[],
  scopeQuestions: ScopeQuestionWithAnswers[]
): number {
  let missing = 0;

  for (const scope of confirmedScopes) {
    const typeKey = resolveWorkAreaTypeKey(scope.scope_types?.name, scope.name);
    const questions = scopeQuestions.filter((q) => q.project_scope_id === scope.id);

    for (const q of questions) {
      const belongs =
        isScopeSupportedWorkArea(typeKey)
          ? questionKeyMatchesScopeFact(q.question_key, typeKey)
          : isTemplateRequiredQuestion(typeKey, q.question_key);

      if (!belongs) continue;

      const key = normalizeQuestionKey(q.question_key);
      const scopeDef = getScopeByWorkAreaType(typeKey);
      const isRequired =
        scopeDef?.requiredFacts.some((f) => f.key === key) ??
        isTemplateRequiredQuestion(typeKey, q.question_key);

      if (isRequired && !isRequiredQuestionAnswered(q, typeKey)) {
        missing++;
      }
    }
  }

  return missing;
}

export function resolveAssistantNextStep(input: {
  hasNotes: boolean;
  discoveryRan: boolean;
  pendingSuggestions: ProjectScopeSuggestion[];
  confirmedScopes: (ProjectScope & { scope_types: { name: string } | null })[];
  scopeQuestions: ScopeQuestionWithAnswers[];
  selectedConstraintSlugs: string[];
  answeredQuestionKeys: Set<string>;
  quickEstimate: QuickEstimate | null;
}): AssistantNextStep | null {
  const pendingWorkAreas = input.pendingSuggestions.filter(
    (s) => s.status === "pending"
  );

  if (!input.discoveryRan && input.hasNotes) {
    return {
      action: "analyse",
      message: "Save your notes and analyse to see what Quotr finds.",
      buttonLabel: "Analyse Project",
      scrollTarget: "brain_dump",
    };
  }

  if (pendingWorkAreas.length > 0) {
    const count = pendingWorkAreas.length;
    return {
      action: "confirm_work_areas",
      message: `Quotr found ${count} work area${count === 1 ? "" : "s"}. Confirm ${count === 1 ? "it" : "them"} to continue.`,
      buttonLabel: count === 1 ? "Confirm work area" : "Confirm work areas",
      scrollTarget: "found",
      pendingWorkAreaCount: count,
    };
  }

  if (input.confirmedScopes.length === 0) {
    if (!input.hasNotes) {
      return {
        action: "analyse",
        message: "Add project notes in the brain dump to get started.",
        buttonLabel: "Add notes",
        scrollTarget: "brain_dump",
      };
    }
    return null;
  }

  const missingQuestions = countMissingRequiredQuestions(
    input.confirmedScopes,
    input.scopeQuestions
  );

  if (missingQuestions > 0) {
    return {
      action: "answer_questions",
      message: `Answer ${missingQuestions} question${missingQuestions === 1 ? "" : "s"} to improve this estimate.`,
      buttonLabel: "Answer key questions",
      scrollTarget: "needs",
      missingQuestionCount: missingQuestions,
    };
  }

  const siteAssessed = isSiteConstraintsAssessed({
    constraintCount: input.selectedConstraintSlugs.length,
    answeredQuestionKeys: input.answeredQuestionKeys,
  });

  if (!siteAssessed) {
    return {
      action: "site_conditions",
      message: "Confirm site conditions to tighten the range.",
      buttonLabel: "Review site conditions",
      scrollTarget: "site_conditions",
    };
  }

  const hasEstimate =
    input.quickEstimate?.estimated_cost_low != null &&
    input.quickEstimate?.estimated_cost_high != null;

  if (hasEstimate) {
    return {
      action: "update_estimate",
      message: "Your draft estimate is ready — update it when details change.",
      buttonLabel: "Update Draft Quick Estimate",
      scrollTarget: "estimate",
    };
  }

  return {
    action: "generate_estimate",
    message: "Ready to generate a draft quick estimate.",
    buttonLabel: "Generate Draft Quick Estimate",
    scrollTarget: "estimate",
  };
}
