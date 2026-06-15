import { z } from "zod";
import { qualityLevelSchema } from "@/lib/constants/quality-level";
import { extractQualityLevelFromNotes } from "@/lib/ai/discovery/quality-level-rules";
import { extractFactsFromTemplates, matchWorkAreasFromTemplates } from "@/lib/scope-templates/discovery";
import { applyInferredFacts } from "@/lib/assistant-v2/facts/infer-related-facts";
import {
  measurementsToFactUpdates,
  resolveMeasurements,
  resolveScopePrefix,
} from "@/lib/assistant-v2/facts/measurement-resolver";
import { normalizeQuestionKey } from "@/lib/question-keys";
import { getAllFactsForTemplate, getScopeTemplateByWorkAreaType } from "@/lib/scope-templates";
import type { DiscoveryFact } from "@/lib/ai/discovery/types";

const extractedFactSchema = z.object({
  key: z.string(),
  value: z.string(),
  unit: z.string().optional(),
  confidence: z.number().min(0).max(1).default(0.75),
  sourceText: z.string().optional(),
});

const extractedWorkAreaSchema = z.object({
  scopeTypeKey: z.string(),
  label: z.string(),
  confidence: z.number().min(0).max(1).default(0.75),
  facts: z.array(extractedFactSchema).default([]),
  assumptions: z.array(z.string()).default([]),
  missingLikely: z.array(z.string()).default([]),
});

export const projectScopeFactsSchema = z.object({
  workAreas: z.array(extractedWorkAreaSchema),
  globalFacts: z.object({
    qualityLevel: qualityLevelSchema.optional(),
    constraints: z.array(z.string()).default([]),
    notes: z.array(z.string()).default([]),
  }),
});

export type ExtractedScopeFact = z.infer<typeof extractedFactSchema>;
export type ExtractedWorkArea = z.infer<typeof extractedWorkAreaSchema>;
export type ProjectScopeFactsResult = z.infer<typeof projectScopeFactsSchema>;

const DETERMINISTIC_PATTERNS: {
  key: string;
  patterns: RegExp[];
  value: string | ((match: RegExpMatchArray, text: string) => string | null);
  scopeTypeKey?: string;
}[] = [
  {
    key: "deck.has_stairs",
    patterns: [/\bsingle\s+step\b/i, /\bstairs\b/i, /\bsteps\b/i],
    value: "yes",
    scopeTypeKey: "Deck",
  },
  {
    key: "deck.has_pergola",
    patterns: [/\bpergola\b/i],
    value: "yes",
    scopeTypeKey: "Deck",
  },
  {
    key: "fence.gate_included",
    patterns: [/\bwith\s+(?:a\s+)?gate\b/i, /\bgate\b/i],
    value: "yes",
    scopeTypeKey: "Fence",
  },
  {
    key: "retaining_wall.excavation_included",
    patterns: [
      /\bincluding\s+all\s+excavation\b/i,
      /\bwith\s+excavation\b/i,
      /\bexcavation\s+included\b/i,
    ],
    value: "yes",
    scopeTypeKey: "Retaining Wall",
  },
  {
    key: "kitchen.demolition_required",
    patterns: [
      /\bfull\s+demolition\b/i,
      /\bdemo(?:lish)?(?:ition)?\s+(?:of\s+)?(?:the\s+)?existing\s+kitchen\b/i,
    ],
    value: "yes",
    scopeTypeKey: "Kitchen renovation",
  },
];

function parseDeterministicPatterns(
  text: string,
  workAreaTypeKey: string
): ExtractedScopeFact[] {
  const facts: ExtractedScopeFact[] = [];

  for (const rule of DETERMINISTIC_PATTERNS) {
    if (rule.scopeTypeKey && rule.scopeTypeKey !== workAreaTypeKey) continue;

    for (const pattern of rule.patterns) {
      const match = text.match(pattern);
      if (!match) continue;

      const rawValue =
        typeof rule.value === "function"
          ? rule.value(match, text)
          : rule.value;
      if (!rawValue) continue;

      facts.push({
        key: normalizeQuestionKey(rule.key) ?? rule.key,
        value: rawValue,
        confidence: 0.85,
        sourceText: match[0],
      });
      break;
    }
  }

  return facts;
}

function discoveryFactsToExtracted(
  facts: DiscoveryFact[],
  workAreaTypeKey: string
): ExtractedScopeFact[] {
  const prefix = resolveScopePrefix(workAreaTypeKey);
  return facts
    .filter((f) => {
      if (f.workAreaTypeKey && f.workAreaTypeKey !== workAreaTypeKey) {
        return false;
      }
      if (prefix && !f.key.startsWith(`${prefix}.`)) {
        return false;
      }
      return true;
    })
    .map((f) => ({
      key: normalizeQuestionKey(f.key) ?? f.key,
      value: String(f.value).replace(/\s*(m²|m2|sqm|m)\s*$/i, "").trim(),
      unit: f.unit,
      confidence: f.confidence ?? 0.75,
      sourceText: f.label,
    }));
}

function scopeContextSlice(
  text: string,
  workAreaTypeKey: string,
  matchedKeywords: string[]
): string {
  const lower = text.toLowerCase();
  const anchors = [
    ...matchedKeywords.map((k) => k.toLowerCase()),
    workAreaTypeKey.toLowerCase(),
    workAreaTypeKey.split(" ")[0]?.toLowerCase() ?? "",
  ].filter(Boolean);

  let bestIndex = -1;
  let bestAnchor = "";
  for (const anchor of anchors) {
    const idx = lower.indexOf(anchor);
    if (idx >= 0 && (bestIndex < 0 || idx < bestIndex)) {
      bestIndex = idx;
      bestAnchor = anchor;
    }
  }

  if (bestIndex < 0) return text;

  const start = Math.max(0, bestIndex - 40);
  let end = Math.min(text.length, bestIndex + bestAnchor.length + 80);

  const separators = [",", ";", " also ", " and ", " plus "];
  for (const sep of separators) {
    const sepIdx = lower.indexOf(sep, bestIndex + bestAnchor.length);
    if (sepIdx >= 0 && sepIdx < end) {
      end = sepIdx;
    }
  }

  const otherScopeMarkers = [
    "retaining wall",
    "bathroom",
    "kitchen renovation",
    "kitchen",
    "painting",
    "flooring",
    "deck",
    "fence",
    "retaining",
  ].filter(
    (marker) =>
      !anchors.some((anchor) => marker.includes(anchor) || anchor.includes(marker))
  );

  for (const marker of otherScopeMarkers) {
    const markerIdx = lower.indexOf(marker, bestIndex + bestAnchor.length);
    if (markerIdx >= 0 && markerIdx < end) {
      end = markerIdx;
    }
  }

  return text.slice(start, end);
}

function measurementFactsForScope(
  text: string,
  workAreaTypeKey: string,
  matchedKeywords: string[] = []
): ExtractedScopeFact[] {
  const prefix = resolveScopePrefix(workAreaTypeKey);
  if (!prefix) return [];

  const scopedText = scopeContextSlice(text, workAreaTypeKey, matchedKeywords);
  const measurements = resolveMeasurements(scopedText);
  const updates = measurementsToFactUpdates(prefix, measurements);

  let facts = updates.map((u) => ({
    key: `${prefix}.${u.factKeySuffix}`,
    value: u.value,
    unit: u.unit,
    confidence: 0.9,
    sourceText: u.reason,
  }));

  if (prefix === "fence") {
    const hasHeightContext = /\b(high|height|tall)\b/i.test(scopedText);
    if (!hasHeightContext) {
      facts = facts.filter((f) => !f.key.endsWith("height_m"));
    }
  }

  return facts;
}

function mergeFacts(
  existing: ExtractedScopeFact[],
  incoming: ExtractedScopeFact[]
): ExtractedScopeFact[] {
  const byKey = new Map<string, ExtractedScopeFact>();
  for (const fact of existing) {
    byKey.set(fact.key, fact);
  }
  for (const fact of incoming) {
    const current = byKey.get(fact.key);
    if (!current || fact.confidence >= current.confidence) {
      byKey.set(fact.key, fact);
    }
  }
  return [...byKey.values()];
}

function answersFromFacts(facts: ExtractedScopeFact[]): Record<string, string> {
  const answers: Record<string, string> = {};
  for (const fact of facts) {
    answers[fact.key] = fact.value;
  }
  return applyInferredFacts(answers);
}

function inferMissingLikely(
  workAreaTypeKey: string,
  facts: ExtractedScopeFact[]
): string[] {
  const template = getScopeTemplateByWorkAreaType(workAreaTypeKey);
  if (!template) return [];

  const knownKeys = new Set(facts.map((f) => f.key));
  const answers = answersFromFacts(facts);

  const missing: string[] = [];
  for (const factDef of getAllFactsForTemplate(template)) {
    if (!factDef.required) continue;
    const key = normalizeQuestionKey(factDef.key) ?? factDef.key;
    if (knownKeys.has(key)) continue;
    if (answers[key]) continue;
    missing.push(key);
  }

  return missing;
}

export function extractProjectScopeFactsDeterministic(
  userMessage: string
): ProjectScopeFactsResult {
  const text = userMessage.trim();
  const matchedAreas = matchWorkAreasFromTemplates(text);
  const templateFacts = extractFactsFromTemplates(text);
  const allDiscoveryFacts = [...templateFacts];

  const detectedQuality = extractQualityLevelFromNotes(text);

  const workAreas: ExtractedWorkArea[] = matchedAreas.map((area) => {
    let facts = mergeFacts(
      discoveryFactsToExtracted(allDiscoveryFacts, area.typeKey),
      parseDeterministicPatterns(scopeContextSlice(text, area.typeKey, area.matchedKeywords), area.typeKey)
    );
    facts = mergeFacts(facts, measurementFactsForScope(text, area.typeKey, area.matchedKeywords));

    const answers = answersFromFacts(facts);
    for (const [key, value] of Object.entries(answers)) {
      if (!facts.some((f) => f.key === key)) {
        facts.push({
          key,
          value,
          confidence: 0.8,
          sourceText: "inferred",
        });
      }
    }

    return {
      scopeTypeKey: area.typeKey,
      label: area.name,
      confidence: area.confidence,
      facts,
      assumptions: [],
      missingLikely: inferMissingLikely(area.typeKey, facts),
    };
  });

  return projectScopeFactsSchema.parse({
    workAreas,
    globalFacts: {
      qualityLevel: detectedQuality?.value,
      constraints: [],
      notes: text ? [text] : [],
    },
  });
}

export async function extractProjectScopeFacts(
  userMessage: string
): Promise<ProjectScopeFactsResult> {
  const deterministic = extractProjectScopeFactsDeterministic(userMessage);
  if (!userMessage.trim()) return deterministic;

  try {
    const { enrichProjectScopeFactsWithAi } = await import(
      "@/lib/assistant-v2/extraction/enrich-project-scope-facts-with-ai"
    );
    return enrichProjectScopeFactsWithAi(userMessage, deterministic);
  } catch {
    return deterministic;
  }
}

export function projectScopeFactsToDiscoveryFacts(
  result: ProjectScopeFactsResult
): DiscoveryFact[] {
  const facts: DiscoveryFact[] = [];

  for (const area of result.workAreas) {
    for (const fact of area.facts) {
      facts.push({
        key: fact.key,
        label: fact.key.split(".").pop() ?? fact.key,
        value: fact.unit && /^\d/.test(fact.value)
          ? `${fact.value} ${fact.unit}`
          : fact.value,
        unit: fact.unit,
        workAreaTypeKey: area.scopeTypeKey,
        source: "notes",
        confidence: fact.confidence,
      });
    }
  }

  return facts;
}
