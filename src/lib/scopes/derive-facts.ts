import type { DiscoveryFact } from "@/lib/ai/discovery/types";
import { normalizeQuestionKey } from "@/lib/question-keys";

function isDeckFact(f: DiscoveryFact): boolean {
  return String(f.workAreaTypeKey ?? "").toLowerCase() === "deck";
}

function getDeckWorkAreaTypeKey(facts: DiscoveryFact[]): string {
  const deckFact = facts.find(
    (f) => isDeckFact(f) || f.key.startsWith("deck.")
  );
  return deckFact?.workAreaTypeKey ?? "Deck";
}

function factKey(f: DiscoveryFact): string {
  return normalizeQuestionKey(f.key) ?? f.key;
}

function hasFactKey(facts: DiscoveryFact[], key: string): boolean {
  const canonical = normalizeQuestionKey(key) ?? key;
  return facts.some((f) => factKey(f) === canonical);
}

function getFactRawValue(facts: DiscoveryFact[], key: string): string | null {
  const canonical = normalizeQuestionKey(key) ?? key;
  const fact = facts.find((f) => factKey(f) === canonical);
  return fact?.value ?? null;
}

/** Parse numeric strings like "5", "5m", "5 m", "5.5", or "5 m" from display values. */
export function parseFactNumber(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const match = raw.trim().match(/^(\d+(?:\.\d+)?)\s*m?\b/i);
  if (!match?.[1]) return null;
  const num = Number(match[1]);
  return Number.isFinite(num) ? num : null;
}

export function deriveAdditionalFacts(
  extractedFacts: DiscoveryFact[]
): DiscoveryFact[] {
  const derived: DiscoveryFact[] = [];
  const workAreaTypeKey = getDeckWorkAreaTypeKey(extractedFacts);

  const length = parseFactNumber(
    getFactRawValue(extractedFacts, "deck.length_m")
  );
  const width = parseFactNumber(
    getFactRawValue(extractedFacts, "deck.width_m")
  );

  if (
    length != null &&
    width != null &&
    !hasFactKey(extractedFacts, "deck.area_m2")
  ) {
    const area = Math.round(length * width * 100) / 100;
    derived.push({
      key: "deck.area_m2",
      label: "Deck area",
      value: String(area),
      unit: "m²",
      workAreaTypeKey,
      source: "derived",
      confidence: 0.9,
    });
  }

  const height = parseFactNumber(
    getFactRawValue(extractedFacts, "deck.height_m")
  );

  if (
    height != null &&
    height > 0.4 &&
    !hasFactKey(extractedFacts, "deck.level_type")
  ) {
    derived.push({
      key: "deck.level_type",
      label: "Deck level",
      value: "elevated",
      workAreaTypeKey,
      source: "derived",
      confidence: 0.85,
    });
  }

  return derived;
}
