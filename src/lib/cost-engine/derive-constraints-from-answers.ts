import type { QuickEstimateConstraintInput } from "@/lib/cost-engine/quick-estimate-input";
import { getAnswerValue } from "@/lib/question-keys";
import { getConstraintBySlug } from "@/lib/project-assistant-constraints";

/** When a scope question captures site conditions, apply the same pricing as the constraint toggle. */
const ANSWER_DERIVED_CONSTRAINTS: {
  questionKey: string;
  slug: string;
  applyWhen: (value: string) => boolean;
}[] = [
  {
    questionKey: "access_restrictions",
    slug: "tight-access",
    applyWhen: (v) => v === "yes",
  },
  {
    questionKey: "time_constraints",
    slug: "restricted-hours",
    applyWhen: (v) => v === "yes",
  },
  {
    questionKey: "rubbish_removal",
    slug: "rubbish-removal-required",
    applyWhen: (v) => v === "yes",
  },
  {
    questionKey: "retaining_wall.machine_access",
    slug: "retaining-machine-access",
    applyWhen: (v) => v === "no",
  },
  {
    questionKey: "deck.access_restricted",
    slug: "deck-restricted-access",
    applyWhen: (v) => v === "yes",
  },
];

export function deriveConstraintsFromAnswers(
  answers: Record<string, string>,
  savedConstraints: QuickEstimateConstraintInput[]
): QuickEstimateConstraintInput[] {
  const savedSlugs = new Set(savedConstraints.map((c) => c.slug));
  const merged = [...savedConstraints];

  for (const rule of ANSWER_DERIVED_CONSTRAINTS) {
    if (savedSlugs.has(rule.slug)) continue;

    const value = getAnswerValue(answers, rule.questionKey);
    if (!value || !rule.applyWhen(value)) continue;

    const def = getConstraintBySlug(rule.slug);
    if (!def) continue;

    merged.push({
      slug: rule.slug,
      label: def.label,
      severity: rule.slug === "rubbish-removal-required" ? "typical" : undefined,
    });
    savedSlugs.add(rule.slug);
  }

  return merged;
}
