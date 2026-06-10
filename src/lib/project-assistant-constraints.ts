import {
  getTemplateConstraintsForWorkAreas,
  getAllScopeTemplates,
} from "@/lib/scope-templates";
import { UNIVERSAL_TEMPLATE_CONSTRAINTS } from "@/lib/scope-templates/shared";
import type { ScopeTemplateConstraint } from "@/lib/scope-templates/types";

export type ConstraintFollowUp = {
  label: string;
  unit: string;
  valueKey: string;
  inputType: "number" | "text" | "select";
  options?: { value: string; label: string }[];
};

export type AssistantConstraint = {
  slug: string;
  label: string;
  /** estimate_drivers.slug when linked to system driver */
  driverSlug?: string;
  /** Question key — hide constraint if this question is already answered */
  hideWhenQuestionAnswered?: string;
  workAreaTypes?: string[];
  universal?: boolean;
  followUp?: ConstraintFollowUp;
};

function templateConstraintToAssistant(
  constraint: ScopeTemplateConstraint,
  workAreaTypes?: string[]
): AssistantConstraint {
  return {
    slug: constraint.slug,
    label: constraint.label,
    driverSlug: constraint.driverSlug,
    hideWhenQuestionAnswered: constraint.hideWhenQuestionAnswered,
    workAreaTypes,
    universal: constraint.universal,
    followUp: constraint.followUp,
  };
}

/** Extra universal constraints not yet in scope templates. */
const EXTRA_UNIVERSAL_CONSTRAINTS: AssistantConstraint[] = [
  {
    slug: "rubbish-removal-required",
    label: "Rubbish removal required",
    universal: true,
    followUp: {
      label: "Rubbish removal level",
      unit: "",
      valueKey: "severity",
      inputType: "select",
      options: [
        { value: "low", label: "Low" },
        { value: "typical", label: "Typical" },
        { value: "high", label: "High" },
      ],
    },
  },
];

const NON_TEMPLATE_CONSTRAINTS: AssistantConstraint[] = [
  {
    slug: "internal-structural",
    label: "Structural work likely",
    workAreaTypes: ["Internal Alteration"],
  },
];

const LEGACY_CONSTRAINT_SLUGS: Record<string, AssistantConstraint> = {
  "retaining-carting-distance": {
    slug: "retaining-carting-distance",
    label: "Carting distance",
    driverSlug: "20m-carting",
    workAreaTypes: ["Retaining Wall"],
    followUp: {
      label: "Approximate carting distance?",
      unit: "metres",
      valueKey: "metres",
      inputType: "number",
    },
  },
};

const CONSTRAINT_SLUGS_HIDDEN_WHEN_ANSWERED: Record<string, string> = {
  "retaining-carting-distance": "retaining_wall.carting_distance_m",
};

function buildAllConstraintCatalog(): AssistantConstraint[] {
  const catalog: AssistantConstraint[] = [
    ...UNIVERSAL_TEMPLATE_CONSTRAINTS.map((c) =>
      templateConstraintToAssistant(c)
    ),
    ...EXTRA_UNIVERSAL_CONSTRAINTS,
    ...NON_TEMPLATE_CONSTRAINTS,
    ...Object.values(LEGACY_CONSTRAINT_SLUGS),
  ];

  for (const template of getAllScopeTemplates()) {
    for (const constraint of template.constraints) {
      catalog.push(
        templateConstraintToAssistant(constraint, [template.workAreaTypeKey])
      );
    }
  }

  return catalog;
}

const ALL_CONSTRAINTS = buildAllConstraintCatalog();

/** Look up constraint metadata by slug (includes legacy/hidden slugs). */
export function getConstraintBySlug(
  slug: string
): AssistantConstraint | undefined {
  return ALL_CONSTRAINTS.find((c) => c.slug === slug);
}

export function getRelevantConstraints(
  workAreaTypeKeys: string[],
  answeredQuestionKeys: Set<string> = new Set()
): AssistantConstraint[] {
  const templateConstraints = getTemplateConstraintsForWorkAreas(
    workAreaTypeKeys
  );
  const types = new Set(workAreaTypeKeys);
  const specific = NON_TEMPLATE_CONSTRAINTS.filter((c) =>
    c.workAreaTypes?.some((t) => types.has(t))
  );
  const seen = new Set<string>();

  return [
    ...templateConstraints,
    ...EXTRA_UNIVERSAL_CONSTRAINTS,
    ...specific,
  ].filter((c) => {
    if (seen.has(c.slug)) return false;
    seen.add(c.slug);

    const hideKey =
      c.hideWhenQuestionAnswered ??
      CONSTRAINT_SLUGS_HIDDEN_WHEN_ANSWERED[c.slug];
    if (hideKey && answeredQuestionKeys.has(hideKey)) {
      return false;
    }

    return true;
  });
}

/** Map work area type key to calculation slug */
export const WORK_AREA_TO_CALC_SLUG: Record<string, string> = {
  "Bathroom renovation": "bathroom-renovation",
  "Kitchen renovation": "kitchen-renovation",
  Deck: "deck",
  Fence: "fencing",
  Painting: "painting",
  "Internal Alteration": "internal-alteration",
  "Retaining Wall": "retaining-wall",
  Flooring: "other",
  "Custom Scope": "other",
  "General Building Works": "other",
};
