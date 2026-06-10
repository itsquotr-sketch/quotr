import type { DiscoveryConstraint } from "@/lib/discovery/types";

type ConstraintRule = {
  slug: string;
  label: string;
  keywords: string[];
  workAreaTypeKey?: string;
};

/** Site and job constraints — separate from scope facts (measurements). */
const CONSTRAINT_RULES: ConstraintRule[] = [
  {
    slug: "tight-access",
    label: "Tight access",
    keywords: [
      "tight access",
      "tight side access",
      "restricted access",
      "narrow access",
      "limited access",
      "difficult access",
      "no driveway access",
    ],
  },
  {
    slug: "poor-parking",
    label: "Poor parking",
    keywords: [
      "poor parking",
      "no parking",
      "difficult parking",
      "street parking only",
      "limited parking",
    ],
  },
  {
    slug: "carting-distance",
    label: "Carting distance",
    keywords: [
      "carting distance",
      "long cart",
      "cart materials",
      "materials carted",
      "carry materials",
      "no vehicle access",
    ],
  },
  {
    slug: "occupied-house",
    label: "Occupied house",
    keywords: ["occupied", "living in", "tenants in", "family living"],
  },
  {
    slug: "restricted-hours",
    label: "Restricted working hours",
    keywords: [
      "restricted hours",
      "after hours only",
      "weekends only",
      "noise restrictions",
    ],
  },
  {
    slug: "urgent-turnaround",
    label: "Urgent turnaround",
    keywords: ["urgent", "asap", "tight deadline", "rush job", "quick turnaround"],
  },
  {
    slug: "rubbish-removal-required",
    label: "Rubbish removal required",
    keywords: ["rubbish removal", "skip bin", "waste removal", "demolition waste"],
  },
  {
    slug: "deck-restricted-access",
    label: "Restricted side access",
    keywords: ["side access", "no rear access"],
    workAreaTypeKey: "Deck",
  },
  {
    slug: "retaining-machine-access",
    label: "Machine access limited",
    keywords: ["no digger", "no excavator", "hand dig", "machine access limited"],
    workAreaTypeKey: "Retaining Wall",
  },
];

function normaliseText(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

export function extractConstraintsFromNotes(
  sourceNotes: string
): DiscoveryConstraint[] {
  const normalised = normaliseText(sourceNotes);
  if (!normalised) return [];

  const constraints: DiscoveryConstraint[] = [];
  const seen = new Set<string>();

  for (const rule of CONSTRAINT_RULES) {
    const matched = rule.keywords.some((kw) => normalised.includes(kw));
    if (!matched || seen.has(rule.slug)) continue;

    seen.add(rule.slug);
    constraints.push({
      slug: rule.slug,
      label: rule.label,
      workAreaTypeKey: rule.workAreaTypeKey,
      source: "notes",
      confidence: 0.7,
    });
  }

  return constraints;
}
