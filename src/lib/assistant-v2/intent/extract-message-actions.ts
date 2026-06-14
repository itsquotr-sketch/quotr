import { parseFinishLevelSynonym } from "@/lib/assistant-v2/facts/get-known-facts-for-scope";
import type { ScopeForFactResolution } from "@/lib/assistant-v2/facts/resolve-fact-update";
import { resolveFactUpdate } from "@/lib/assistant-v2/facts/resolve-fact-update";
import {
  measurementsToFactUpdates,
  resolveMeasurements,
  resolveScopePrefix,
} from "@/lib/assistant-v2/facts/measurement-resolver";
import {
  ACCESS_TIGHT_PATTERN,
  classifyMeasurementContext,
  hasAreaUnit,
  parseLengthWidthDimensions,
  WALKING_DISTANCE_PATTERN,
} from "@/lib/assistant-v2/facts/parse-numeric-command";
import type { MessageAction } from "@/lib/assistant-v2/intent/types";
import { getAllFactsForScope, getScopeByWorkAreaType } from "@/lib/scopes";
import { z } from "zod";

export const extractMessageActionsResultSchema = z.object({
  actions: z.array(
    z.object({
      intent: z.enum([
        "update_existing_fact",
        "update_constraint",
        "update_finish_level",
      ]),
      scopeTypeKey: z.string().optional(),
      scopeId: z.string().uuid().optional(),
      factKey: z.string().optional(),
      factLabel: z.string().optional(),
      value: z.string(),
      unit: z.string().optional(),
      confidence: z.number(),
      requiresConfirmation: z.boolean(),
      reason: z.string(),
      constraintSlug: z.string().optional(),
      constraintLabel: z.string().optional(),
    })
  ),
  unknowns: z.array(z.string()),
});

export type ExtractMessageActionsResult = z.infer<
  typeof extractMessageActionsResultSchema
>;

const CONFIDENCE_AI_THRESHOLD = 0.8;

function scopePrefix(workAreaTypeKey: string): string | null {
  return resolveScopePrefix(workAreaTypeKey);
}

function scopeMentionedInText(
  scope: ScopeForFactResolution,
  text: string
): boolean {
  const lower = text.toLowerCase();
  const prefix = scopePrefix(scope.workAreaTypeKey);
  const aliases = [
    scope.scopeName,
    scope.workAreaTypeKey,
    prefix ?? "",
    ...(prefix === "retaining_wall" ? ["retaining wall", "retaining", "wall"] : []),
    ...(prefix === "deck" ? ["deck", "decking"] : []),
    ...(prefix === "bathroom" ? ["bathroom"] : []),
    ...(prefix === "fence" ? ["fence", "fencing"] : []),
  ].filter(Boolean);
  return aliases.some((alias) => lower.includes(alias.toLowerCase()));
}

function extractScopeDimensionActions(
  segment: string,
  scopes: ScopeForFactResolution[]
): MessageAction[] {
  const actions: MessageAction[] = [];
  const measurements = resolveMeasurements(segment);
  const hasMeasurable =
    measurements.length_m != null ||
    measurements.width_m != null ||
    measurements.area_m2 != null ||
    measurements.height_m != null;

  if (!hasMeasurable) return actions;

  for (const scope of scopes) {
    if (!scopeMentionedInText(scope, segment) && scopes.length > 1) continue;

    const prefix = scopePrefix(scope.workAreaTypeKey);
    if (!prefix) continue;

    const updates = measurementsToFactUpdates(prefix, measurements);
    for (const update of updates) {
      const factKey = `${prefix}.${update.factKeySuffix}`;
      actions.push({
        intent: "update_existing_fact",
        scopeTypeKey: scope.workAreaTypeKey,
        scopeId: scope.scopeId,
        factKey,
        factLabel: resolveFactLabel(scope, factKey),
        value: update.value,
        unit: update.unit,
        confidence: 0.92,
        requiresConfirmation: false,
        reason: update.reason,
      });
    }
  }

  return actions;
}

function findScope(
  scopes: ScopeForFactResolution[],
  typeKey?: string,
  hint?: RegExp
): ScopeForFactResolution | null {
  if (typeKey) {
    const match = scopes.find((s) => s.workAreaTypeKey === typeKey);
    if (match) return match;
  }
  if (hint) {
    const match = scopes.find(
      (s) =>
        hint.test(s.scopeName) ||
        hint.test(s.workAreaTypeKey) ||
        (scopePrefix(s.workAreaTypeKey) &&
          hint.test(scopePrefix(s.workAreaTypeKey)!))
    );
    if (match) return match;
  }
  return scopes.length === 1 ? scopes[0]! : null;
}

function resolveFactLabel(
  scope: ScopeForFactResolution,
  factKey: string
): string {
  const scopeDef = getScopeByWorkAreaType(scope.workAreaTypeKey);
  const fact = scopeDef
    ? getAllFactsForScope(scopeDef).find((f) => f.key === factKey)
    : null;
  return fact?.label ?? factKey.split(".").pop() ?? factKey;
}

function actionKey(action: MessageAction): string {
  return `${action.intent}:${action.scopeId ?? ""}:${action.factKey ?? action.constraintSlug ?? ""}:${action.value}`;
}

function mergeActions(actions: MessageAction[]): MessageAction[] {
  const map = new Map<string, MessageAction>();
  for (const action of actions) {
    const key = actionKey(action);
    const existing = map.get(key);
    if (!existing || action.confidence > existing.confidence) {
      map.set(key, action);
    }
  }
  return [...map.values()];
}

function splitMessageSegments(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const commaParts = trimmed
    .split(/,\s*(?=(?:no |yes |client |access |deck |the |labour |exclude |supply |include |around |approximately )|\d)/i)
    .map((s) => s.trim())
    .filter(Boolean);

  if (commaParts.length > 1) return commaParts;
  return [trimmed];
}

function extractDeckDimensionActions(
  segment: string,
  scopes: ScopeForFactResolution[]
): MessageAction[] {
  const actions: MessageAction[] = [];
  const deck = findScope(scopes, "Deck", /deck/i);
  if (!deck) return actions;

  const dims = parseLengthWidthDimensions(segment);
  if (dims.length === 0) return actions;

  const dim = dims[0]!;
  const prefix = scopePrefix(deck.workAreaTypeKey);
  if (!prefix) return actions;

  const areaKey = `${prefix}.area_m2`;
  actions.push({
    intent: "update_existing_fact",
    scopeTypeKey: deck.workAreaTypeKey,
    scopeId: deck.scopeId,
    factKey: areaKey,
    factLabel: resolveFactLabel(deck, areaKey),
    value: String(dim.area_m2),
    unit: "m²",
    confidence: 0.92,
    requiresConfirmation: false,
    reason: `Calculated area ${dim.length_m}m × ${dim.width_m}m = ${dim.area_m2}m²`,
  });

  const lengthKey = `${prefix}.length_m`;
  const widthKey = `${prefix}.width_m`;
  const scopeDef = getScopeByWorkAreaType(deck.workAreaTypeKey);
  if (scopeDef?.optionalFacts.some((f) => f.key === lengthKey)) {
    actions.push({
      intent: "update_existing_fact",
      scopeTypeKey: deck.workAreaTypeKey,
      scopeId: deck.scopeId,
      factKey: lengthKey,
      factLabel: resolveFactLabel(deck, lengthKey),
      value: String(dim.length_m),
      unit: "m",
      confidence: 0.9,
      requiresConfirmation: false,
      reason: "Length from dimension phrase",
    });
  }
  if (scopeDef?.optionalFacts.some((f) => f.key === widthKey)) {
    actions.push({
      intent: "update_existing_fact",
      scopeTypeKey: deck.workAreaTypeKey,
      scopeId: deck.scopeId,
      factKey: widthKey,
      factLabel: resolveFactLabel(deck, widthKey),
      value: String(dim.width_m),
      unit: "m",
      confidence: 0.9,
      requiresConfirmation: false,
      reason: "Width from dimension phrase",
    });
  }

  return actions;
}

function extractHeightActions(
  segment: string,
  scopes: ScopeForFactResolution[]
): MessageAction[] {
  const context = classifyMeasurementContext(segment);
  const measurements = resolveMeasurements(segment);
  const heightValue = measurements.height_m ?? context.value;
  const actions: MessageAction[] = [];

  if (heightValue == null && context.kind !== "height") return actions;
  if (hasAreaUnit(segment) && !/elevated|off\s+the\s+ground|above\s+ground/i.test(segment)) {
    return actions;
  }

  const deck = findScope(scopes, "Deck", /deck/i);
  if (!deck) return actions;

  const elevatedPhrase = /\b(?:elevated|off\s+the\s+ground|above\s+ground|raised)\b/i.test(
    segment
  );

  if (elevatedPhrase && heightValue == null) {
    actions.push({
      intent: "update_existing_fact",
      scopeTypeKey: deck.workAreaTypeKey,
      scopeId: deck.scopeId,
      factKey: "deck.level_type",
      factLabel: resolveFactLabel(deck, "deck.level_type"),
      value: "elevated",
      confidence: 0.9,
      requiresConfirmation: false,
      reason: "Elevated deck mentioned",
    });
  }

  if (heightValue == null) return actions;

  const unusual = heightValue > 10;
  if (context.kind === "height" || elevatedPhrase || unusual) {
    actions.push({
      intent: "update_existing_fact",
      scopeTypeKey: deck.workAreaTypeKey,
      scopeId: deck.scopeId,
      factKey: "deck.height_m",
      factLabel: resolveFactLabel(deck, "deck.height_m"),
      value: String(heightValue),
      unit: "m",
      confidence: unusual ? 0.7 : 0.9,
      requiresConfirmation: unusual,
      reason: unusual
        ? "Unusually high deck height — needs confirmation"
        : "Height context detected (off the ground / elevated)",
    });

    actions.push({
      intent: "update_existing_fact",
      scopeTypeKey: deck.workAreaTypeKey,
      scopeId: deck.scopeId,
      factKey: "deck.level_type",
      factLabel: resolveFactLabel(deck, "deck.level_type"),
      value: "elevated",
      confidence: 0.88,
      requiresConfirmation: false,
      reason: "Elevated deck inferred from height context",
    });
  }

  return actions;
}

function extractAccessActions(
  segment: string,
  scopes: ScopeForFactResolution[]
): MessageAction[] {
  const actions: MessageAction[] = [];
  const lower = segment.toLowerCase();

  if (ACCESS_TIGHT_PATTERN.test(lower)) {
    if (/\btight\s+access\s+applies\b/i.test(lower)) {
      return actions;
    }
    const deck = findScope(scopes, "Deck", /deck|access/i);
    if (deck) {
      actions.push({
        intent: "update_existing_fact",
        scopeTypeKey: deck.workAreaTypeKey,
        scopeId: deck.scopeId,
        factKey: "deck.tight_access",
        factLabel: "Site access",
        value: "yes",
        confidence: 0.9,
        requiresConfirmation: false,
        reason: "Tight access mentioned",
      });
    }
    actions.push({
      intent: "update_constraint",
      value: "true",
      constraintSlug: "tight-access",
      constraintLabel: "Tight access",
      confidence: 0.88,
      requiresConfirmation: false,
      reason: "Site constraint: tight access",
    });
  }

  if (WALKING_DISTANCE_PATTERN.test(lower)) {
    const distanceMatch = lower.match(
      /(?:around|about|approximately|~)?\s*(\d+(?:\.\d+)?)\s*(?:m|met(?:re|er)s?)\b/
    );
    if (distanceMatch?.[1]) {
      const wall = findScope(scopes, "Retaining Wall", /wall|retaining/i);
      if (wall) {
        actions.push({
          intent: "update_existing_fact",
          scopeTypeKey: wall.workAreaTypeKey,
          scopeId: wall.scopeId,
          factKey: "retaining_wall.carting_distance_m",
          factLabel: resolveFactLabel(wall, "retaining_wall.carting_distance_m"),
          value: distanceMatch[1],
          unit: "m",
          confidence: 0.85,
          requiresConfirmation: false,
          reason: "Walking/carting distance",
        });
      }
      actions.push({
        intent: "update_constraint",
        value: distanceMatch[1],
        constraintSlug: "carting-distance",
        constraintLabel: "Long carting distance",
        confidence: 0.85,
        requiresConfirmation: false,
        reason: "Carting distance from walking distance phrase",
      });
    }
  }

  return actions;
}

function extractFinishLevelAction(segment: string): MessageAction | null {
  const level = parseFinishLevelSynonym(segment);
  if (!level) return null;

  return {
    intent: "update_finish_level",
    value: level,
    confidence: 0.88,
    requiresConfirmation: /\bstandard\s+timber\b/i.test(segment),
    reason: "Finish level synonym detected",
  };
}

function resolutionToAction(
  resolution: ReturnType<typeof resolveFactUpdate>
): MessageAction[] {
  if (!resolution.matched || !resolution.scopeId || !resolution.factKey) {
    return [];
  }

  const actions: MessageAction[] = [];

  if (resolution.newValue) {
    actions.push({
      intent: "update_existing_fact",
      scopeTypeKey: resolution.scopeTypeKey,
      scopeId: resolution.scopeId,
      factKey: resolution.factKey,
      factLabel: resolution.factLabel ?? resolution.factKey,
      value: resolution.newValue,
      unit: resolution.unit,
      confidence: resolution.confidence,
      requiresConfirmation: resolution.requiresConfirmation,
      reason: "Fact update from natural language",
    });
  }

  for (const extra of resolution.additionalFacts ?? []) {
    actions.push({
      intent: "update_existing_fact",
      scopeTypeKey: resolution.scopeTypeKey,
      scopeId: resolution.scopeId,
      factKey: extra.factKey,
      factLabel: extra.factLabel,
      value: extra.newValue,
      unit: extra.unit,
      confidence: resolution.confidence,
      requiresConfirmation: false,
      reason: "Additional fact from dimension or compound update",
    });
  }

  return actions;
}

/**
 * Deterministic multi-intent extraction from contractor messages.
 * AI fallback is invoked separately when confidence is low.
 */
export function extractMessageActionsDeterministic(
  scopes: ScopeForFactResolution[],
  userMessage: string
): ExtractMessageActionsResult {
  const unknowns: string[] = [];
  const actions: MessageAction[] = [];
  const text = userMessage.trim();

  if (!text || scopes.length === 0) {
    return { actions: [], unknowns: ["No scopes available"] };
  }

  const finishAction = extractFinishLevelAction(text);
  if (finishAction) actions.push(finishAction);

  actions.push(...extractHeightActions(text, scopes));

  actions.push(...extractAccessActions(text, scopes));

  const segments = splitMessageSegments(text);
  for (const segment of segments) {
    actions.push(...extractScopeDimensionActions(segment, scopes));
    actions.push(...extractDeckDimensionActions(segment, scopes));
    actions.push(...extractHeightActions(segment, scopes));
    actions.push(...extractAccessActions(segment, scopes));

    const resolution = resolveFactUpdate(scopes, segment);
    actions.push(...resolutionToAction(resolution));
  }

  const fullResolution = resolveFactUpdate(scopes, text);
  actions.push(...resolutionToAction(fullResolution));

  const merged = mergeActions(actions);

  const needsConfirmation = merged.filter((a) => a.requiresConfirmation);
  if (needsConfirmation.length === 1 && merged.length === 1) {
    const action = needsConfirmation[0]!;
    if (action.factKey?.includes("height") && action.confidence < CONFIDENCE_AI_THRESHOLD) {
      unknowns.push(
        `Just checking — did you mean the deck is ${action.value}m above ground, or ${action.value}m² in area?`
      );
    }
  }

  return { actions: merged, unknowns };
}

export function extractMessageActions(
  scopes: ScopeForFactResolution[],
  userMessage: string
): ExtractMessageActionsResult {
  return extractMessageActionsDeterministic(scopes, userMessage);
}

export function partitionActionsByConfidence(
  result: ExtractMessageActionsResult,
  threshold = CONFIDENCE_AI_THRESHOLD
): {
  apply: MessageAction[];
  confirm: MessageAction[];
} {
  const apply: MessageAction[] = [];
  const confirm: MessageAction[] = [];

  for (const action of result.actions) {
    if (action.requiresConfirmation || action.confidence < threshold) {
      confirm.push(action);
    } else {
      apply.push(action);
    }
  }

  return { apply, confirm };
}

export function summarizeAppliedActions(actions: MessageAction[]): string {
  if (actions.length === 0) return "No estimate change needed.";
  if (actions.length === 1) {
    const a = actions[0]!;
    if (a.intent === "update_finish_level") {
      return `Finish level updated to ${a.value}. Estimate updated.`;
    }
    return `Updated ${a.factLabel?.toLowerCase() ?? "detail"} to ${a.value}. Estimate updated.`;
  }

  const labels = actions.map((a) => {
    if (a.intent === "update_constraint") return a.constraintLabel?.toLowerCase();
    if (a.intent === "update_finish_level") return "finish level";
    return a.factLabel?.toLowerCase() ?? a.factKey?.split(".").pop();
  });

  const unique = [...new Set(labels.filter(Boolean))];
  const last = unique.pop();
  const summary =
    unique.length > 0 ? `${unique.join(", ")} and ${last}` : last;

  return `Updated ${actions.length} details: ${summary}. Estimate updated.`;
}
