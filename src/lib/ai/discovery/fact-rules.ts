import type { DiscoveryFact } from "@/lib/ai/discovery/types";
import { normalizeQuestionKey } from "@/lib/question-keys";
import {
  extractProjectScopeFactsDeterministic,
  projectScopeFactsToDiscoveryFacts,
} from "@/lib/assistant-v2/extraction/extract-project-scope-facts";
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
    key: "bathroom.floor_area_m2",
    label: "Floor area",
    unit: "m²",
    workAreaTypeKey: "Bathroom renovation",
    patterns: [
      /(?:around|approx(?:\.|imately)?|about)\s*(\d+(?:\.\d+)?)\s*(?:m2|m²|sqm|square\s*met(?:re|er)s?)(?:\s+floor\s*area)?/i,
      /(\d+(?:\.\d+)?)\s*(?:m2|m²|sqm|square\s*met(?:re|er)s?)\s*(?:floor\s*)?area/i,
      /floor\s*area\s*(?:(?:of|is|about|around|approx(?:\.|imately)?)\s*)?(\d+(?:\.\d+)?)\s*(?:m2|m²|sqm)/i,
    ],
    extractValue: (m, text) =>
      /\bbathroom\b|\bensuite\b/i.test(text) ? (m[1] ?? null) : null,
  },
  {
    key: "kitchen.demolition_required",
    label: "Demolition required",
    workAreaTypeKey: "Kitchen renovation",
    patterns: [
      /\bfull\s+demolition\s+of\s+existing\s+kitchen\b/i,
      /\bdemo(?:lish)?(?:ition)?\s+(?:of\s+)?(?:the\s+)?existing\s+kitchen\b/i,
    ],
    extractValue: () => "yes",
  },
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

  const extracted = extractProjectScopeFactsDeterministic(text);
  const structuredFacts = projectScopeFactsToDiscoveryFacts(extracted);

  const templateFacts = extractFactsFromTemplates(text);
  const facts: DiscoveryFact[] = [];
  const seenKeys = new Set<string>();

  const addFact = (fact: DiscoveryFact) => {
    const key = normalizeQuestionKey(fact.key) ?? fact.key;
    if (seenKeys.has(key)) return;
    seenKeys.add(key);
    facts.push({ ...fact, key });
  };

  for (const fact of structuredFacts) {
    addFact(fact);
  }

  for (const fact of templateFacts) {
    addFact(fact);
  }

  for (const rule of FACT_RULES) {
    const canonicalKey = normalizeQuestionKey(rule.key) ?? rule.key;

    for (const pattern of rule.patterns) {
      const match = text.match(pattern);
      if (!match) continue;

      const rawValue = rule.extractValue(match, text);
      if (!rawValue) continue;

      if (seenKeys.has(canonicalKey)) continue;
      seenKeys.add(canonicalKey);

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
