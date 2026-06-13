export type AllowanceKeyDefinition = {
  key: string;
  label: string;
  aliases: string[];
  /** Constraint slugs suppressed when user sets this allowance */
  suppressesConstraintSlugs?: string[];
};

export const ALLOWANCE_DEFINITIONS: AllowanceKeyDefinition[] = [
  {
    key: "rubbish_removal",
    label: "Rubbish removal",
    aliases: [
      "rubbish",
      "rubbish removal",
      "waste removal",
      "waste",
      "trash",
      "trash removal",
      "disposal",
      "rubbish removal allowance",
    ],
    suppressesConstraintSlugs: ["rubbish-removal-required"],
  },
  {
    key: "spoil_removal",
    label: "Spoil removal",
    aliases: ["spoil", "spoil removal", "spoil removal allowance", "cartage spoil"],
  },
  {
    key: "skip_bin",
    label: "Skip / bin",
    aliases: ["skip", "bin", "skip hire", "bin hire", "skip/bin", "skip bin"],
  },
  {
    key: "access_allowance",
    label: "Access allowance",
    aliases: ["access allowance"],
  },
  {
    key: "contingency",
    label: "Contingency",
    aliases: ["contingency", "contingency allowance"],
  },
  {
    key: "engineering_allowance",
    label: "Engineering allowance",
    aliases: ["engineering", "engineering allowance", "engineering fee"],
    suppressesConstraintSlugs: ["retaining-engineering-risk"],
  },
  {
    key: "delivery_cartage",
    label: "Delivery / cartage",
    aliases: ["delivery", "cartage", "delivery/cartage", "delivery cartage", "haulage"],
  },
  {
    key: "after_hours_allowance",
    label: "After-hours allowance",
    aliases: ["after hours", "after-hours", "after hours allowance"],
  },
];

export function resolveAllowanceKey(text: string): AllowanceKeyDefinition | null {
  const normalised = text.toLowerCase().trim();
  if (!normalised) return null;

  let best: AllowanceKeyDefinition | null = null;
  let bestLen = 0;

  for (const def of ALLOWANCE_DEFINITIONS) {
    for (const alias of def.aliases) {
      if (normalised.includes(alias) && alias.length > bestLen) {
        best = def;
        bestLen = alias.length;
      }
    }
  }

  return best;
}

export function labelForAllowanceKey(key: string): string {
  return (
    ALLOWANCE_DEFINITIONS.find((def) => def.key === key)?.label ??
    key.replace(/_/g, " ")
  );
}

export function constraintSlugsSuppressedByAllowanceKey(key: string): string[] {
  return (
    ALLOWANCE_DEFINITIONS.find((def) => def.key === key)
      ?.suppressesConstraintSlugs ?? []
  );
}
