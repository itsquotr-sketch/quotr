import type { QualityLevel } from "@/lib/constants/quality-level";
import type { QuickEstimateWorkAreaInput } from "@/lib/cost-engine/quick-estimate-input";
import type { EstimateTrace } from "@/lib/cost-engine/estimate-trace";
import { getScopeByWorkAreaType } from "@/lib/scopes";
import { z } from "zod";

export const sharpeningImpactSchema = z.enum(["high", "medium", "low"]);

export type SharpeningImpact = z.infer<typeof sharpeningImpactSchema>;

export const sharpeningSuggestionSchema = z.object({
  key: z.string(),
  label: z.string(),
  reason: z.string(),
  impact: sharpeningImpactSchema,
  questionText: z.string(),
  answerOptions: z
    .array(z.object({ value: z.string(), label: z.string() }))
    .optional(),
  relatedScopeId: z.string().uuid().optional(),
});

export type SharpeningSuggestion = z.infer<typeof sharpeningSuggestionSchema>;

export type SharpeningInput = {
  workAreas: QuickEstimateWorkAreaInput[];
  effectiveQualityLevel: QualityLevel;
  estimateTrace?: EstimateTrace | null;
  missingCriticalFacts?: string[];
  confidenceScore?: number;
  constraintsUnknown?: string[];
  hasUserRates?: boolean;
  clientBudgetKnown?: boolean;
};

function impactFromFact(required: boolean, affectsEstimate: boolean): SharpeningImpact {
  if (required && affectsEstimate) return "high";
  if (affectsEstimate) return "medium";
  return "low";
}

function buildScopeSuggestions(
  workAreas: QuickEstimateWorkAreaInput[],
  limit: number
): SharpeningSuggestion[] {
  const suggestions: SharpeningSuggestion[] = [];

  for (const area of workAreas) {
    const scope = getScopeByWorkAreaType(area.workAreaTypeKey);
    if (!scope) continue;

    const allFacts = [...scope.requiredFacts, ...scope.optionalFacts];

    for (const fact of allFacts) {
      if (!fact.affectsEstimate && !fact.affectsConfidence) continue;

      const answer = area.answers[fact.key];
      const answered =
        answer != null &&
        answer !== "" &&
        answer !== "unknown" &&
        answer !== "unsure";

      if (answered) continue;

      const impact = impactFromFact(fact.required, fact.affectsEstimate);

      suggestions.push({
        key: fact.key,
        label: fact.label,
        reason: fact.required
          ? `Missing ${fact.label.toLowerCase()} — needed to price ${area.name}.`
          : `${fact.label} affects cost and range for ${area.name}.`,
        impact,
        questionText: fact.questionText,
        answerOptions: fact.options?.map((o) => ({
          value: o.value,
          label: o.label,
        })),
        relatedScopeId: area.scopeId,
      });
    }
  }

  const impactOrder: Record<SharpeningImpact, number> = {
    high: 3,
    medium: 2,
    low: 1,
  };

  return suggestions
    .sort((a, b) => impactOrder[b.impact] - impactOrder[a.impact])
    .slice(0, limit);
}

function buildConstraintSuggestions(
  constraintsUnknown: string[],
  limit: number
): SharpeningSuggestion[] {
  return constraintsUnknown.slice(0, limit).map((label, index) => ({
    key: `constraint_${index}`,
    label,
    reason: "Site conditions change labour, access and contingency.",
    impact: "medium" as const,
    questionText: `Does "${label}" apply to this job?`,
    answerOptions: [
      { value: "yes", label: "Yes" },
      { value: "no", label: "No" },
      { value: "unsure", label: "Not sure yet" },
    ],
  }));
}

function buildRateSuggestion(hasUserRates: boolean): SharpeningSuggestion | null {
  if (hasUserRates) return null;
  return {
    key: "contractor_rates",
    label: "Your rates",
    reason: "Using your saved rates tightens the range versus benchmarks.",
    impact: "medium",
    questionText: "Do you want to add your deck, bathroom or retaining wall rates?",
    answerOptions: [
      { value: "add_rates", label: "Add rates" },
      { value: "skip", label: "Use benchmarks for now" },
    ],
  };
}

function buildBudgetSuggestion(clientBudgetKnown: boolean): SharpeningSuggestion | null {
  if (clientBudgetKnown) return null;
  return {
    key: "client_budget",
    label: "Client budget",
    reason: "A budget range helps sanity-check scope and finish level.",
    impact: "low",
    questionText: "Do you have a client budget or target range?",
  };
}

/**
 * Returns prioritised suggestions to sharpen the current estimate.
 * Default limit: top 3 high-impact items.
 */
export function getSharpeningSuggestions(
  input: SharpeningInput,
  limit = 3
): SharpeningSuggestion[] {
  const suggestions: SharpeningSuggestion[] = [];

  // 1. Missing quantities / measurements and finish choices from scopes
  suggestions.push(...buildScopeSuggestions(input.workAreas, limit * 2));

  // 2. Missing site/access constraints from trace
  if (input.constraintsUnknown?.length) {
    suggestions.push(
      ...buildConstraintSuggestions(input.constraintsUnknown, 2)
    );
  }

  // 3. Missing critical facts from estimate trace (deduped)
  if (input.missingCriticalFacts?.length) {
    for (const fact of input.missingCriticalFacts) {
      if (suggestions.some((s) => s.label.toLowerCase() === fact.toLowerCase())) {
        continue;
      }
      suggestions.push({
        key: `trace_${fact.toLowerCase().replace(/\s+/g, "_")}`,
        label: fact,
        reason: "Still flagged as missing in the current estimate.",
        impact: "high",
        questionText: `Can you confirm ${fact.toLowerCase()}?`,
      });
    }
  }

  // 4. Contractor rates
  const rateSuggestion = buildRateSuggestion(input.hasUserRates ?? false);
  if (rateSuggestion) suggestions.push(rateSuggestion);

  // 5. Client budget
  const budgetSuggestion = buildBudgetSuggestion(
    input.clientBudgetKnown ?? false
  );
  if (budgetSuggestion) suggestions.push(budgetSuggestion);

  const impactOrder: Record<SharpeningImpact, number> = {
    high: 3,
    medium: 2,
    low: 1,
  };

  return suggestions
    .sort((a, b) => impactOrder[b.impact] - impactOrder[a.impact])
    .slice(0, limit);
}

export function formatSharpeningResponse(
  suggestions: SharpeningSuggestion[]
): string {
  if (suggestions.length === 0) {
    return "This estimate looks reasonably complete for a quick draft. Add more site detail or your own rates if you want to tighten the range further.";
  }

  const lines = [
    "To sharpen this estimate, the biggest missing items are:",
    "",
  ];

  suggestions.forEach((item, index) => {
    lines.push(`${index + 1}. ${item.label} — ${item.reason}`);
  });

  lines.push("", "Want to answer these now?");
  return lines.join("\n");
}
