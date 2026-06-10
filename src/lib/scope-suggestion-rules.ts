import {
  getAllScopeTemplates,
  matchTemplatesFromNotes,
} from "@/lib/scope-templates";

export type GeneratedScopeSuggestion = {
  suggestedScopeType: string;
  suggestedName: string;
  suggestedDescription: string;
  suggestedLocationArea: string | null;
  confidence: number;
  matchedKeywords: string[];
};

type ScopeSuggestionRule = {
  suggestedScopeType: string;
  suggestedName: string;
  keywords: string[];
  locationArea: string | null;
};

/** Work scopes only — trade packages (electrical, plumbing, tiling) are excluded. */
export const WORK_SCOPE_SUGGESTION_RULES: ScopeSuggestionRule[] = [
  {
    suggestedScopeType: "Bathroom renovation",
    suggestedName: "Bathroom renovation",
    keywords: [
      "bathroom",
      "shower",
      "vanity",
      "toilet",
      "waterproofing",
    ],
    locationArea: "Bathroom",
  },
  {
    suggestedScopeType: "Kitchen renovation",
    suggestedName: "Kitchen renovation",
    keywords: ["kitchen", "cabinetry", "benchtop", "splashback"],
    locationArea: "Kitchen",
  },
  {
    suggestedScopeType: "Deck",
    suggestedName: "Deck",
    keywords: ["deck", "decking", "balustrade"],
    locationArea: "Outdoor",
  },
  {
    suggestedScopeType: "Fence",
    suggestedName: "Fence",
    keywords: ["fence", "fencing", "gate"],
    locationArea: "Outdoor",
  },
  {
    suggestedScopeType: "Laundry renovation",
    suggestedName: "Laundry renovation",
    keywords: ["laundry"],
    locationArea: "Laundry",
  },
  {
    suggestedScopeType: "Painting",
    suggestedName: "Painting",
    keywords: ["painting", "paint"],
    locationArea: null,
  },
  {
    suggestedScopeType: "Flooring",
    suggestedName: "Flooring",
    keywords: ["flooring", "carpet", "vinyl", "laminate", "timber floor"],
    locationArea: null,
  },
  {
    suggestedScopeType: "Internal Alteration",
    suggestedName: "Internal alteration",
    keywords: ["wall", "framing", "gib", "internal alteration", "doorway"],
    locationArea: null,
  },
  {
    suggestedScopeType: "Retaining Wall",
    suggestedName: "Retaining wall",
    keywords: ["retaining wall", "retaining", "block wall"],
    locationArea: "Outdoor",
  },
  {
    suggestedScopeType: "General Building Works",
    suggestedName: "General building works",
    keywords: ["renovation", "renovate", "alteration", "build", "building"],
    locationArea: null,
  },
];

export const CUSTOM_SCOPE_FALLBACK: GeneratedScopeSuggestion = {
  suggestedScopeType: "Custom Scope",
  suggestedName: "Custom scope",
  suggestedDescription:
    "No specific scope stood out from your notes. Review and rename this scope to match the job.",
  suggestedLocationArea: null,
  confidence: 0.35,
  matchedKeywords: [],
};

export const SCOPE_TYPE_NAME_LOOKUP: Record<string, string> = {
  "Bathroom renovation": "Bathroom renovation",
  "Kitchen renovation": "Kitchen renovation",
  Deck: "Deck",
  Fence: "Fencing",
  "Laundry renovation": "Other",
  Painting: "Painting",
  Flooring: "Other",
  "Internal Alteration": "Internal alteration",
  "Retaining Wall": "Other",
  "General Building Works": "Other",
  "Custom Scope": "Other",
};

function normaliseText(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function findMatchedKeywords(content: string, keywords: string[]): string[] {
  const normalised = normaliseText(content);
  return keywords.filter((keyword) => normalised.includes(keyword));
}

export function computeSuggestionConfidence(
  matchCount: number,
  keywordCount: number
): number {
  if (matchCount === 0 || keywordCount === 0) {
    return 0.35;
  }

  const ratio = matchCount / keywordCount;
  const confidence = 0.45 + ratio * 0.5;
  return Math.min(0.95, Math.round(confidence * 100) / 100);
}

export function deriveConfidenceLevel(
  confidence: number
): "high" | "medium" | "low" {
  if (confidence >= 0.75) {
    return "high";
  }
  if (confidence >= 0.45) {
    return "medium";
  }
  return "low";
}

function buildDescription(
  suggestedScopeType: string,
  matchedKeywords: string[]
): string {
  const keywordList = matchedKeywords.join(", ");
  return `Suggested from your project notes based on mentions of: ${keywordList}. Review this ${suggestedScopeType.toLowerCase()} scope before accepting.`;
}

const TEMPLATE_WORK_AREA_TYPES = new Set(
  getAllScopeTemplates().map((t) => t.workAreaTypeKey)
);

export function generateScopeSuggestionsFromNotes(
  content: string
): GeneratedScopeSuggestion[] {
  const trimmed = content.trim();
  if (!trimmed) {
    return [];
  }

  const suggestions: GeneratedScopeSuggestion[] = [];
  const coveredTypes = new Set<string>();

  for (const match of matchTemplatesFromNotes(trimmed)) {
    coveredTypes.add(match.template.workAreaTypeKey);
    suggestions.push({
      suggestedScopeType: match.template.workAreaTypeKey,
      suggestedName: match.suggestedName,
      suggestedDescription: buildDescription(
        match.template.name,
        match.matchedKeywords
      ),
      suggestedLocationArea: match.locationArea,
      confidence: match.confidence,
      matchedKeywords: match.matchedKeywords,
    });
  }

  for (const rule of WORK_SCOPE_SUGGESTION_RULES) {
    if (TEMPLATE_WORK_AREA_TYPES.has(rule.suggestedScopeType)) continue;
    if (coveredTypes.has(rule.suggestedScopeType)) continue;

    const matchedKeywords = findMatchedKeywords(trimmed, rule.keywords);
    if (matchedKeywords.length === 0) {
      continue;
    }

    suggestions.push({
      suggestedScopeType: rule.suggestedScopeType,
      suggestedName: rule.suggestedName,
      suggestedDescription: buildDescription(
        rule.suggestedScopeType,
        matchedKeywords
      ),
      suggestedLocationArea: rule.locationArea,
      confidence: computeSuggestionConfidence(
        matchedKeywords.length,
        rule.keywords.length
      ),
      matchedKeywords,
    });
  }

  if (suggestions.length === 0) {
    return [CUSTOM_SCOPE_FALLBACK];
  }

  const hasSpecificScope = suggestions.some(
    (item) => item.suggestedScopeType !== "General Building Works"
  );
  const filtered = hasSpecificScope
    ? suggestions.filter(
        (item) => item.suggestedScopeType !== "General Building Works"
      )
    : suggestions;

  return filtered.sort((a, b) => b.confidence - a.confidence);
}
