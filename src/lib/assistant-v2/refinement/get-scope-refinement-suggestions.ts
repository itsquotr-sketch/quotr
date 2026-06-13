import type { EstimateTrace } from "@/lib/cost-engine/estimate-trace";
import type { EvaluateWorkAreaInput } from "@/lib/assistant-v2/completeness/evaluate-project-completeness";
import { getCurrentMissingItems, getCriticalOrUsefulMissing } from "@/lib/assistant-v2/missing/get-current-missing-items";
import {
  getMissingOptionalHighImpact,
  getMissingRequiredFacts,
} from "@/lib/scopes/missing-facts";import { getScopeByWorkAreaType } from "@/lib/scopes";
import type { ScopeFactDefinition } from "@/lib/scopes/types";
import { z } from "zod";

export const refinementImpactSchema = z.enum(["high", "medium", "low"]);
export type RefinementImpact = z.infer<typeof refinementImpactSchema>;

export const scopeRefinementSuggestionSchema = z.object({
  factKey: z.string(),
  label: z.string(),
  question: z.string(),
  reason: z.string(),
  impact: refinementImpactSchema,
  answerOptions: z
    .array(z.object({ value: z.string(), label: z.string() }))
    .optional(),
  affectsEstimate: z.boolean(),
  scopeId: z.string().optional(),
  scopeName: z.string().optional(),
  required: z.boolean().optional(),
});

export type ScopeRefinementSuggestion = z.infer<
  typeof scopeRefinementSuggestionSchema
>;

export type ScopeRefinementInput = {
  workAreas: EvaluateWorkAreaInput[];
  scopeId?: string;
  scopeName?: string;
  estimateTrace?: EstimateTrace | null;
  hasUserRates?: boolean;
  limit?: number;
};

const IMPACT_PRIORITY: Record<RefinementImpact, number> = {
  high: 3,
  medium: 2,
  low: 1,
};

/** Plain-language impact reasons scoped by work area and fact. */
const FACT_IMPACT_REASONS: Record<string, string> = {
  "deck.finish_level": "affects decking material and labour allowance",
  "deck.has_stairs": "stairs can materially change labour and materials",
  "deck.has_balustrade": "this can add a supplier/trade allowance",
  "deck.material_type": "timber vs composite changes the base rate",
  "deck.level_type": "elevated decks need piles and more labour",
  "deck.height_m": "height affects structure and access requirements",
  "deck.area_m2": "area drives the core deck allowance",
  "deck.has_pergola": "pergola adds materials and specialist labour",
  "deck.has_existing_deck": "demolition adds labour and disposal",
  "deck.tight_access": "access affects labour and machinery",
  "deck.material_supply": "supply mode changes material allowance",
  "deck.balustrade_supply": "client-supplied balustrade reduces material cost",
  "retaining_wall.material": "timber/block/concrete changes the base rate",
  "retaining_wall.machine_access": "affects excavation and labour",
  "retaining_wall.length_m": "length drives wall area and cost",
  "retaining_wall.height_m": "height affects engineering and build cost",
  "retaining_wall.has_drainage": "drainage adds materials and labour",
  "retaining_wall.has_backfill": "backfill adds earthworks allowance",
  "retaining_wall.has_spoil_removal": "spoil removal adds cartage allowance",
  "retaining_wall.carting_distance_m": "distance affects cartage cost",
  "retaining_wall.surcharge_loading": "loading above the wall increases risk",
  "bathroom.floor_area_m2": "floor area drives the core renovation allowance",
  "bathroom.finish_level": "finish level affects fixtures and tiling allowance",
  "bathroom.layout_changing": "layout changes add plumbing and labour",
  "bathroom.tile_extent": "full-height tiling increases materials and labour",
  "bathroom.fixtures_client_supplied": "client-supplied fixtures reduce material allowance",
  "bathroom.tiles_supplied_by": "who supplies tiles changes material allowance",
  "bathroom.waterproofing_included": "waterproofing is a major trade allowance",
  "bathroom.plumbing_relocation": "relocating services adds plumber allowance",
  "bathroom.electrical_allowance": "electrical work adds trade allowance",
  "bathroom.demolition_included": "demolition adds labour and disposal",
};

function defaultReason(
  fact: ScopeFactDefinition,
  scopeName: string
): string {
  if (fact.required) {
    return `needed to price ${scopeName.toLowerCase()}`;
  }
  return `affects cost and confidence for ${scopeName.toLowerCase()}`;
}

function reasonForFact(
  fact: ScopeFactDefinition,
  scopeName: string
): string {
  return FACT_IMPACT_REASONS[fact.key] ?? defaultReason(fact, scopeName);
}

function impactForFact(fact: ScopeFactDefinition): RefinementImpact {
  if (fact.required && fact.affectsEstimate) return "high";
  if (fact.affectsEstimate) return "medium";
  return "low";
}

function contextualQuestion(scopeName: string, fact: ScopeFactDefinition): string {
  const text = fact.questionText || fact.label;
  const lower = text.toLowerCase();
  if (lower.startsWith("for ") || lower.includes(scopeName.toLowerCase())) {
    return text.endsWith("?") ? text : `${text}?`;
  }
  if (text.endsWith("?")) {
    return `For ${scopeName}, ${text.charAt(0).toLowerCase()}${text.slice(1)}`;
  }
  return `For ${scopeName}, ${text}?`;
}

function factToSuggestion(
  fact: ScopeFactDefinition,
  area: EvaluateWorkAreaInput,
  required: boolean
): ScopeRefinementSuggestion {
  const scopeName = area.scopeName;
  return scopeRefinementSuggestionSchema.parse({
    factKey: fact.key,
    label: `${scopeName} ${fact.label.charAt(0).toLowerCase()}${fact.label.slice(1)}`,
    question: contextualQuestion(scopeName, fact),
    reason: reasonForFact(fact, scopeName),
    impact: impactForFact(fact),
    answerOptions: fact.options?.map((o) => ({
      value: o.value,
      label: o.label,
    })),
    affectsEstimate: fact.affectsEstimate,
    scopeId: area.scopeId,
    scopeName,
    required,
  });
}

function suggestionsFromWorkArea(
  area: EvaluateWorkAreaInput
): ScopeRefinementSuggestion[] {
  const requiredFacts = getMissingRequiredFacts(
    area.workAreaTypeKey,
    area.answers
  );
  const optionalFacts = getMissingOptionalHighImpact(
    area.workAreaTypeKey,
    area.answers
  );

  return [
    ...requiredFacts.map((f) => factToSuggestion(f, area, true)),
    ...optionalFacts.map((f) => factToSuggestion(f, area, false)),
  ];
}

function matchesScopeFilter(
  area: EvaluateWorkAreaInput,
  scopeId?: string,
  scopeName?: string
): boolean {
  if (scopeId && area.scopeId === scopeId) return true;
  if (!scopeName) return !scopeId;

  const target = scopeName.toLowerCase();
  return (
    area.scopeName.toLowerCase() === target ||
    area.scopeName.toLowerCase().includes(target) ||
    target.includes(area.scopeName.toLowerCase()) ||
    area.workAreaTypeKey.toLowerCase().includes(target)
  );
}

function buildRateSuggestion(hasUserRates?: boolean): ScopeRefinementSuggestion | null {
  if (hasUserRates) return null;
  return scopeRefinementSuggestionSchema.parse({
    factKey: "contractor_rates",
    label: "Your rates",
    question: "Do you want to add your deck, bathroom or retaining wall rates?",
    reason: "using your saved rates tightens the range versus benchmarks",
    impact: "medium",
    affectsEstimate: true,
  });
}

/**
 * Single source of truth for scope-specific refinement suggestions.
 */
export function getScopeRefinementSuggestions(
  input: ScopeRefinementInput
): ScopeRefinementSuggestion[] {
  const limit = input.limit ?? 5;

  let areas = input.workAreas.filter((a) => a.included !== false);

  if (input.scopeId || input.scopeName) {
    areas = areas.filter((a) =>
      matchesScopeFilter(a, input.scopeId, input.scopeName)
    );
  }

  const sortedAreas = [...areas].sort((a, b) => {
    const aMissing =
      getMissingRequiredFacts(a.workAreaTypeKey, a.answers).length +
      getMissingOptionalHighImpact(a.workAreaTypeKey, a.answers).length;
    const bMissing =
      getMissingRequiredFacts(b.workAreaTypeKey, b.answers).length +
      getMissingOptionalHighImpact(b.workAreaTypeKey, b.answers).length;
    return bMissing - aMissing;
  });

  const suggestions: ScopeRefinementSuggestion[] = [];

  for (const area of sortedAreas) {
    if (!getScopeByWorkAreaType(area.workAreaTypeKey)) continue;
    suggestions.push(...suggestionsFromWorkArea(area));
  }

  const traceFacts = input.estimateTrace?.missingCriticalFacts ?? [];
  for (const label of traceFacts) {
    if (suggestions.some((s) => s.label.toLowerCase() === label.toLowerCase())) {
      continue;
    }
    suggestions.push(
      scopeRefinementSuggestionSchema.parse({
        factKey: `trace_${label.toLowerCase().replace(/\s+/g, "_")}`,
        label,
        question: `Can you confirm ${label.toLowerCase()}?`,
        reason: "still flagged as missing in the current estimate",
        impact: "high",
        affectsEstimate: true,
      })
    );
  }

  const rateSuggestion = buildRateSuggestion(input.hasUserRates);
  if (rateSuggestion) {
    suggestions.push(rateSuggestion);
  }

  return suggestions
    .sort(
      (a, b) =>
        IMPACT_PRIORITY[b.impact] - IMPACT_PRIORITY[a.impact] ||
        (b.required ? 1 : 0) - (a.required ? 1 : 0)
    )
    .slice(0, limit);
}

export function formatScopeRefinementResponse(
  suggestions: ScopeRefinementSuggestion[],
  options?: { scopeName?: string; intro?: string }
): string {
  if (suggestions.length === 0) {
    return "The estimate is already solid. The next best improvement would be adding your own rates or confirming client-supplied materials.";
  }

  const intro =
    options?.intro ??
    (options?.scopeName
      ? `To improve ${options.scopeName} confidence, the most useful details would be:`
      : "To sharpen this estimate, the most useful details would be:");

  const lines = [intro, ""];

  suggestions.forEach((item, index) => {
    lines.push(`${index + 1}. ${item.label} — ${item.reason}.`);
  });

  return lines.join("\n");
}

export const REFINEMENT_ACTION_CHIPS = [
  { id: "answer_now", label: "Answer now" },
  { id: "skip", label: "Skip for now" },
  { id: "add_rates", label: "Add your rates" },
] as const;

export type MissingInformationItem = {
  scopeId?: string;
  scopeName: string;
  factKey: string;
  label: string;
  questionId?: string;
};

export function buildScopedMissingInformation(
  workAreas: EvaluateWorkAreaInput[]
): MissingInformationItem[] {
  return getCriticalOrUsefulMissing(getCurrentMissingItems({ workAreas })).map(
    (item) => ({
      scopeId: item.scopeId,
      scopeName: item.scopeLabel,
      factKey: item.factKey,
      label: item.label,
    })
  );
}
