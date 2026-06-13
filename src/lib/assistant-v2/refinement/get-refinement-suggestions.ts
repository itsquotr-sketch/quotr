import {
  getSharpeningSuggestions,
  type SharpeningInput,
  type SharpeningSuggestion,
} from "@/lib/assistant-v2/estimate-sharpening/get-sharpening-suggestions";
import type { QuickEstimateWorkAreaInput } from "@/lib/cost-engine/quick-estimate-input";
import {
  getScopeRefinementSuggestions,
  type ScopeRefinementInput,
  type ScopeRefinementSuggestion,
} from "@/lib/assistant-v2/refinement/get-scope-refinement-suggestions";
import { isScopeSupportedWorkArea } from "@/lib/scopes";
import { z } from "zod";

export {
  formatScopeRefinementResponse as formatRefinementResponse,
  REFINEMENT_ACTION_CHIPS,
  refinementImpactSchema,
  scopeRefinementSuggestionSchema,
  type RefinementImpact,
  type ScopeRefinementSuggestion,
  type MissingInformationItem,
  buildScopedMissingInformation,
} from "@/lib/assistant-v2/refinement/get-scope-refinement-suggestions";

export const refinementSuggestionSchema = z.object({
  id: z.string(),
  priority: z.number(),
  label: z.string(),
  reason: z.string(),
  scopeId: z.string().uuid().optional(),
  factKey: z.string().optional(),
  suggestedQuestion: z.string(),
  answerOptions: z
    .array(z.object({ value: z.string(), label: z.string() }))
    .optional(),
  impact: z.enum(["high", "medium", "low"]),
});

export type RefinementSuggestion = z.infer<typeof refinementSuggestionSchema>;

export type RefinementInput = SharpeningInput & {
  excludedScopeNames?: string[];
  customScopesNeedingPricing?: { scopeId: string; name: string }[];
  lowConfidenceScopeNames?: string[];
};

const IMPACT_PRIORITY: Record<"high" | "medium" | "low", number> = {
  high: 3,
  medium: 2,
  low: 1,
};

function toRefinementSuggestion(
  item: SharpeningSuggestion | ScopeRefinementSuggestion,
  priority: number
): RefinementSuggestion {
  if ("question" in item) {
    return {
      id: item.factKey,
      priority,
      label: item.label,
      reason: item.reason,
      scopeId: item.scopeId,
      factKey: item.factKey,
      suggestedQuestion: item.question,
      answerOptions: item.answerOptions,
      impact: item.impact,
    };
  }

  return {
    id: item.key,
    priority,
    label: item.label,
    reason: item.reason,
    scopeId: item.relatedScopeId,
    factKey: item.key.includes(".") ? item.key : undefined,
    suggestedQuestion: item.questionText,
    answerOptions: item.answerOptions,
    impact: item.impact,
  };
}

function buildCustomScopeSuggestions(
  customScopes: { scopeId: string; name: string }[],
  startPriority: number
): RefinementSuggestion[] {
  return customScopes.map((scope, index) => ({
    id: `custom_scope_${scope.scopeId}`,
    priority: startPriority - index * 0.01,
    label: scope.name,
    reason: "Custom work area needs pricing before it can be included.",
    scopeId: scope.scopeId,
    suggestedQuestion: `Do you want to add pricing for ${scope.name}?`,
    impact: "medium" as const,
  }));
}

function buildLowConfidenceSuggestions(
  names: string[],
  startPriority: number
): RefinementSuggestion[] {
  return names.map((name, index) => ({
    id: `low_confidence_${name.toLowerCase().replace(/\s+/g, "_")}`,
    priority: startPriority - index * 0.01,
    label: name,
    reason: "Low confidence — a few more details would tighten this work area.",
    suggestedQuestion: `Can you confirm more details for ${name}?`,
    impact: "low" as const,
  }));
}

function findCustomScopesNeedingPricing(
  workAreas: QuickEstimateWorkAreaInput[],
  excludedNames: string[]
): { scopeId: string; name: string }[] {
  return workAreas
    .filter(
      (area) =>
        !isScopeSupportedWorkArea(area.workAreaTypeKey) &&
        !excludedNames.includes(area.name)
    )
    .map((area) => ({ scopeId: area.scopeId, name: area.name }));
}

/**
 * Prioritised refinement suggestions — delegates to scope refinement engine.
 */
export function getRefinementSuggestions(
  input: RefinementInput,
  limit = 5
): RefinementSuggestion[] {
  const scopeInput: ScopeRefinementInput = {
    workAreas: input.workAreas.map((area) => ({
      scopeId: area.scopeId,
      scopeName: area.name,
      workAreaTypeKey: area.workAreaTypeKey,
      answers: area.answers,
      included: true,
    })),
    estimateTrace: input.estimateTrace,
    hasUserRates: input.hasUserRates,
    limit: limit * 2,
  };

  const scopeSuggestions = getScopeRefinementSuggestions(scopeInput);

  const suggestions: RefinementSuggestion[] = scopeSuggestions.map(
    (item, index) =>
      toRefinementSuggestion(
        item,
        IMPACT_PRIORITY[item.impact] - index * 0.001
      )
  );

  if (suggestions.length < limit) {
    const sharpening = getSharpeningSuggestions(input, limit * 2);
    for (const item of sharpening) {
      if (suggestions.some((s) => s.factKey === item.key || s.label === item.label)) {
        continue;
      }
      suggestions.push(
        toRefinementSuggestion(
          item,
          IMPACT_PRIORITY[item.impact] - suggestions.length * 0.001
        )
      );
    }
  }

  const customScopes =
    input.customScopesNeedingPricing ??
    findCustomScopesNeedingPricing(
      input.workAreas,
      input.excludedScopeNames ?? []
    );

  suggestions.push(...buildCustomScopeSuggestions(customScopes, 1.5));

  if (input.lowConfidenceScopeNames?.length) {
    suggestions.push(
      ...buildLowConfidenceSuggestions(input.lowConfidenceScopeNames, 0.5)
    );
  }

  return suggestions
    .sort((a, b) => b.priority - a.priority)
    .slice(0, limit);
}
