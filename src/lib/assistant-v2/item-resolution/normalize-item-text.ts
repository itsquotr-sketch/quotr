/** Normalise free-text for allowance / item matching. */
export function normalizeItemText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s/]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Tokenise for overlap scoring. */
export function tokenizeItemText(text: string): string[] {
  const normalised = normalizeItemText(text);
  if (!normalised) return [];
  return normalised.split(" ").filter((token) => token.length > 1);
}

/**
 * Related allowance keys that often refer to the same commercial item.
 * When multiple exist, prefer the one already on the project.
 */
export const ALLOWANCE_SYNONYM_CLUSTERS: {
  keys: string[];
  terms: string[];
}[] = [
  {
    keys: ["rubbish_removal", "skip_bin"],
    terms: [
      "rubbish",
      "rubbish removal",
      "trash",
      "trash removal",
      "waste",
      "waste removal",
      "disposal",
      "skip",
      "bin",
      "skip bin",
      "skip hire",
    ],
  },
  {
    keys: ["spoil_removal"],
    terms: ["spoil", "spoil removal", "earth removal", "excavation waste"],
  },
  {
    keys: ["delivery_cartage"],
    terms: ["cartage", "carting", "delivery", "haulage"],
  },
  {
    keys: ["engineering_allowance"],
    terms: ["engineering", "engineer", "engineering fee", "consent"],
  },
  {
    keys: ["access_allowance"],
    terms: ["access", "site access", "access allowance"],
  },
  {
    keys: ["contingency"],
    terms: ["contingency", "buffer", "allowance buffer"],
  },
  {
    keys: ["after_hours_allowance"],
    terms: ["after hours", "after-hours", "restricted hours"],
  },
];

export function clusterKeysForText(text: string): string[] {
  const normalised = normalizeItemText(text);
  for (const cluster of ALLOWANCE_SYNONYM_CLUSTERS) {
    for (const term of cluster.terms) {
      if (normalised.includes(term)) {
        return cluster.keys;
      }
    }
  }
  return [];
}
