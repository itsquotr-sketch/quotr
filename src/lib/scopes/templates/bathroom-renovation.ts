import { BATHROOM_MATERIAL_CATEGORIES } from "@/lib/scopes/material-categories";
import type { ScopeTemplate } from "@/lib/scopes/templates/types";

export const bathroomRenovationScopeTemplate: ScopeTemplate = {
  scopeTypeKey: "bathroom_renovation",
  label: "Bathroom renovation",
  workAreaTypeKey: "Bathroom renovation",
  category: "renovation",
  aliases: [
    "bathroom",
    "ensuite",
    "bathroom renovation",
    "bathroom reno",
    "wet room",
  ],

  quantity: {
    primaryUnit: "m²",
    requiredFields: ["bathroom.floor_area_m2"],
  },

  facts: {
    required: [
      { key: "bathroom.floor_area_m2", label: "Floor area", type: "number", unit: "m²" },
      {
        key: "bathroom.finish_level",
        label: "Finish level",
        type: "select",
        questionText: BATHROOM_MATERIAL_CATEGORIES.questionText,
        options: BATHROOM_MATERIAL_CATEGORIES.categories.map(({ value, label }) => ({
          value,
          label,
        })),
        affectsEstimate: true,
        affectsConfidence: true,
      },
      { key: "bathroom.layout_changing", label: "Layout changing", type: "select" },
      { key: "bathroom.tile_extent", label: "Tile extent", type: "select" },
    ],
    useful: [
      { key: "bathroom.waterproofing_included", label: "Waterproofing", type: "select" },
      { key: "bathroom.fixtures_client_supplied", label: "Fixtures client supplied", type: "select" },
      { key: "bathroom.demolition_included", label: "Demolition", type: "select" },
      { key: "bathroom.plumbing_relocation", label: "Plumbing relocation", type: "select" },
      { key: "bathroom.electrical_allowance", label: "Electrical work", type: "select" },
      { key: "bathroom.rubbish_removal", label: "Rubbish removal", type: "select" },
      { key: "bathroom.tiles_supplied_by", label: "Tiles supplied by", type: "select" },
    ],
    optional: [
      { key: "bathroom.occupied_home", label: "Occupied home", type: "select" },
    ],
  },

  pricing: {
    supported: true,
    pricingMode: "hybrid",
    defaultRateUnit: "m²",
    benchmarkRates: { budget: 3500, standard: 5000, premium: 7500 },
    defaultAllocations: {
      labour: 25,
      materials: 30,
      subcontractors: 35,
      allowances: 5,
      contingency: 5,
    },
    calculationType: "floor_area",
    layoutChangeModifier: 1.2,
    components: [
      {
        key: "demolition",
        label: "Demolition",
        category: "allowance",
        includeWhenFacts: ["bathroom.demolition_included"],
        defaultIncluded: true,
      },
      {
        key: "waterproofing",
        label: "Waterproofing",
        category: "subcontractor",
        includeWhenFacts: ["bathroom.waterproofing_included"],
        defaultIncluded: true,
      },
      { key: "tiling", label: "Tiling", category: "subcontractor", defaultIncluded: true },
      {
        key: "plumbing",
        label: "Plumbing",
        category: "subcontractor",
        includeWhenFacts: ["bathroom.plumbing_relocation"],
        defaultIncluded: true,
      },
      {
        key: "electrical",
        label: "Electrical",
        category: "subcontractor",
        includeWhenFacts: ["bathroom.electrical_allowance"],
        defaultIncluded: true,
      },
      {
        key: "fixtures",
        label: "Fixtures",
        category: "materials",
        excludeWhenFacts: ["bathroom.fixtures_client_supplied"],
        defaultIncluded: true,
      },
      { key: "painting_stopping", label: "Painting / stopping", category: "labour", defaultIncluded: true },
      {
        key: "rubbish_removal",
        label: "Rubbish removal",
        category: "allowance",
        includeWhenFacts: ["bathroom.rubbish_removal"],
        defaultIncluded: false,
      },
    ],
  },

  constraints: {
    applicable: [
      { key: "live_house", label: "Occupied home", slug: "bathroom-live-house" },
      { key: "apartment_access", label: "Apartment access", slug: "bathroom-apartment-access" },
      { key: "asbestos_risk", label: "Asbestos risk", slug: "bathroom-asbestos-risk" },
      { key: "limited_working_hours", label: "Limited working hours", slug: "bathroom-limited-hours" },
    ],
  },

  assumptions: {
    default: [
      "Standard bathroom renovation sequence assumed.",
      "Existing services locations to be confirmed on site.",
    ],
  },

  exclusions: {
    default: ["Tile supply when client-supplied", "Fixtures when client-supplied"],
  },

  followUps: {
    dependentQuestions: [
      {
        whenFactKey: "bathroom.layout_changing",
        whenValue: "yes",
        askFactKey: "bathroom.plumbing_relocation",
        questionText: "Is plumbing being relocated?",
      },
    ],
  },

  materialCategories: BATHROOM_MATERIAL_CATEGORIES,

  estimateBreakdown: {
    defaultLineGroups: [
      {
        key: "prep",
        label: "Preparation",
        componentKeys: ["demolition", "rubbish_removal"],
      },
      {
        key: "wet_areas",
        label: "Wet areas",
        componentKeys: ["waterproofing", "tiling"],
      },
      {
        key: "services",
        label: "Services",
        componentKeys: ["plumbing", "electrical", "fixtures", "painting_stopping"],
      },
    ],
  },
};
