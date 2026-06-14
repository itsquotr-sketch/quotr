import { shouldSuppressQuestionForDerivedValue } from "@/lib/assistant-v2/facts/measurement-resolver";
import type { DiscoveryResult } from "@/lib/ai/discovery/types";
import type { QualityLevel } from "@/lib/constants/quality-level";
import { normaliseQualityLevel } from "@/lib/constants/quality-level";
import { normalizeQuestionKey } from "@/lib/question-keys";
import { getAllFactsForScope, getScopeByWorkAreaType } from "@/lib/scopes";
import { factIsAnsweredFromMap } from "@/lib/scopes/missing-facts";
import type { ScopeFactDefinition } from "@/lib/scopes/types";

export type KnownFactSource =
  | "user"
  | "discovery"
  | "quality"
  | "constraint"
  | "override";

export type KnownFactEntry = {
  value: string;
  source: KnownFactSource;
  confidence: number;
};

export type ScopeKnownFactsResult = {
  scopeId: string;
  scopeTypeKey: string;
  facts: Record<string, KnownFactEntry>;
};

export const KNOWN_FACT_CONFIDENCE_THRESHOLD = 0.75;

function confidenceForAnswer(value: string, source: KnownFactSource): number {
  const trimmed = value.trim().toLowerCase();
  if (trimmed === "unknown") return 0.75;
  if (source === "user") return 0.95;
  if (source === "quality") return 0.9;
  if (source === "constraint") return 0.85;
  if (source === "override") return 0.95;
  return 0.8;
}

function mergeFact(
  facts: Record<string, KnownFactEntry>,
  key: string,
  value: string,
  source: KnownFactSource,
  confidenceOverride?: number
): void {
  const normalizedKey = normalizeQuestionKey(key);
  if (!normalizedKey || !value.trim()) return;

  const confidence = confidenceOverride ?? confidenceForAnswer(value, source);
  const existing = facts[normalizedKey];

  if (!existing || confidence >= existing.confidence) {
    facts[normalizedKey] = { value: value.trim(), source, confidence };
  }
}

function applyFinishLevelFromQuality(
  facts: Record<string, KnownFactEntry>,
  scopeTypeKey: string,
  qualityLevel: QualityLevel
): void {
  if (qualityLevel === "unknown") return;

  const scope = getScopeByWorkAreaType(scopeTypeKey);
  if (!scope) return;

  for (const fact of getAllFactsForScope(scope)) {
    if (!fact.key.includes("finish_level")) continue;
    const existing = facts[fact.key];
    if (existing && existing.confidence >= KNOWN_FACT_CONFIDENCE_THRESHOLD) continue;
    mergeFact(facts, fact.key, qualityLevel, "quality", 0.9);
  }
}

function applyConstraintFacts(
  facts: Record<string, KnownFactEntry>,
  scopeTypeKey: string,
  selectedConstraintSlugs: string[]
): void {
  const scope = getScopeByWorkAreaType(scopeTypeKey);
  if (!scope) return;

  const slugSet = new Set(selectedConstraintSlugs);

  if (slugSet.has("tight-access")) {
    const tightFact = getAllFactsForScope(scope).find(
      (f) => f.key.includes("tight_access")
    );
    if (tightFact) {
      mergeFact(facts, tightFact.key, "yes", "constraint", 0.85);
    }
  }

  if (slugSet.has("carting-distance")) {
    const cartingFact = getAllFactsForScope(scope).find(
      (f) => f.key.includes("carting_distance")
    );
    if (cartingFact && !facts[cartingFact.key]) {
      mergeFact(facts, cartingFact.key, "yes", "constraint", 0.8);
    }
  }
}

export function getKnownFactsForScope(input: {
  scopeId: string;
  scopeTypeKey: string;
  answers: Record<string, string>;
  discovery?: DiscoveryResult | null;
  qualityLevel?: QualityLevel;
  selectedConstraintSlugs?: string[];
  overrides?: Record<string, string>;
}): ScopeKnownFactsResult {
  const facts: Record<string, KnownFactEntry> = {};
  const scope = getScopeByWorkAreaType(input.scopeTypeKey);

  if (input.discovery?.facts?.length) {
    for (const fact of input.discovery.facts) {
      if (
        fact.workAreaTypeKey &&
        fact.workAreaTypeKey !== input.scopeTypeKey
      ) {
        continue;
      }
      const key = normalizeQuestionKey(fact.key);
      if (!key || fact.value == null || String(fact.value).trim() === "") {
        continue;
      }
      const discoveryConfidence =
        typeof fact.confidence === "number" && fact.confidence > 0
          ? Math.min(fact.confidence, 0.95)
          : 0.8;
      mergeFact(
        facts,
        key,
        String(fact.value),
        "discovery",
        discoveryConfidence
      );
    }
  }

  for (const [key, value] of Object.entries(input.answers)) {
    if (!value?.trim()) continue;
    const normalizedKey = normalizeQuestionKey(key);
    if (!normalizedKey) continue;

    if (scope) {
      const factDef = getAllFactsForScope(scope).find(
        (f) => f.key === normalizedKey
      );
      if (factDef && !factIsAnsweredFromMap(factDef, input.answers)) continue;
    }

    mergeFact(facts, normalizedKey, value, "user");
  }

  if (input.overrides) {
    for (const [key, value] of Object.entries(input.overrides)) {
      if (value?.trim()) {
        mergeFact(facts, key, value, "override", 0.95);
      }
    }
  }

  if (input.qualityLevel) {
    applyFinishLevelFromQuality(facts, input.scopeTypeKey, input.qualityLevel);
  }

  if (input.selectedConstraintSlugs?.length) {
    applyConstraintFacts(facts, input.scopeTypeKey, input.selectedConstraintSlugs);
  }

  return {
    scopeId: input.scopeId,
    scopeTypeKey: input.scopeTypeKey,
    facts,
  };
}

export function isFactKnown(
  knownFacts: ScopeKnownFactsResult,
  factKey: string,
  minConfidence = KNOWN_FACT_CONFIDENCE_THRESHOLD
): boolean {
  const key = normalizeQuestionKey(factKey);
  if (!key) return false;
  const entry = knownFacts.facts[key];
  return Boolean(entry && entry.confidence >= minConfidence);
}

export function getKnownFactValue(
  knownFacts: ScopeKnownFactsResult,
  factKey: string
): string | null {
  const key = normalizeQuestionKey(factKey);
  if (!key) return null;
  return knownFacts.facts[key]?.value ?? null;
}

export function shouldSkipQuestion(
  knownFacts: ScopeKnownFactsResult,
  fact: ScopeFactDefinition,
  answers?: Record<string, string>
): boolean {
  if (answers && shouldSuppressQuestionForDerivedValue(fact.key, answers)) {
    return true;
  }

  if (isFactKnown(knownFacts, fact.key)) return true;

  const value = getKnownFactValue(knownFacts, fact.key);
  if (value === "unknown") return true;
  if (value === "no" && fact.type === "select") return true;
  if (value === "excluded" || value === "client_supplied") return true;

  return false;
}

export function getMissingFactsFromKnown(
  scopeTypeKey: string,
  knownFacts: ScopeKnownFactsResult,
  options?: { requiredOnly?: boolean; highImpactOnly?: boolean }
): ScopeFactDefinition[] {
  const scope = getScopeByWorkAreaType(scopeTypeKey);
  if (!scope) return [];

  const highImpact = new Set(scope.confidenceRules.highImpactOptionalKeys);
  let candidates: ScopeFactDefinition[];

  if (options?.requiredOnly) {
    candidates = scope.requiredFacts;
  } else if (options?.highImpactOnly) {
    candidates = scope.optionalFacts.filter((f) => highImpact.has(f.key));
  } else {
    candidates = [
      ...scope.requiredFacts,
      ...scope.optionalFacts.filter((f) => highImpact.has(f.key)),
    ];
  }

  return candidates.filter((fact) => !shouldSkipQuestion(knownFacts, fact));
}

export function parseFinishLevelSynonym(text: string): QualityLevel | null {
  const lower = text.toLowerCase();

  if (
    /\b(premium|high-?end|top\s+spec|upmarket|high\s+quality|luxury)\b/i.test(
      lower
    ) &&
    !/\bnot\s+premium\b/i.test(lower)
  ) {
    return "premium";
  }

  if (
    /\b(budget|basic|cheap(?:\s+and\s+cheerful)?)\b/i.test(lower) &&
    !/\bbudget\s+finish\b/i.test(lower)
  ) {
    if (/\bstandard\s+timber\b/i.test(lower)) return null;
    return "budget";
  }

  if (
    /\b(standard|normal|mid-?range|decent\s+quality)\b/i.test(lower)
  ) {
    if (/\bstandard\s+timber\b/i.test(lower)) return null;
    return "standard";
  }

  const normalized = normaliseQualityLevel(text);
  return normalized !== "unknown" ? normalized : null;
}
