import { RETAINING_WALL_MATERIAL_CATEGORIES } from "@/lib/scopes/material-categories";
import type { ScopeTemplate } from "@/lib/scopes/templates/types";

export const retainingWallScopeTemplate: ScopeTemplate = {
  scopeTypeKey: "retaining_wall",
  label: "Retaining Wall",
  workAreaTypeKey: "Retaining Wall",
  category: "external",
  aliases: [
    "retaining wall",
    "retaining",
    "wall",
    "landscape wall",
    "block wall",
    "timber retaining",
  ],

  quantity: {
    primaryUnit: "m²",
    requiredFields: ["retaining_wall.length_m", "retaining_wall.height_m"],
    derivedFields: [
      {
        key: "retaining_wall.wall_area_m2",
        label: "Wall face area",
        formula: "length_m × height_m",
        sourceFields: ["retaining_wall.length_m", "retaining_wall.height_m"],
      },
    ],
  },

  facts: {
    required: [
      { key: "retaining_wall.length_m", label: "Wall length", type: "number", unit: "m" },
      { key: "retaining_wall.height_m", label: "Wall height", type: "number", unit: "m" },
      {
        key: "retaining_wall.material",
        label: "Wall material",
        type: "select",
        questionText: RETAINING_WALL_MATERIAL_CATEGORIES.questionText,
        options: RETAINING_WALL_MATERIAL_CATEGORIES.categories.map(({ value, label }) => ({
          value,
          label,
        })),
        affectsEstimate: true,
        affectsConfidence: true,
      },
      { key: "retaining_wall.has_drainage", label: "Drainage required", type: "select" },
      { key: "retaining_wall.machine_access", label: "Machine access", type: "select" },
    ],
    useful: [
      { key: "retaining_wall.has_backfill", label: "Backfill required", type: "select" },
      { key: "retaining_wall.has_spoil_removal", label: "Spoil removal", type: "select" },
      { key: "retaining_wall.carting_distance_m", label: "Carting distance", type: "number", unit: "m" },
      { key: "retaining_wall.surcharge_loading", label: "Loading surcharge risk", type: "select" },
    ],
    optional: [],
  },

  pricing: {
    supported: true,
    pricingMode: "hybrid",
    defaultRateUnit: "m²",
    benchmarkRates: { budget: 550, standard: 850, premium: 1300 },
    defaultAllocations: {
      labour: 30,
      materials: 35,
      subcontractors: 20,
      allowances: 10,
      contingency: 5,
    },
    calculationType: "wall_area",
    components: [
      { key: "excavation", label: "Excavation", category: "labour", defaultIncluded: true },
      { key: "wall_materials", label: "Wall materials", category: "materials", defaultIncluded: true },
      {
        key: "drainage",
        label: "Drainage",
        category: "subcontractor",
        includeWhenFacts: ["retaining_wall.has_drainage"],
        defaultIncluded: true,
      },
      {
        key: "backfill",
        label: "Backfill",
        category: "allowance",
        includeWhenFacts: ["retaining_wall.has_backfill"],
        defaultIncluded: true,
      },
      {
        key: "spoil_removal",
        label: "Spoil removal",
        category: "allowance",
        includeWhenFacts: ["retaining_wall.has_spoil_removal"],
        defaultIncluded: false,
      },
      {
        key: "machine_labour",
        label: "Machine / labour",
        category: "labour",
        includeWhenFacts: ["retaining_wall.machine_access"],
        defaultIncluded: true,
      },
      {
        key: "engineering_allowance",
        label: "Engineering allowance",
        category: "allowance",
        defaultIncluded: false,
      },
    ],
  },

  constraints: {
    applicable: [
      {
        key: "machine_access_limited",
        label: "Machine access limited",
        slug: "retaining-machine-access",
        hideWhenFactAnswered: "retaining_wall.machine_access",
      },
      {
        key: "engineering_consent_risk",
        label: "Engineering / consent risk",
        slug: "retaining-engineering-risk",
      },
      {
        key: "difficult_spoil_removal",
        label: "Difficult spoil removal",
        slug: "retaining-difficult-spoil",
      },
    ],
  },

  assumptions: {
    default: [
      "Standard retaining wall construction assumed.",
      "Engineering may be required for walls over 1.5m.",
    ],
  },

  exclusions: {
    default: ["Engineering design unless noted", "Consent fees"],
  },

  followUps: {
    dependentQuestions: [],
  },

  materialCategories: RETAINING_WALL_MATERIAL_CATEGORIES,

  estimateBreakdown: {
    defaultLineGroups: [
      {
        key: "earthworks",
        label: "Earthworks",
        componentKeys: ["excavation", "spoil_removal", "machine_labour"],
      },
      {
        key: "wall",
        label: "Wall",
        componentKeys: ["wall_materials", "drainage", "backfill", "engineering_allowance"],
      },
    ],
  },
};
