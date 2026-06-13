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
});

export type FactUpdateResolution = z.infer<typeof factUpdateResolutionSchema>;

export type ScopeForFactResolution = {
  scopeId: string;
  scopeName: string;
  workAreaTypeKey: string;
  answers: Record<string, string>;
};

const COMMAND_VERB_PATTERN =
  /\b(?:change|update|make|remove|delete|exclude|add|include|increase|reduce|set|actually|correction|correct)\b/i;

const IMPLICIT_CORRECTION_PATTERN =
  /\b(?:actually|correction|it's|it is|the .+ is)\b/i;

const AREA_UNIT_PATTERN =
  /(\d+(?:\.\d+)?)\s*(?:m²|m2|sqm|square\s*met(?:re|er)s?)/i;

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
    patterns: [/demolition|demo(?:lish)?|existing\s*deck/i],
    factKeySuffix: "has_existing_deck",
    scopeHint: /deck/i,
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
      /(?:we are|we're)\s+labour\s+only/i,
      /labour\s+only/i,
      /exclude\s+materials/i,
      /supply\s+and\s+install/i,
      /include\s+materials/i,
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
};

function scopePrefix(workAreaTypeKey: string): string | null {
  if (workAreaTypeKey === "Deck") return "deck";
  if (workAreaTypeKey === "Retaining Wall") return "retaining_wall";
  if (workAreaTypeKey === "Bathroom renovation") return "bathroom";
  return null;
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
  if (!scopeDef) return null;

  const prefix = scopePrefix(scope.workAreaTypeKey);
  const fullKey = prefix ? `${prefix}.${factKeySuffix}` : factKeySuffix;

  return (
    getAllFactsForScope(scopeDef).find((f) => f.key === fullKey) ??
    getAllFactsForScope(scopeDef).find((f) =>
      f.key.endsWith(`.${factKeySuffix}`)
    ) ??
    null
  );
}

function detectImplicitScopeAreaUpdate(
  text: string,
  scopes: ScopeForFactResolution[]
): { factKey: string; fact: ScopeFactDefinition; scope: ScopeForFactResolution }[] {
  if (!AREA_UNIT_PATTERN.test(text) && !LENGTH_UNIT_PATTERN.test(text)) {
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
  if (fact.unit === "m²" || fact.key.includes("area")) {
    const match = text.match(AREA_UNIT_PATTERN);
    if (match?.[1]) return match[1];
  }

  if (fact.unit === "m" || fact.key.includes("_m")) {
    const match = text.match(LENGTH_UNIT_PATTERN);
    if (match?.[1]) return match[1];
  }

  const bareNumber = text.match(
    /(?:to|at|is|=|about|around|approximately)\s*(\d+(?:\.\d+)?)/i
  );
  if (bareNumber?.[1] && fact.type === "number") return bareNumber[1];

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

  const yesNo = text.match(YES_NO_PATTERN);
  if (yesNo) {
    const token = yesNo[1].toLowerCase();
    if (["yes", "true", "required", "included"].includes(token)) return "yes";
    if (["no", "false", "not required", "not included", "none"].includes(token)) {
      return "no";
    }
  }

  if (/^no\s+\w/i.test(text.trim()) && fact.type === "select") {
    return "no";
  }
  if (/^yes\s+\w/i.test(text.trim()) && fact.type === "select") {
    return "yes";
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
    /\b(?:the\s+)?(?:deck|bathroom|retaining\s*wall)\s+is\s+\d+/i.test(trimmed)
  ) {
    return true;
  }
  if (/^(no|yes|none)\s+[a-z]/i.test(trimmed)) return true;
  if (
    /client\s+(?:is\s+)?suppl|labour\s+only|exclude\s+materials|supply\s+and\s+install|install\s+only/i.test(
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
  if (bathroom && /client\s+(?:is\s+)?suppl/i.test(lower)) {
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
  if (deck && /labour\s+only|exclude\s+materials|client\s+suppl/i.test(lower)) {
    const fact = resolveFactForScope(deck, "material_supply");
    if (fact) {
      const newValue = /labour\s+only|exclude\s+materials/i.test(lower)
        ? "labour_only"
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

  if (!looksLikeFactUpdate(text)) {
    return { matched: false, confidence: 0, requiresConfirmation: false };
  }

  const clientSupply = detectClientSupplyUpdate(text, scopes);
  if (clientSupply) {
    return clientSupply;
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
  const hasExplicitVerb = COMMAND_VERB_PATTERN.test(text);
  const confidence = hasExplicitVerb ? 0.92 : 0.82;

  const requiresConfirmation =
    confidence < 0.8 ||
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
