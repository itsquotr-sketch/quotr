import type { DiscoveryFact } from "@/lib/ai/discovery/types";
import { normalizeQuestionKey } from "@/lib/question-keys";
import { extractFactsFromTemplates } from "@/lib/scope-templates/discovery";

type FactRule = {
  key: string;
  label: string;
  unit?: string;
  workAreaTypeKey?: string;
  patterns: RegExp[];
  extractValue: (match: RegExpMatchArray, text: string) => string | null;
};

/** Legacy fact rules for work areas without scope templates. */
const FACT_RULES: FactRule[] = [
  {
    key: "painting.area_m2",
    label: "Paint area",
    unit: "m²",
    workAreaTypeKey: "Painting",
    patterns: [
      /(?:paint(?:ing)?|area)\s*(?:of|about|approx(?:imately)?\.?|is)?\s*(\d+(?:\.\d+)?)\s*(?:m2|m²|sqm)/i,
      /(\d+(?:\.\d+)?)\s*(?:m2|m²|sqm)\s*(?:to\s*paint|paint(?:ing)?)/i,
    ],
    extractValue: (m) => m[1] ?? null,
  },
];

export function extractFactsFromNotes(sourceNotes: string): DiscoveryFact[] {
  const text = sourceNotes.trim();
  if (!text) return [];

  const templateFacts = extractFactsFromTemplates(text);
  const facts: DiscoveryFact[] = [...templateFacts];
  const seen = new Set(
    templateFacts.map((f) => `${f.key}:${f.value}`)
  );

  for (const rule of FACT_RULES) {
    const canonicalKey = normalizeQuestionKey(rule.key) ?? rule.key;

    for (const pattern of rule.patterns) {
      const match = text.match(pattern);
      if (!match) continue;

      const rawValue = rule.extractValue(match, text);
      if (!rawValue) continue;

      const dedupeKey = `${canonicalKey}:${rawValue}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      const displayValue =
        rule.unit && /^\d/.test(rawValue)
          ? `${rawValue} ${rule.unit}`
          : rawValue;

      facts.push({
        key: canonicalKey,
        label: rule.label,
        value: displayValue,
        unit: rule.unit,
        workAreaTypeKey: rule.workAreaTypeKey,
        source: "notes",
        confidence: 0.75,
      });
      break;
    }
  }

  return facts;
}
