import { getTrackableFactsForWorkAreaType } from "@/lib/assistant-v2/discovery/generic-scope-discovery";
import {
  resolveMeasurements,
} from "@/lib/assistant-v2/facts/measurement-resolver";
import { getAllFactsForScope, getScopeByWorkAreaType } from "@/lib/scopes";
import type { ScopeFactDefinition } from "@/lib/scopes/types";
import { normaliseQualityLevel } from "@/lib/constants/quality-level";
import { z } from "zod";

export const factUpdateResolutionSchema = z.object({
  matched: z.boolean(),
  confidence: z.number(),
  scopeId: z.string().uuid().optional(),
  scopeTypeKey: z.string().optional(),
  scopeName: z.string().optional(),
  factKey: z.string().optional(),
  factLabel: z.string().optional(),
  currentValue: z.string().optional(),
  newValue: z.string().optional(),
  unit: z.string().optional(),
  requiresConfirmation: z.boolean(),
  confirmationMessage: z.string().optional(),
  additionalFacts: z
    .array(
      z.object({
        factKey: z.string(),
        factLabel: z.string(),
        newValue: z.string(),
        previousValue: z.string().optional(),
        unit: z.string().optional(),
      })
    )
    .optional(),
});

export type FactUpdateResolution = z.infer<typeof factUpdateResolutionSchema>;

export type ScopeForFactResolution = {
  scopeId: string;
  scopeName: string;
  workAreaTypeKey: string;
  answers: Record<string, string>;
};

import { COMMAND_VERB_PATTERN } from "@/lib/assistant-v2/intent/contractor-synonyms";
import {
  parseBareScopeNumber,
  parseLengthWidthDimensions,
  parseNumericForFact,
  classifyMeasurementContext,
  hasAreaUnit,
  HEIGHT_CONTEXT_PATTERN,
  WALKING_DISTANCE_PATTERN,
} from "@/lib/assistant-v2/facts/parse-numeric-command";
import { parseFinishLevelSynonym } from "@/lib/assistant-v2/facts/get-known-facts-for-scope";

const IMPLICIT_CORRECTION_PATTERN =
  /\b(?:actually|correction|it's|it is|the .+ is|size is|area is|make it|change to|update to)\b/i;

const AREA_UNIT_PATTERN =
  /(\d+(?:\.\d+)?)\s*(?:m²|m2|sqm|square\s*met(?:re|er)s?)(?:\b|$)/i;

const LENGTH_UNIT_PATTERN =
  /(\d+(?:\.\d+)?)\s*(?:m|met(?:re|er)s?|lm)\b/i;

const FINISH_LEVEL_PATTERN =
  /\b(budget|standard|premium|basic|mid-?range|high-?end|luxury)\b/i;

const YES_NO_PATTERN =
  /\b(yes|no|true|false|required|not required|included|not included)\b/i;

type FactPhrase = {
  patterns: RegExp[];
  factKeySuffix: string;
  scopeHint?: RegExp;
  genericArea?: boolean;
};

const FACT_PHRASES: FactPhrase[] = [
  {
    patterns: [/deck\s*area/i, /area\s*of\s*(?:the\s+)?deck/i],
    factKeySuffix: "area_m2",
    scopeHint: /deck/i,
  },
  {
    patterns: [/floor\s*area/i, /bathroom\s*area/i],
    factKeySuffix: "floor_area_m2",
    scopeHint: /bathroom/i,
  },
  {
    patterns: [/wall\s*length|length\s*of\s*(?:the\s+)?(?:retaining\s*)?wall/i],
    factKeySuffix: "length_m",
    scopeHint: /retaining|wall/i,
  },
  {
    patterns: [
      /wall\s*height|height\s*of\s*(?:the\s+)?(?:retaining\s*)?wall|retaining\s*wall\s*height/i,
    ],
    factKeySuffix: "height_m",
    scopeHint: /retaining|wall/i,
  },
  {
    patterns: [/deck\s*height|height\s*of\s*(?:the\s+)?deck/i],
    factKeySuffix: "height_m",
    scopeHint: /deck/i,
  },
  {
    patterns: [/material/i, /timber|composite|block|concrete/i],
    factKeySuffix: "material",
    scopeHint: /retaining|wall/i,
  },
  {
    patterns: [
      /deck\s*material|material\s*of\s*(?:the\s+)?deck|timber|composite/i,
    ],
    factKeySuffix: "material_type",
    scopeHint: /deck/i,
  },
  {
    patterns: [/finish\s*level|finish/i],
    factKeySuffix: "finish_level",
  },
  {
    patterns: [/level\s*type|ground\s*level|elevated|raised/i],
    factKeySuffix: "level_type",
    scopeHint: /deck/i,
  },
  {
    patterns: [/drainage/i],
    factKeySuffix: "has_drainage",
    scopeHint: /retaining|wall/i,
  },
  {
    patterns: [/backfill/i],
    factKeySuffix: "has_backfill",
    scopeHint: /retaining|wall/i,
  },
  {
    patterns: [/spoil/i],
    factKeySuffix: "has_spoil_removal",
    scopeHint: /retaining|wall/i,
  },
  {
    patterns: [/machine\s*access/i],
    factKeySuffix: "machine_access",
    scopeHint: /retaining|wall/i,
  },
  {
    patterns: [/carting/i],
    factKeySuffix: "carting_distance_m",
    scopeHint: /retaining|wall/i,
  },
  {
    patterns: [/stairs|steps/i],
    factKeySuffix: "has_stairs",
    scopeHint: /deck/i,
  },
  {
    patterns: [/balustrade|railing/i],
    factKeySuffix: "has_balustrade",
    scopeHint: /deck/i,
  },
  {
    patterns: [/pergola/i],
    factKeySuffix: "has_pergola",
    scopeHint: /deck/i,
  },
  {
    patterns: [/demolition/i, /demo(?:lish)?/i],
    factKeySuffix: "demolition_required",
    scopeHint: /kitchen/i,
  },
  {
    patterns: [/demolition|demo(?:lish)?|existing\s*deck/i],
    factKeySuffix: "has_existing_deck",
    scopeHint: /deck/i,
  },
  {
    patterns: [/fence\s*length|length\s*of\s*(?:the\s+)?fence/i],
    factKeySuffix: "length_m",
    scopeHint: /fence|fencing/i,
  },
  {
    patterns: [/fence\s*height|height\s*of\s*(?:the\s+)?fence/i],
    factKeySuffix: "height_m",
    scopeHint: /fence|fencing/i,
  },
  {
    patterns: [/timber|metal|paling|composite/i],
    factKeySuffix: "material_type",
    scopeHint: /fence|fencing/i,
  },
  {
    patterns: [/layout/i],
    factKeySuffix: "layout_changing",
    scopeHint: /bathroom/i,
  },
  {
    patterns: [/tile/i],
    factKeySuffix: "tile_extent",
    scopeHint: /bathroom/i,
  },
  {
    patterns: [/waterproof/i],
    factKeySuffix: "waterproofing_included",
    scopeHint: /bathroom/i,
  },
  {
    patterns: [/plumbing/i],
    factKeySuffix: "plumbing_relocation",
    scopeHint: /bathroom/i,
  },
  {
    patterns: [/electrical/i],
    factKeySuffix: "electrical_allowance",
    scopeHint: /bathroom/i,
  },
  {
    patterns: [/fixtures/i, /vanity|toilet|basin/i],
    factKeySuffix: "fixtures_client_supplied",
    scopeHint: /bathroom/i,
  },
  {
    patterns: [
      /client\s+(?:is\s+)?suppl(?:y|ying|ied)\s+tiles/i,
      /tiles\s+(?:by|from|supplied by)\s+(?:the\s+)?client/i,
    ],
    factKeySuffix: "tiles_supplied_by",
    scopeHint: /bathroom/i,
  },
  {
    patterns: [
      /client\s+(?:is\s+)?suppl(?:y|ying|ied)/i,
      /owner\s+suppl(?:y|ying|ied)/i,
      /supplied by client/i,
      /(?:we are|we're)\s+labour\s+only/i,
      /labour\s+only/i,
      /exclude\s+materials/i,
      /supply\s+and\s+install/i,
      /include\s+materials/i,
      /client supplies/i,
      /client\s+has\s+their\s+own/i,
    ],
    factKeySuffix: "material_supply",
    scopeHint: /deck/i,
  },
  {
    patterns: [
      /exclude\s+balustrade\s+supply/i,
      /balustrade\s+(?:supplied by|from)\s+(?:the\s+)?client/i,
      /install\s+only.*balustrad/i,
    ],
    factKeySuffix: "balustrade_supply",
    scopeHint: /deck/i,
  },
  {
    patterns: [/\barea\b/i],
    factKeySuffix: "area_m2",
    genericArea: true,
  },
];

const IMPLICIT_AREA_BY_SCOPE: Record<string, string> = {
  deck: "area_m2",
  retaining_wall: "length_m",
  bathroom: "floor_area_m2",
  fence: "length_m",
};

function scopePrefix(workAreaTypeKey: string): string | null {
  const map: Record<string, string> = {
    Deck: "deck",
    "Retaining Wall": "retaining_wall",
    "Bathroom renovation": "bathroom",
    Fence: "fence",
    Painting: "painting",
    "Kitchen renovation": "kitchen",
    Flooring: "flooring",
  };
  return map[workAreaTypeKey] ?? null;
}

function findScopeByHint(
  scopes: ScopeForFactResolution[],
  hint: RegExp | undefined,
  text: string
): ScopeForFactResolution[] {
  if (hint?.test(text)) {
    return scopes.filter(
      (s) =>
        hint.test(s.scopeName) ||
        hint.test(s.workAreaTypeKey) ||
        (scopePrefix(s.workAreaTypeKey) &&
          hint.test(scopePrefix(s.workAreaTypeKey)!))
    );
  }

  for (const scope of scopes) {
    const prefix = scopePrefix(scope.workAreaTypeKey);
    const aliases = [
      scope.scopeName,
      scope.workAreaTypeKey,
      prefix ?? "",
      ...(prefix === "retaining_wall" ? ["retaining wall", "retaining"] : []),
      ...(prefix === "deck" ? ["deck", "decking"] : []),
      ...(prefix === "bathroom" ? ["bathroom"] : []),
    ].filter(Boolean);

    if (
      aliases.some((alias) =>
        text.toLowerCase().includes(alias.toLowerCase())
      )
    ) {
      return [scope];
    }
  }

  return scopes;
}

function resolveFactForScope(
  scope: ScopeForFactResolution,
  factKeySuffix: string
): ScopeFactDefinition | null {
  const scopeDef = getScopeByWorkAreaType(scope.workAreaTypeKey);
  const prefix = scopePrefix(scope.workAreaTypeKey);
  const fullKey = prefix ? `${prefix}.${factKeySuffix}` : factKeySuffix;

  if (scopeDef) {
    return (
      getAllFactsForScope(scopeDef).find((f) => f.key === fullKey) ??
      getAllFactsForScope(scopeDef).find((f) =>
        f.key.endsWith(`.${factKeySuffix}`)
      ) ??
      null
    );
  }

  const trackable = getTrackableFactsForWorkAreaType(scope.workAreaTypeKey);
  const match = trackable.find(
    (f) => f.key === fullKey || f.key.endsWith(`.${factKeySuffix}`)
  );
  return (match as ScopeFactDefinition) ?? null;
}

function detectImplicitScopeAreaUpdate(
  text: string,
  scopes: ScopeForFactResolution[]
): { factKey: string; fact: ScopeFactDefinition; scope: ScopeForFactResolution }[] {
  if (HEIGHT_CONTEXT_PATTERN.test(text) && !hasAreaUnit(text)) {
    return [];
  }
  if (WALKING_DISTANCE_PATTERN.test(text) && !hasAreaUnit(text)) {
    return [];
  }

  const measurementContext = classifyMeasurementContext(text);
  if (
    measurementContext.kind === "height" ||
    measurementContext.kind === "distance"
  ) {
    return [];
  }

  const hasDimensions = parseLengthWidthDimensions(text).length > 0;
  if (!AREA_UNIT_PATTERN.test(text) && !LENGTH_UNIT_PATTERN.test(text) && !hasDimensions) {
    return [];
  }

  const matches: {
    factKey: string;
    fact: ScopeFactDefinition;
    scope: ScopeForFactResolution;
  }[] = [];

  for (const scope of scopes) {
    const prefix = scopePrefix(scope.workAreaTypeKey);
    if (!prefix) continue;

    const scopeMentioned = findScopeByHint(scopes, undefined, text).some(
      (s) => s.scopeId === scope.scopeId
    );
    if (!scopeMentioned) continue;

    const suffix = IMPLICIT_AREA_BY_SCOPE[prefix];
    if (!suffix) continue;

    const fact = resolveFactForScope(scope, suffix);
    if (!fact) continue;

    matches.push({ factKey: fact.key, fact, scope });
  }

  return matches;
}

function detectFinishLevelUpdate(
  text: string,
  scopes: ScopeForFactResolution[]
): { factKey: string; fact: ScopeFactDefinition; scope: ScopeForFactResolution }[] {
  if (!FINISH_LEVEL_PATTERN.test(text)) return [];

  const matches: {
    factKey: string;
    fact: ScopeFactDefinition;
    scope: ScopeForFactResolution;
  }[] = [];

  for (const scope of findScopeByHint(scopes, undefined, text)) {
    const fact = resolveFactForScope(scope, "finish_level");
    if (!fact) continue;
    matches.push({ factKey: fact.key, fact, scope });
  }

  if (matches.length > 0) return matches;

  for (const scope of scopes) {
    const fact = resolveFactForScope(scope, "finish_level");
    if (!fact) continue;
    matches.push({ factKey: fact.key, fact, scope });
  }

  return matches;
}

function detectMultiDimensionFacts(
  text: string,
  scopes: ScopeForFactResolution[]
): {
  factKey: string;
  fact: ScopeFactDefinition;
  scope: ScopeForFactResolution;
  newValue: string;
}[] {
  const measurements = resolveMeasurements(text);
  const lengthVal = measurements.length_m;
  const heightVal = measurements.height_m;
  if (lengthVal == null || heightVal == null) return [];

  const candidateScopes = findScopeByHint(scopes, /retaining|wall/i, text);
  if (candidateScopes.length !== 1) return [];

  const scope = candidateScopes[0]!;
  const results: {
    factKey: string;
    fact: ScopeFactDefinition;
    scope: ScopeForFactResolution;
    newValue: string;
  }[] = [];

  const lengthFact = resolveFactForScope(scope, "length_m");
  const heightFact = resolveFactForScope(scope, "height_m");

  if (lengthFact) {
    results.push({
      factKey: lengthFact.key,
      fact: lengthFact,
      scope,
      newValue: String(lengthVal),
    });
  }
  if (heightFact) {
    results.push({
      factKey: heightFact.key,
      fact: heightFact,
      scope,
      newValue: String(heightVal),
    });
  }

  return results;
}

function detectFactKey(
  text: string,
  scopes: ScopeForFactResolution[]
): { factKey: string; fact: ScopeFactDefinition; scope: ScopeForFactResolution }[] {
  const matches: {
    factKey: string;
    fact: ScopeFactDefinition;
    scope: ScopeForFactResolution;
  }[] = [];

  for (const phrase of FACT_PHRASES) {
    if (!phrase.patterns.some((p) => p.test(text))) continue;

    const candidateScopes = phrase.genericArea
      ? scopes
      : findScopeByHint(scopes, phrase.scopeHint, text);

    for (const scope of candidateScopes) {
      if (phrase.genericArea) {
        const prefix = scopePrefix(scope.workAreaTypeKey);
        const suffix =
          prefix === "bathroom"
            ? "floor_area_m2"
            : prefix === "deck"
              ? "area_m2"
              : phrase.factKeySuffix;
        const fact = resolveFactForScope(scope, suffix);
        if (!fact) continue;
        matches.push({ factKey: fact.key, fact, scope });
        continue;
      }

      const fact = resolveFactForScope(scope, phrase.factKeySuffix);
      if (!fact) continue;
      matches.push({ factKey: fact.key, fact, scope });
    }
  }

  if (matches.length === 0) {
    matches.push(...detectImplicitScopeAreaUpdate(text, scopes));
  }

  if (matches.length === 0 || FINISH_LEVEL_PATTERN.test(text)) {
    const finishMatches = detectFinishLevelUpdate(text, scopes);
    for (const finish of finishMatches) {
      if (!matches.some((m) => m.factKey === finish.factKey)) {
        matches.push(finish);
      }
    }
  }

  return matches;
}

function parseNumericValue(text: string, fact: ScopeFactDefinition): string | null {
  const parsed = parseNumericForFact(text, fact.key, fact.unit);
  if (parsed) return parsed;

  const scopeMentioned = /deck|wall|retaining|bathroom/i.test(text);
  const bare = parseBareScopeNumber(text, scopeMentioned);
  if (bare && fact.type === "number") return bare;

  return null;
}

function parseSelectValue(
  text: string,
  fact: ScopeFactDefinition
): string | null {
  if (fact.key.includes("finish_level")) {
    const lower = text.toLowerCase();
    if (/\bnot\s+premium\b|\bstandard\s+not\s+premium\b/.test(lower)) {
      return "standard";
    }
    if (/\bnot\s+standard\b|\bpremium\s+not\s+standard\b/.test(lower)) {
      return "premium";
    }
    const match = text.match(FINISH_LEVEL_PATTERN);
    if (!match?.[1]) return null;
    return normaliseQualityLevel(match[1]);
  }

  if (fact.key.includes("material")) {
    const lower = text.toLowerCase();
    if (/\btimber\b|\bhardwood\b|\bpine\b/.test(lower)) return "timber";
    if (/\bcomposite\b/.test(lower)) return "composite";
    if (/\bblock\b/.test(lower)) return "block";
    if (/\bconcrete\b/.test(lower)) return "concrete";
  }

  if (fact.key.includes("level_type")) {
    const lower = text.toLowerCase();
    if (/\belevated\b|\braised\b/.test(lower)) return "elevated";
    if (/\bground\b/.test(lower)) return "ground";
  }

  if (fact.key.includes("tile_extent")) {
    const lower = text.toLowerCase();
    if (/\bfull\b/.test(lower)) return "full";
    if (/\bpartial\b/.test(lower)) return "partial";
  }

  if (fact.key.includes("fixtures_client_supplied")) {
    const lower = text.toLowerCase();
    if (
      /client\s+(?:is\s+)?suppl(?:y|ying|ied)/i.test(lower) ||
      /(?:vanity|toilet|tiles).*client/i.test(lower)
    ) {
      if (/partial|some|vanity.*toilet|tiles.*vanity/i.test(lower)) return "partial";
      return "yes";
    }
    if (/we\s+supply|contractor\s+suppl/i.test(lower)) return "no";
  }

  if (fact.key.includes("tiles_supplied_by")) {
    const lower = text.toLowerCase();
    if (/client\s+suppl|supplied by client|client supplies/i.test(lower)) {
      return "client";
    }
    if (/we\s+supply|contractor/i.test(lower)) return "contractor";
  }

  if (fact.key.includes("material_supply")) {
    const lower = text.toLowerCase();
    if (/labour\s+only|labour-only/i.test(lower)) return "labour_only";
    if (/client\s+suppl/i.test(lower)) return "client_supplied";
    if (/exclude\s+materials/i.test(lower)) return "labour_only";
    if (/supply\s+and\s+install/i.test(lower)) return "supply_and_install";
  }

  if (fact.key.includes("balustrade_supply")) {
    const lower = text.toLowerCase();
    if (/install\s+only|exclude\s+balustrade\s+supply|client\s+suppl/i.test(lower)) {
      return "client_supplied";
    }
    if (/supply\s+and\s+install|we\s+supply/i.test(lower)) return "supply_and_install";
  }

  if (fact.options?.length) {
    for (const option of fact.options) {
      if (text.toLowerCase().includes(option.label.toLowerCase())) {
        return option.value;
      }
      if (text.toLowerCase().includes(option.value.toLowerCase())) {
        return option.value;
      }
    }
  }

  if (
    fact.key.includes("has_pergola") ||
    fact.key.includes("has_stairs") ||
    fact.key.includes("has_balustrade")
  ) {
    if (/^add\s+/i.test(text.trim())) return "yes";
    if (/^remove\s+/i.test(text.trim())) return "no";
  }

  if (fact.key.includes("machine_access")) {
    const lower = text.toLowerCase();
    if (/no\s+machine\s+access/i.test(lower)) return "no";
    if (/machine\s+access\s+(?:is\s+)?available/i.test(lower)) return "yes";
  }

  const yesNo = text.match(YES_NO_PATTERN);
  if (yesNo) {
    const token = yesNo[1].toLowerCase();
    if (["yes", "true", "required", "included"].includes(token)) return "yes";
    if (["no", "false", "not required", "not included", "none"].includes(token)) {
      return "no";
    }
  }

  if (/^no\s+/i.test(text.trim()) && fact.type === "select") {
    return "no";
  }
  if (/^yes\s+\w/i.test(text.trim()) && fact.type === "select") {
    return "yes";
  }
  if (/^include\s+/i.test(text.trim()) && fact.type === "select") {
    return "yes";
  }
  if (/^exclude\s+/i.test(text.trim()) && fact.type === "select") {
    return "no";
  }

  return null;
}

function parseNewValue(text: string, fact: ScopeFactDefinition): string | null {
  if (fact.type === "number") {
    return parseNumericValue(text, fact);
  }

  if (fact.type === "select") {
    return parseSelectValue(text, fact);
  }

  return null;
}

function formatDisplayValue(value: string, fact: ScopeFactDefinition): string {
  if (fact.type === "number" && fact.unit) {
    return `${value}${fact.unit}`;
  }
  if (fact.type === "select" && fact.options) {
    const opt = fact.options.find((o) => o.value === value);
    return opt?.label ?? value;
  }
  return value;
}

function looksLikeFactUpdate(text: string): boolean {
  const trimmed = text.trim();
  if (COMMAND_VERB_PATTERN.test(trimmed)) return true;
  if (
    IMPLICIT_CORRECTION_PATTERN.test(trimmed) &&
    AREA_UNIT_PATTERN.test(trimmed)
  ) {
    return true;
  }
  if (
    /\b(?:the\s+)?(?:deck|bathroom|retaining\s*wall)\s+is\s+\d+/i.test(trimmed) ||
    /\b(?:deck|bathroom|retaining\s*wall)\s+(?:size|area)\s+is\s+\d+/i.test(trimmed)
  ) {
    return true;
  }
  if (/^(no|yes|none)\s+[a-z]/i.test(trimmed)) return true;
  if (
    /client\s+(?:is\s+)?suppl|labour\s+only|exclude\s+materials|supply\s+and\s+install|client\s+has\s+their\s+own/i.test(
      trimmed
    )
  ) {
    return true;
  }
  if (FACT_PHRASES.some((phrase) => phrase.patterns.some((p) => p.test(trimmed)))) {
    return true;
  }
  return false;
}

function buildAmbiguousAreaMessage(
  candidates: { scope: ScopeForFactResolution; fact: ScopeFactDefinition }[]
): string {
  const labels = candidates.map((c) => c.scope.scopeName.toLowerCase());
  if (labels.length === 2) {
    return `Which area should I update — ${labels[0]} or ${labels[1]}?`;
  }
  return `Do you mean ${labels.slice(0, -1).join(", ")} or ${labels.at(-1)} area?`;
}

function buildAmbiguousFactMessage(
  scopeName: string,
  facts: ScopeFactDefinition[]
): string {
  const labels = facts.map((f) => f.label.toLowerCase());
  if (labels.some((l) => l.includes("area"))) {
    return "Do you mean deck area, wall area, or floor area?";
  }
  return `Which ${scopeName.toLowerCase()} detail should I update — ${labels.join(" or ")}?`;
}

function detectDeckDimensionUpdate(
  text: string,
  scopes: ScopeForFactResolution[]
): FactUpdateResolution | null {
  const dims = parseLengthWidthDimensions(text);
  if (dims.length === 0) return null;

  const deck = scopes.find((s) => s.workAreaTypeKey === "Deck");
  if (!deck) return null;

  const dim = dims[0]!;
  const areaFact = resolveFactForScope(deck, "area_m2");
  if (!areaFact) return null;

  const additionalFacts: NonNullable<FactUpdateResolution["additionalFacts"]> =
    [];

  const lengthFact = resolveFactForScope(deck, "length_m");
  const widthFact = resolveFactForScope(deck, "width_m");
  if (lengthFact) {
    additionalFacts.push({
      factKey: lengthFact.key,
      factLabel: lengthFact.label,
      newValue: String(dim.length_m),
      previousValue: deck.answers[lengthFact.key],
      unit: lengthFact.unit,
    });
  }
  if (widthFact) {
    additionalFacts.push({
      factKey: widthFact.key,
      factLabel: widthFact.label,
      newValue: String(dim.width_m),
      previousValue: deck.answers[widthFact.key],
      unit: widthFact.unit,
    });
  }

  return {
    matched: true,
    confidence: 0.92,
    scopeId: deck.scopeId,
    scopeTypeKey: deck.workAreaTypeKey,
    scopeName: deck.scopeName,
    factKey: areaFact.key,
    factLabel: areaFact.label,
    currentValue: deck.answers[areaFact.key],
    newValue: String(dim.area_m2),
    unit: areaFact.unit,
    additionalFacts: additionalFacts.length > 0 ? additionalFacts : undefined,
    requiresConfirmation: false,
  };
}

function detectHeightUpdate(
  text: string,
  scopes: ScopeForFactResolution[]
): FactUpdateResolution | null {
  if (hasAreaUnit(text)) return null;
  if (!/deck/i.test(text)) return null;
  if (/retaining\s*wall|wall\s+is\s+\d/i.test(text) && !/deck/i.test(text)) {
    return null;
  }

  const context = classifyMeasurementContext(text);
  if (context.kind !== "height" && context.kind !== "ambiguous") return null;

  const deck = scopes.find((s) => s.workAreaTypeKey === "Deck");
  if (!deck || context.value == null) return null;

  const heightFact = resolveFactForScope(deck, "height_m");
  const levelFact = resolveFactForScope(deck, "level_type");
  if (!heightFact) return null;

  const unusual = context.value > 10;
  const additionalFacts: NonNullable<FactUpdateResolution["additionalFacts"]> =
    [];

  if (levelFact && (context.kind === "height" || unusual)) {
    additionalFacts.push({
      factKey: levelFact.key,
      factLabel: levelFact.label,
      newValue: "elevated",
      previousValue: deck.answers[levelFact.key],
    });
  }

  return {
    matched: true,
    confidence: unusual ? 0.7 : 0.9,
    scopeId: deck.scopeId,
    scopeTypeKey: deck.workAreaTypeKey,
    scopeName: deck.scopeName,
    factKey: heightFact.key,
    factLabel: heightFact.label,
    currentValue: deck.answers[heightFact.key],
    newValue: String(context.value),
    unit: heightFact.unit,
    additionalFacts: additionalFacts.length > 0 ? additionalFacts : undefined,
    requiresConfirmation: unusual || context.kind === "ambiguous",
    confirmationMessage: unusual
      ? `Just checking — did you mean the deck is ${context.value}m above ground, or ${context.value}m² in area?`
      : context.kind === "ambiguous"
        ? `Just checking — did you mean the deck is ${context.value}m above ground, or ${context.value}m² in area?`
        : undefined,
  };
}

function detectFinishLevelSynonymUpdate(
  text: string,
  scopes: ScopeForFactResolution[]
): FactUpdateResolution | null {
  const level = parseFinishLevelSynonym(text);
  if (!level) return null;

  if (/\bstandard\s+timber\b/i.test(text)) {
    return {
      matched: true,
      confidence: 0.55,
      requiresConfirmation: true,
      confirmationMessage:
        "Do you mean standard finish level, or standard timber material?",
    };
  }

  const scope = findScopeByHint(scopes, /deck|bathroom/i, text)[0] ?? scopes[0];
  if (!scope) return null;

  const fact = resolveFactForScope(scope, "finish_level");
  if (!fact) return null;

  return {
    matched: true,
    confidence: 0.88,
    scopeId: scope.scopeId,
    scopeTypeKey: scope.workAreaTypeKey,
    scopeName: scope.scopeName,
    factKey: fact.key,
    factLabel: fact.label,
    currentValue: scope.answers[fact.key],
    newValue: level,
    requiresConfirmation: false,
  };
}

function detectClientSupplyUpdate(
  text: string,
  scopes: ScopeForFactResolution[]
): FactUpdateResolution | null {
  const lower = text.toLowerCase();
  if (
    !/client\s+(?:is\s+)?suppl|labour\s+only|exclude\s+materials|supply\s+and\s+install|install\s+only/i.test(
      lower
    )
  ) {
    return null;
  }

  const bathroom = scopes.find(
    (s) => s.workAreaTypeKey === "Bathroom renovation"
  );
  if (bathroom && /client\s+has\s+their\s+own/i.test(lower) && /\bvanity\b/i.test(lower)) {
    const fact = resolveFactForScope(bathroom, "fixtures_client_supplied");
    if (fact) {
      return {
        matched: true,
        confidence: 0.9,
        scopeId: bathroom.scopeId,
        scopeTypeKey: bathroom.workAreaTypeKey,
        scopeName: bathroom.scopeName,
        factKey: fact.key,
        factLabel: fact.label,
        currentValue: bathroom.answers[fact.key],
        newValue: "yes",
        requiresConfirmation: false,
      };
    }
  }

  if (bathroom && /client\s+(?:is\s+)?suppl|client\s+has\s+their\s+own/i.test(lower)) {
    const hasTiles = /\btiles?\b/i.test(lower);
    const hasFixtures = /\bvanity|toilet|fixtures|basin\b/i.test(lower);

    if (hasTiles && hasFixtures) {
      const fact = resolveFactForScope(bathroom, "fixtures_client_supplied");
      if (fact) {
        return {
          matched: true,
          confidence: 0.88,
          scopeId: bathroom.scopeId,
          scopeTypeKey: bathroom.workAreaTypeKey,
          scopeName: bathroom.scopeName,
          factKey: fact.key,
          factLabel: fact.label,
          currentValue: bathroom.answers[fact.key],
          newValue: "partial",
          requiresConfirmation: false,
        };
      }
    }

    if (hasTiles) {
      const fact = resolveFactForScope(bathroom, "tiles_supplied_by");
      if (fact) {
        return {
          matched: true,
          confidence: 0.88,
          scopeId: bathroom.scopeId,
          scopeTypeKey: bathroom.workAreaTypeKey,
          scopeName: bathroom.scopeName,
          factKey: fact.key,
          factLabel: fact.label,
          currentValue: bathroom.answers[fact.key],
          newValue: "client",
          requiresConfirmation: false,
        };
      }
    }

    if (hasFixtures) {
      const fact = resolveFactForScope(bathroom, "fixtures_client_supplied");
      if (fact) {
        return {
          matched: true,
          confidence: 0.88,
          scopeId: bathroom.scopeId,
          scopeTypeKey: bathroom.workAreaTypeKey,
          scopeName: bathroom.scopeName,
          factKey: fact.key,
          factLabel: fact.label,
          currentValue: bathroom.answers[fact.key],
          newValue: "yes",
          requiresConfirmation: false,
        };
      }
    }
  }

  const deck = scopes.find((s) => s.workAreaTypeKey === "Deck");
  if (deck && /labour\s+only|exclude\s+materials|client\s+suppl|supply\s+and\s+install/i.test(lower)) {
    const fact = resolveFactForScope(deck, "material_supply");
    if (fact) {
      const newValue = /labour\s+only|exclude\s+materials/i.test(lower)
        ? "labour_only"
        : /supply\s+and\s+install/i.test(lower)
          ? "supply_and_install"
          : "client_supplied";
      return {
        matched: true,
        confidence: 0.88,
        scopeId: deck.scopeId,
        scopeTypeKey: deck.workAreaTypeKey,
        scopeName: deck.scopeName,
        factKey: fact.key,
        factLabel: fact.label,
        currentValue: deck.answers[fact.key],
        newValue,
        requiresConfirmation: false,
      };
    }
  }

  return null;
}

/**
 * Deterministic natural-language resolver for scope fact updates.
 * Does not call AI — use only for targeted fact corrections.
 */
export function resolveFactUpdate(
  scopes: ScopeForFactResolution[],
  userMessage: string
): FactUpdateResolution {
  const text = userMessage.trim();

  if (!text || scopes.length === 0) {
    return {
      matched: false,
      confidence: 0,
      requiresConfirmation: true,
      confirmationMessage:
        "I couldn't update that because I couldn't identify the scope. Which work area should this apply to?",
    };
  }

  const deckSizeMatch = text.match(/\bdeck\s+size\s+is\s+(\d+(?:\.\d+)?)/i);
  if (deckSizeMatch?.[1]) {
    const deck = scopes.find((s) => s.workAreaTypeKey === "Deck");
    if (deck) {
      const fact = resolveFactForScope(deck, "area_m2");
      if (fact) {
        return {
          matched: true,
          confidence: 0.92,
          scopeId: deck.scopeId,
          scopeTypeKey: deck.workAreaTypeKey,
          scopeName: deck.scopeName,
          factKey: fact.key,
          factLabel: fact.label,
          currentValue: deck.answers[fact.key],
          newValue: deckSizeMatch[1],
          unit: fact.unit,
          requiresConfirmation: false,
        };
      }
    }
  }

  const vanityMatch = /client\s+has\s+their\s+own\s+vanity/i.test(text);
  if (vanityMatch) {
    const bathroom = scopes.find(
      (s) => s.workAreaTypeKey === "Bathroom renovation"
    );
    if (bathroom) {
      const fact = resolveFactForScope(bathroom, "fixtures_client_supplied");
      if (fact) {
        return {
          matched: true,
          confidence: 0.9,
          scopeId: bathroom.scopeId,
          scopeTypeKey: bathroom.workAreaTypeKey,
          scopeName: bathroom.scopeName,
          factKey: fact.key,
          factLabel: fact.label,
          currentValue: bathroom.answers[fact.key],
          newValue: "yes",
          requiresConfirmation: false,
        };
      }
    }
  }

  if (!looksLikeFactUpdate(text)) {
    return { matched: false, confidence: 0, requiresConfirmation: false };
  }

  const deckDims = detectDeckDimensionUpdate(text, scopes);
  if (deckDims) return deckDims;

  const heightUpdate = detectHeightUpdate(text, scopes);
  if (heightUpdate) return heightUpdate;

  const finishSynonym = detectFinishLevelSynonymUpdate(text, scopes);
  if (finishSynonym) return finishSynonym;

  const clientSupply = detectClientSupplyUpdate(text, scopes);
  if (clientSupply) {
    return clientSupply;
  }

  const multiDims = detectMultiDimensionFacts(text, scopes);
  if (multiDims.length >= 2) {
    const primary = multiDims[0]!;
    const additionalFacts = multiDims.slice(1).map((m) => ({
      factKey: m.factKey,
      factLabel: m.fact.label,
      newValue: m.newValue,
      previousValue: m.scope.answers[m.factKey],
      unit: m.fact.unit,
    }));

    return {
      matched: true,
      confidence: 0.92,
      scopeId: primary.scope.scopeId,
      scopeTypeKey: primary.scope.workAreaTypeKey,
      scopeName: primary.scope.scopeName,
      factKey: primary.factKey,
      factLabel: primary.fact.label,
      currentValue: primary.scope.answers[primary.factKey],
      newValue: primary.newValue,
      unit: primary.fact.unit,
      additionalFacts,
      requiresConfirmation: false,
    };
  }

  const factMatches = detectFactKey(text, scopes);

  if (factMatches.length === 0) {
    return { matched: false, confidence: 0, requiresConfirmation: false };
  }

  const uniqueByScopeFact = new Map<string, (typeof factMatches)[number]>();
  for (const match of factMatches) {
    uniqueByScopeFact.set(`${match.scope.scopeId}:${match.factKey}`, match);
  }
  const uniqueMatches = [...uniqueByScopeFact.values()];

  if (uniqueMatches.length > 1) {
    const textLower = text.toLowerCase();
    const scopeHinted = uniqueMatches.filter((m) => {
      const name = m.scope.scopeName.toLowerCase();
      const typeKey = m.scope.workAreaTypeKey.toLowerCase();
      return (
        textLower.includes(name) ||
        (textLower.includes("deck") && typeKey === "deck") ||
        (textLower.includes("wall") && typeKey.includes("retaining")) ||
        (textLower.includes("bathroom") && typeKey.includes("bathroom"))
      );
    });
    if (scopeHinted.length === 1) {
      const { scope, fact, factKey } = scopeHinted[0]!;
      const newValue = parseNewValue(text, fact);
      if (newValue) {
        const hasExplicitVerb = COMMAND_VERB_PATTERN.test(text);
        const confidence = hasExplicitVerb ? 0.92 : 0.86;
        return {
          matched: true,
          confidence,
          scopeId: scope.scopeId,
          scopeTypeKey: scope.workAreaTypeKey,
          scopeName: scope.scopeName,
          factKey,
          factLabel: fact.label,
          currentValue: scope.answers[factKey],
          newValue,
          unit: fact.unit,
          requiresConfirmation: confidence < 0.85,
        };
      }
    }

    const areaFacts = uniqueMatches.filter((m) => m.fact.key.includes("area"));
    if (areaFacts.length > 1) {
      return {
        matched: true,
        confidence: 0.55,
        requiresConfirmation: true,
        confirmationMessage: buildAmbiguousAreaMessage(areaFacts),
      };
    }

    const sameScope = uniqueMatches.every(
      (m) => m.scope.scopeId === uniqueMatches[0]!.scope.scopeId
    );
    if (sameScope) {
      return {
        matched: true,
        confidence: 0.55,
        requiresConfirmation: true,
        confirmationMessage: buildAmbiguousFactMessage(
          uniqueMatches[0]!.scope.scopeName,
          uniqueMatches.map((m) => m.fact)
        ),
      };
    }

    return {
      matched: true,
      confidence: 0.5,
      requiresConfirmation: true,
      confirmationMessage: buildAmbiguousAreaMessage(uniqueMatches),
    };
  }

  const { scope, fact, factKey } = uniqueMatches[0]!;
  const newValue = parseNewValue(text, fact);

  if (!newValue) {
    return {
      matched: true,
      confidence: 0.5,
      scopeId: scope.scopeId,
      scopeTypeKey: scope.workAreaTypeKey,
      scopeName: scope.scopeName,
      factKey,
      factLabel: fact.label,
      currentValue: scope.answers[factKey],
      requiresConfirmation: true,
      confirmationMessage: `What should I set ${scope.scopeName.toLowerCase()} ${fact.label.toLowerCase()} to?`,
    };
  }

  const currentValue = scope.answers[factKey];
  const hasExplicitVerb =
    COMMAND_VERB_PATTERN.test(text) ||
    /machine\s+access|no\s+machine\s+access|no\s+stairs|include\s+stairs|exclude\s+/i.test(
      text
    );
  const hasExplicitAreaUnit = hasAreaUnit(text) && fact.key.includes("area");
  let confidence = hasExplicitVerb ? 0.92 : 0.82;
  if (hasExplicitAreaUnit) confidence = 0.92;

  const requiresConfirmation =
    confidence < 0.85 ||
    (currentValue != null && currentValue !== newValue && !hasExplicitVerb);

  let confirmationMessage: string | undefined;
  if (requiresConfirmation && currentValue) {
    confirmationMessage = `I found ${scope.scopeName.toLowerCase()} ${fact.label.toLowerCase()} is currently ${formatDisplayValue(currentValue, fact)}. Do you want me to change it to ${formatDisplayValue(newValue, fact)}?`;
  } else if (requiresConfirmation) {
    confirmationMessage = `Do you want me to set ${scope.scopeName.toLowerCase()} ${fact.label.toLowerCase()} to ${formatDisplayValue(newValue, fact)}?`;
  }

  return {
    matched: true,
    confidence,
    scopeId: scope.scopeId,
    scopeTypeKey: scope.workAreaTypeKey,
    scopeName: scope.scopeName,
    factKey,
    factLabel: fact.label,
    currentValue,
    newValue,
    unit: fact.unit,
    requiresConfirmation,
    confirmationMessage,
  };
}
