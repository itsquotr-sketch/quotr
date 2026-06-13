import type { EvaluateWorkAreaInput } from "@/lib/assistant-v2/completeness/evaluate-project-completeness";
import type { EstimateTrace } from "@/lib/cost-engine/estimate-trace";
import { getScopeByWorkAreaType } from "@/lib/scopes";
import {
  factIsAnsweredFromMap,
  getMissingOptionalHighImpact,
  getMissingRequiredFacts,
} from "@/lib/scopes/missing-facts";
import type { ScopeFactDefinition } from "@/lib/scopes/types";
import { z } from "zod";

export const missingItemStatusSchema = z.enum([
  "missing",
  "answered",
  "skipped",
  "not_applicable",
]);

export const missingItemImportanceSchema = z.enum([
  "critical",
  "useful",
  "optional",
]);

export const currentMissingItemSchema = z.object({
  scopeId: z.string().optional(),
  scopeLabel: z.string(),
  factKey: z.string(),
  label: z.string(),
  status: missingItemStatusSchema,
  importance: missingItemImportanceSchema,
  affectsEstimate: z.boolean(),
});

export type MissingItemStatus = z.infer<typeof missingItemStatusSchema>;
export type MissingItemImportance = z.infer<typeof missingItemImportanceSchema>;
export type CurrentMissingItem = z.infer<typeof currentMissingItemSchema>;

export type GetCurrentMissingItemsInput = {
  workAreas: EvaluateWorkAreaInput[];
  /** Keys the user explicitly skipped in refinement (optional). */
  skippedFactKeys?: Set<string>;
  estimateTrace?: EstimateTrace | null;
};

function formatMissingLabel(scopeName: string, factLabel: string): string {
  const labelLower = factLabel.charAt(0).toLowerCase() + factLabel.slice(1);
  return `${scopeName}: ${labelLower} not confirmed`;
}

function factToMissingItem(
  fact: ScopeFactDefinition,
  area: EvaluateWorkAreaInput,
  importance: MissingItemImportance,
  status: MissingItemStatus
): CurrentMissingItem {
  return currentMissingItemSchema.parse({
    scopeId: area.scopeId,
    scopeLabel: area.scopeName,
    factKey: fact.key,
    label: formatMissingLabel(area.scopeName, fact.label),
    status,
    importance,
    affectsEstimate: fact.affectsEstimate,
  });
}

function getMissingOptionalLowImpact(
  workAreaTypeKey: string,
  answers: Record<string, string>
): ScopeFactDefinition[] {
  const scope = getScopeByWorkAreaType(workAreaTypeKey);
  if (!scope) return [];

  const highImpact = new Set(scope.confidenceRules.highImpactOptionalKeys);
  return scope.optionalFacts.filter(
    (fact) =>
      !highImpact.has(fact.key) &&
      (fact.affectsEstimate || fact.affectsConfidence) &&
      !factIsAnsweredFromMap(fact, answers)
  );
}

/**
 * Single source of truth for missing scope facts across Assistant V2 UI.
 */
export function getCurrentMissingItems(
  input: GetCurrentMissingItemsInput
): CurrentMissingItem[] {
  const skipped = input.skippedFactKeys ?? new Set<string>();
  const items: CurrentMissingItem[] = [];

  for (const area of input.workAreas) {
    if (area.included === false) continue;

    const scope = getScopeByWorkAreaType(area.workAreaTypeKey);
    if (!scope) continue;

    const allTrackableFacts = [
      ...scope.requiredFacts,
      ...scope.optionalFacts.filter(
        (f) => f.affectsEstimate || f.affectsConfidence
      ),
    ];

    for (const fact of allTrackableFacts) {
      const answered = factIsAnsweredFromMap(fact, area.answers);
      const isSkipped = skipped.has(fact.key);

      if (answered) {
        continue;
      }

      if (isSkipped) {
        items.push(
          factToMissingItem(fact, area, classifyImportance(fact, area), "skipped")
        );
        continue;
      }

      const importance = classifyImportance(fact, area);
      items.push(factToMissingItem(fact, area, importance, "missing"));
    }
  }

  const traceFacts = input.estimateTrace?.missingCriticalFacts ?? [];
  for (const traceLabel of traceFacts) {
    const alreadyTracked = items.some(
      (item) =>
        item.label.toLowerCase().includes(traceLabel.toLowerCase()) &&
        item.status === "missing"
    );
    if (alreadyTracked) continue;

    items.push(
      currentMissingItemSchema.parse({
        scopeLabel: "Estimate",
        factKey: `trace_${traceLabel.toLowerCase().replace(/\s+/g, "_")}`,
        label: `${traceLabel} not confirmed`,
        status: "missing",
        importance: "critical",
        affectsEstimate: true,
      })
    );
  }

  return items;
}

function classifyImportance(
  fact: ScopeFactDefinition,
  area: EvaluateWorkAreaInput
): MissingItemImportance {
  if (fact.required) return "critical";

  const scope = getScopeByWorkAreaType(area.workAreaTypeKey);
  if (!scope) return "optional";

  const highImpact = new Set(scope.confidenceRules.highImpactOptionalKeys);
  if (highImpact.has(fact.key)) return "useful";
  return "optional";
}

export function getMissingItemsForDisplay(
  items: CurrentMissingItem[]
): CurrentMissingItem[] {
  return items.filter((item) => item.status === "missing");
}

export function getCriticalOrUsefulMissing(
  items: CurrentMissingItem[]
): CurrentMissingItem[] {
  return getMissingItemsForDisplay(items).filter(
    (item) => item.importance === "critical" || item.importance === "useful"
  );
}

export function getOptionalMissing(
  items: CurrentMissingItem[]
): CurrentMissingItem[] {
  return getMissingItemsForDisplay(items).filter(
    (item) => item.importance === "optional"
  );
}

export function missingItemsToLabels(items: CurrentMissingItem[]): string[] {
  return [...new Set(getMissingItemsForDisplay(items).map((item) => item.label))];
}

export function missingItemsToSuggestionsInput(
  items: CurrentMissingItem[],
  limit = 5
): { factKey: string; scopeId?: string; scopeName: string; importance: MissingItemImportance }[] {
  return getMissingItemsForDisplay(items)
    .sort((a, b) => importancePriority(a.importance) - importancePriority(b.importance))
    .slice(0, limit)
    .map((item) => ({
      factKey: item.factKey,
      scopeId: item.scopeId,
      scopeName: item.scopeLabel,
      importance: item.importance,
    }));
}

function importancePriority(importance: MissingItemImportance): number {
  switch (importance) {
    case "critical":
      return 0;
    case "useful":
      return 1;
    case "optional":
      return 2;
  }
}

/** Re-export helpers used by refinement suggestions for backwards compatibility. */
export function buildMissingFromWorkAreas(
  workAreas: EvaluateWorkAreaInput[]
): CurrentMissingItem[] {
  return getCurrentMissingItems({ workAreas });
}

/** Facts still missing for a single work area (for work area cards). */
export function getScopeMissingItems(
  workAreaTypeKey: string,
  scopeId: string,
  scopeName: string,
  answers: Record<string, string>,
  included = true
): CurrentMissingItem[] {
  return getCurrentMissingItems({
    workAreas: [
      {
        scopeId,
        scopeName,
        workAreaTypeKey,
        answers,
        included,
      },
    ],
  });
}

/** Legacy-compatible label builder using shared missing state. */
export function buildScopedMissingLabelsFromItems(
  items: CurrentMissingItem[]
): string[] {
  return missingItemsToLabels(items);
}

/** Derive refinement-eligible facts from work area (used by get-scope-refinement-suggestions). */
export function getRefinementEligibleFacts(
  area: EvaluateWorkAreaInput
): ScopeFactDefinition[] {
  return [
    ...getMissingRequiredFacts(area.workAreaTypeKey, area.answers),
    ...getMissingOptionalHighImpact(area.workAreaTypeKey, area.answers),
    ...getMissingOptionalLowImpact(area.workAreaTypeKey, area.answers),
  ];
}
