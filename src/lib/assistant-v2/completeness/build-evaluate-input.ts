import type { QualityLevel } from "@/lib/constants/quality-level";
import type { DiscoveryResult } from "@/lib/ai/discovery/types";
import { buildMergedAnswersForScope } from "@/lib/assistant-v2/build-merged-answers";
import {
  evaluateProjectCompleteness,
  type EvaluateProjectCompletenessInput,
  type EvaluateWorkAreaInput,
} from "@/lib/assistant-v2/completeness/evaluate-project-completeness";
import {
  getMissingOptionalHighImpact,
  getMissingRequiredFacts,
} from "@/lib/scopes/missing-facts";
import type { ScopeQuestionWithAnswers } from "@/lib/project-assistant-data";
import { resolveWorkAreaTypeKey } from "@/lib/project-assistant-questions";
import type { ProjectScope } from "@/types/database";

export function buildEvaluateWorkAreas(
  scopes: (ProjectScope & { scope_types: { name: string } | null })[],
  scopeQuestions: ScopeQuestionWithAnswers[],
  discovery: DiscoveryResult | null
): EvaluateWorkAreaInput[] {
  return scopes.map((scope) => ({
    scopeId: scope.id,
    scopeName: scope.name,
    workAreaTypeKey: resolveWorkAreaTypeKey(
      scope.scope_types?.name,
      scope.name
    ),
    answers: buildMergedAnswersForScope(
      scope.id,
      scope.name,
      scope.scope_types?.name ?? null,
      scopeQuestions,
      discovery
    ),
    included: scope.include_in_quick_estimate !== false,
  }));
}

export function buildEvaluateInput(
  params: {
    scopes: (ProjectScope & { scope_types: { name: string } | null })[];
    scopeQuestions: ScopeQuestionWithAnswers[];
    discovery: DiscoveryResult | null;
    qualityLevel: QualityLevel;
    selectedConstraintSlugs: string[];
    declinedConstraintSlugs: string[];
    pendingSuggestionCount?: number;
  }
): EvaluateProjectCompletenessInput {
  return {
    workAreas: buildEvaluateWorkAreas(
      params.scopes,
      params.scopeQuestions,
      params.discovery
    ),
    pendingSuggestionCount: params.pendingSuggestionCount,
    qualityLevel: params.qualityLevel,
    selectedConstraintSlugs: params.selectedConstraintSlugs,
    declinedConstraintSlugs: params.declinedConstraintSlugs,
    discoveryConstraintSlugs:
      params.discovery?.constraints?.map((c) => c.slug) ?? [],
  };
}

export function evaluateAssistantProjectCompleteness(
  params: Parameters<typeof buildEvaluateInput>[0]
) {
  return evaluateProjectCompleteness(buildEvaluateInput(params));
}

export function getFollowUpFactQuestionsForScope(
  workAreas: EvaluateWorkAreaInput[],
  scopeId: string,
  limit = 3
): string[] {
  const area = workAreas.find((a) => a.scopeId === scopeId);
  if (!area || !area.included) return [];

  const facts = [
    ...getMissingRequiredFacts(area.workAreaTypeKey, area.answers),
    ...getMissingOptionalHighImpact(area.workAreaTypeKey, area.answers),
  ];

  return facts
    .slice(0, limit)
    .map((f) => f.questionText || f.label);
}

export function getFollowUpQuestionsForScope(
  workAreas: EvaluateWorkAreaInput[],
  scopeId: string,
  limit = 3
): string[] {
  return getFollowUpFactQuestionsForScope(workAreas, scopeId, limit);
}
