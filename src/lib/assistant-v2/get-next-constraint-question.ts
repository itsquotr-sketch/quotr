import {
  getConstraintBySlug,
  getRelevantConstraints,
} from "@/lib/project-assistant-constraints";
import { normalizeQuestionKey } from "@/lib/question-keys";

export type ConstraintQuestion = {
  slug: string;
  label: string;
  prompt: string;
  workAreaTypeKey?: string;
  options: { value: string; label: string }[];
};

const CONSTRAINT_PROMPTS: Record<string, string> = {
  "tight-access": "Is access tight or restricted?",
  "poor-parking": "Is parking difficult on site?",
  "occupied-house": "Will the home be occupied during works?",
  "restricted-hours": "Are working hours restricted?",
  "rubbish-removal-required": "Is rubbish or spoil removal required?",
  "deck-restricted-access": "Is side or rear access restricted?",
  "deck-ground-conditions": "Are ground conditions difficult?",
  "retaining-machine-access": "Is machine access available?",
  "retaining-drainage": "Is drainage required behind the wall?",
  "retaining-spoil-removal": "Is spoil removal required?",
  "retaining-carting-distance": "What is the carting distance?",
  "bathroom-occupied": "Will the house be occupied during the bathroom works?",
  "bathroom-access-restricted": "Are there access restrictions?",
  "bathroom-asbestos-risk": "Is there any asbestos risk?",
};

const CONSTRAINT_PRIORITY: string[] = [
  "tight-access",
  "poor-parking",
  "occupied-house",
  "restricted-hours",
  "rubbish-removal-required",
  "deck-restricted-access",
  "deck-ground-conditions",
  "retaining-machine-access",
  "retaining-drainage",
  "retaining-spoil-removal",
  "retaining-carting-distance",
  "bathroom-access-restricted",
  "bathroom-occupied",
  "bathroom-asbestos-risk",
];

const YES_NO_OPTIONS = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
];

function isConstraintKnown(
  slug: string,
  selectedSlugs: Set<string>,
  discoverySlugs: Set<string>,
  declinedSlugs: Set<string>
): boolean {
  return (
    selectedSlugs.has(slug) ||
    discoverySlugs.has(slug) ||
    declinedSlugs.has(slug)
  );
}

function promptForConstraint(slug: string, label: string): string {
  return CONSTRAINT_PROMPTS[slug] ?? label;
}

const MAX_CONSTRAINT_BATCH = 5;

function collectPendingConstraints(input: {
  workAreaTypeKeys: string[];
  selectedConstraintSlugs: string[];
  discoveryConstraintSlugs: string[];
  answeredQuestionKeys: Set<string>;
  declinedConstraintSlugs: Set<string>;
}): ConstraintQuestion[] {
  const selected = new Set(input.selectedConstraintSlugs);
  const discovery = new Set(input.discoveryConstraintSlugs);
  const declined = input.declinedConstraintSlugs;

  const relevant = getRelevantConstraints(
    input.workAreaTypeKeys,
    input.answeredQuestionKeys
  );
  const relevantBySlug = new Map(relevant.map((c) => [c.slug, c]));

  const candidates = [
    ...CONSTRAINT_PRIORITY.filter((slug) => relevantBySlug.has(slug)),
    ...relevant
      .map((c) => c.slug)
      .filter((slug) => !CONSTRAINT_PRIORITY.includes(slug)),
  ];

  const pending: ConstraintQuestion[] = [];
  const seen = new Set<string>();

  for (const slug of candidates) {
    if (seen.has(slug)) continue;
    seen.add(slug);

    if (isConstraintKnown(slug, selected, discovery, declined)) continue;

    const def = getConstraintBySlug(slug) ?? relevantBySlug.get(slug);
    if (!def) continue;

    const hideKey =
      def.hideWhenQuestionAnswered ??
      (slug === "tight-access" ? "access_restrictions" : undefined);
    if (hideKey) {
      const normalized = normalizeQuestionKey(hideKey) ?? hideKey;
      if (
        input.answeredQuestionKeys.has(hideKey) ||
        input.answeredQuestionKeys.has(normalized)
      ) {
        continue;
      }
    }

    pending.push({
      slug,
      label: def.label,
      prompt: promptForConstraint(slug, def.label),
      workAreaTypeKey: def.workAreaTypes?.[0],
      options: YES_NO_OPTIONS,
    });

    if (pending.length >= MAX_CONSTRAINT_BATCH) break;
  }

  return pending;
}

export function getPendingConstraints(input: {
  workAreaTypeKeys: string[];
  selectedConstraintSlugs: string[];
  discoveryConstraintSlugs: string[];
  answeredQuestionKeys: Set<string>;
  declinedConstraintSlugs: Set<string>;
}): ConstraintQuestion[] {
  return collectPendingConstraints(input);
}

export function getNextConstraintQuestion(input: {
  workAreaTypeKeys: string[];
  selectedConstraintSlugs: string[];
  discoveryConstraintSlugs: string[];
  answeredQuestionKeys: Set<string>;
  declinedConstraintSlugs: Set<string>;
}): ConstraintQuestion | null {
  const pending = collectPendingConstraints(input);
  return pending[0] ?? null;
}
