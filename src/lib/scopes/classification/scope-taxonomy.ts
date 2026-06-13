export type TaxonomyEntry = {
  key: string;
  label: string;
  aliases: string[];
  /** Work packages typically included in this work area — not separate scopes */
  includedPackages?: string[];
  /** Suggested child packages for broad categories */
  suggestedChildren?: string[];
};

/** Proper estimateable project scopes */
export const WORK_AREA_TAXONOMY: TaxonomyEntry[] = [
  {
    key: "bathroom_renovation",
    label: "Bathroom renovation",
    aliases: [
      "bathroom renovation",
      "bathroom remodel",
      "bathroom",
      "ensuite",
      "wet room",
    ],
    includedPackages: [
      "demolition",
      "waterproofing",
      "tiling",
      "plumbing",
      "electrical",
      "flooring",
      "painting",
    ],
  },
  {
    key: "deck",
    label: "Deck",
    aliases: ["deck", "decking", "balustrade", "timber deck"],
    includedPackages: ["demolition", "excavation"],
  },
  {
    key: "retaining_wall",
    label: "Retaining wall",
    aliases: ["retaining wall", "retaining", "block wall", "retaining walls"],
    includedPackages: ["excavation", "drainage"],
  },
  {
    key: "kitchen_renovation",
    label: "Kitchen renovation",
    aliases: ["kitchen renovation", "kitchen remodel", "kitchen"],
    includedPackages: [
      "demolition",
      "joinery",
      "plumbing",
      "electrical",
      "flooring",
      "painting",
    ],
  },
  {
    key: "fence",
    label: "Fence",
    aliases: ["fence", "fencing", "gate"],
  },
  {
    key: "flooring_project",
    label: "Flooring",
    aliases: ["flooring project", "floor replacement", "new floors"],
  },
  {
    key: "painting_project",
    label: "Painting",
    aliases: ["painting project", "repaint", "full repaint"],
  },
  {
    key: "small_fitout",
    label: "Small fitout",
    aliases: ["fitout", "fit out", "office fitout"],
  },
];

/** Trade/task packages under a work area or broad category */
export const WORK_PACKAGE_TAXONOMY: TaxonomyEntry[] = [
  {
    key: "demolition",
    label: "Demolition",
    aliases: [
      "demolition",
      "demolish",
      "strip out",
      "remove wall",
      "wall removal",
      "non-load-bearing wall",
      "load bearing wall",
    ],
  },
  {
    key: "partitions",
    label: "Partitions",
    aliases: [
      "partition",
      "partitions",
      "new wall",
      "new walls",
      "framing",
      "gib",
      "wall framing",
    ],
  },
  {
    key: "ceiling_works",
    label: "Ceiling works",
    aliases: ["ceiling", "ceilings", "ceiling works", "gib ceiling"],
  },
  {
    key: "flooring",
    label: "Flooring",
    aliases: [
      "flooring",
      "carpet",
      "vinyl",
      "laminate",
      "timber floor",
      "floor tiles",
      "hallway floor",
    ],
  },
  {
    key: "painting",
    label: "Painting",
    aliases: ["painting", "paint", "repaint", "repainting", "repaint hallway"],
  },
  {
    key: "electrical",
    label: "Electrical",
    aliases: ["electrical", "electrician", "wiring", "power points"],
  },
  {
    key: "plumbing",
    label: "Plumbing",
    aliases: ["plumbing", "plumber", "pipework", "hot water"],
  },
  {
    key: "waterproofing",
    label: "Waterproofing",
    aliases: ["waterproofing", "waterproof", "membrane"],
  },
  {
    key: "tiling",
    label: "Tiling",
    aliases: ["tiling", "tiles", "tile floor", "tile walls", "tiler"],
  },
  {
    key: "joinery",
    label: "Joinery",
    aliases: ["joinery", "cabinetry", "cabinets", "vanity"],
  },
  {
    key: "rubbish_removal",
    label: "Rubbish removal",
    aliases: ["rubbish removal", "skip bin", "waste removal", "cartage"],
  },
  {
    key: "excavation",
    label: "Excavation",
    aliases: ["excavation", "dig out", "earthworks"],
  },
  {
    key: "drainage",
    label: "Drainage",
    aliases: ["drainage", "drain", "stormwater", "ag pipe"],
  },
  {
    key: "landscaping",
    label: "Landscaping",
    aliases: ["landscaping", "planting", "lawn", "garden works"],
  },
];

/** Too broad to price directly */
export const BROAD_CATEGORY_TAXONOMY: TaxonomyEntry[] = [
  {
    key: "internal_alteration",
    label: "Internal alteration",
    aliases: [
      "internal alteration",
      "internal alter",
      "internal changes",
      "layout changes",
    ],
    suggestedChildren: [
      "demolition",
      "partitions",
      "ceiling_works",
      "flooring",
      "painting",
      "electrical",
      "plumbing",
      "joinery",
      "rubbish_removal",
    ],
  },
  {
    key: "internal_works",
    label: "Internal works",
    aliases: ["internal works", "internal work", "inside works"],
    suggestedChildren: [
      "demolition",
      "partitions",
      "ceiling_works",
      "flooring",
      "painting",
      "electrical",
      "plumbing",
    ],
  },
  {
    key: "renovation_works",
    label: "Renovation works",
    aliases: ["renovation works", "general renovation", "house renovation"],
  },
  {
    key: "general_building",
    label: "General building works",
    aliases: [
      "general building",
      "general building works",
      "building works",
      "general works",
    ],
  },
  {
    key: "fitout_works",
    label: "Fitout works",
    aliases: ["fitout works", "commercial fitout"],
  },
  {
    key: "external_works",
    label: "External works",
    aliases: ["external works", "outside works", "exterior works"],
  },
];

/** Maps canonical work area keys to runtime typeKey strings used elsewhere */
export const WORK_AREA_TYPE_KEY_MAP: Record<string, string> = {
  bathroom_renovation: "Bathroom renovation",
  deck: "Deck",
  retaining_wall: "Retaining Wall",
  kitchen_renovation: "Kitchen renovation",
  fence: "Fence",
  flooring_project: "Flooring",
  painting_project: "Painting",
  small_fitout: "Small fitout",
};

export const BROAD_CATEGORY_DISPLAY_LABELS: Record<string, string> = {
  internal_alteration: "Additional internal works",
  internal_works: "Additional internal works",
  renovation_works: "Renovation works",
  general_building: "General building works",
  fitout_works: "Fitout works",
  external_works: "External works",
};

export function normaliseScopeLabel(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function matchTaxonomyEntry(
  label: string,
  entries: TaxonomyEntry[]
): { entry: TaxonomyEntry; score: number; matchedAlias: string } | null {
  const normalised = normaliseScopeLabel(label);
  let best: { entry: TaxonomyEntry; score: number; matchedAlias: string } | null =
    null;

  for (const entry of entries) {
    for (const alias of entry.aliases) {
      const aliasNorm = normaliseScopeLabel(alias);
      if (normalised === aliasNorm) {
        const score = 1;
        if (!best || score > best.score) {
          best = { entry, score, matchedAlias: alias };
        }
      } else if (
        normalised.includes(aliasNorm) &&
        aliasNorm.length >= 4
      ) {
        const score = aliasNorm.length / normalised.length;
        if (!best || score > best.score) {
          best = { entry, score, matchedAlias: alias };
        }
      }
    }
  }

  return best;
}

export function findWorkAreaEntry(label: string): TaxonomyEntry | null {
  return matchTaxonomyEntry(label, WORK_AREA_TAXONOMY)?.entry ?? null;
}

export function findWorkPackageEntry(label: string): TaxonomyEntry | null {
  return matchTaxonomyEntry(label, WORK_PACKAGE_TAXONOMY)?.entry ?? null;
}

export function findBroadCategoryEntry(label: string): TaxonomyEntry | null {
  return matchTaxonomyEntry(label, BROAD_CATEGORY_TAXONOMY)?.entry ?? null;
}

export function resolveWorkAreaTypeKeyFromCanonical(
  canonicalKey: string
): string {
  return WORK_AREA_TYPE_KEY_MAP[canonicalKey] ?? canonicalKey;
}
