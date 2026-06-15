import { DECK_MATERIAL_CATEGORIES } from "@/lib/scopes/material-categories";
import type { ScopeTemplate } from "@/lib/scopes/templates/types";

export const deckScopeTemplate: ScopeTemplate = {
  scopeTypeKey: "deck",
  label: "Deck",
  workAreaTypeKey: "Deck",
  category: "external",
  aliases: [
    "deck",
    "decking",
    "timber deck",
    "composite deck",
    "balcony deck",
  ],

  quantity: {
    primaryUnit: "m²",
    requiredFields: ["deck.area_m2"],
    derivedFields: [
      {
        key: "deck.area_m2",
        label: "Deck area",
        formula: "length_m × width_m",
        sourceFields: ["deck.length_m", "deck.width_m"],
      },
    ],
  },

  facts: {
    required: [
      { key: "deck.area_m2", label: "Deck area", type: "number", unit: "m²" },
      {
        key: "deck.material_type",
        label: "Deck material",
        type: "select",
        questionText: DECK_MATERIAL_CATEGORIES.questionText,
        options: DECK_MATERIAL_CATEGORIES.categories.map(({ value, label }) => ({
          value,
          label,
        })),
        affectsEstimate: true,
        affectsConfidence: true,
      },
      { key: "deck.level_type", label: "Deck level", type: "select" },
      { key: "deck.finish_level", label: "Finish level", type: "select" },
    ],
    useful: [
      { key: "deck.height_m", label: "Deck height", type: "number", unit: "m" },
      { key: "deck.has_stairs", label: "Stairs", type: "select" },
      { key: "deck.has_balustrade", label: "Balustrade", type: "select" },
      { key: "deck.has_pergola", label: "Pergola", type: "select" },
      { key: "deck.has_existing_deck", label: "Existing deck demo", type: "select" },
      { key: "deck.material_supply", label: "Material supply", type: "select" },
      { key: "deck.tight_access", label: "Site access", type: "select" },
    ],
    optional: [
      { key: "deck.length_m", label: "Deck length", type: "number", unit: "m" },
      { key: "deck.width_m", label: "Deck width", type: "number", unit: "m" },
      { key: "deck.balustrade_supply", label: "Balustrade supply", type: "select" },
      { key: "deck.rubbish_removal", label: "Rubbish removal", type: "select" },
    ],
  },

  pricing: {
    supported: true,
    pricingMode: "hybrid",
    defaultRateUnit: "m²",
    benchmarkRates: { budget: 450, standard: 650, premium: 900 },
    defaultAllocations: {
      labour: 45,
      materials: 40,
      subcontractors: 5,
      allowances: 5,
      contingency: 5,
    },
    calculationType: "deck_area",
    elevatedModifier: 1.15,
    components: [
      { key: "substructure", label: "Substructure / framing", category: "labour", defaultIncluded: true },
      { key: "decking_boards", label: "Decking boards", category: "materials", defaultIncluded: true },
      { key: "fixings", label: "Fixings", category: "materials", defaultIncluded: true },
      {
        key: "stairs",
        label: "Stairs",
        category: "allowance",
        includeWhenFacts: ["deck.has_stairs"],
        defaultIncluded: false,
      },
      {
        key: "balustrade",
        label: "Balustrade",
        category: "allowance",
        includeWhenFacts: ["deck.has_balustrade"],
        excludeWhenFacts: ["deck.balustrade_supply"],
        defaultIncluded: false,
      },
      {
        key: "pergola",
        label: "Pergola",
        category: "allowance",
        includeWhenFacts: ["deck.has_pergola"],
        defaultIncluded: false,
      },
      {
        key: "rubbish_removal",
        label: "Rubbish removal",
        category: "allowance",
        includeWhenFacts: ["deck.has_existing_deck", "deck.rubbish_removal"],
        defaultIncluded: false,
      },
      {
        key: "access_allowance",
        label: "Access allowance",
        category: "allowance",
        includeWhenFacts: ["deck.tight_access"],
        defaultIncluded: false,
      },
    ],
    componentAllocation: {
      labour: [
        { key: "framing_labour", label: "Framing labour", weight: 5, defaultIncluded: true },
        { key: "decking_labour", label: "Decking labour", weight: 4, defaultIncluded: true },
        { key: "project_management", label: "Project management", weight: 2, defaultIncluded: true },
        {
          key: "stairs_labour",
          label: "Stairs labour",
          weight: 3,
          includeWhenFacts: ["deck.has_stairs"],
          defaultIncluded: false,
        },
      ],
      materials: [
        { key: "decking_materials", label: "Decking materials", weight: 5, defaultIncluded: true },
        { key: "fixings_materials", label: "Fixings", weight: 3, defaultIncluded: true },
        { key: "substructure_materials", label: "Substructure materials", weight: 4, defaultIncluded: true },
        {
          key: "balustrade_materials",
          label: "Balustrade materials",
          weight: 3,
          includeWhenFacts: ["deck.has_balustrade"],
          defaultIncluded: false,
        },
      ],
      subcontractors: [
        {
          key: "trade_coordination",
          label: "Trade coordination",
          weight: 2,
          defaultIncluded: true,
        },
        {
          key: "engineering_subcontractor",
          label: "Engineering subcontractor",
          weight: 2,
          defaultIncluded: false,
        },
      ],
      allowances: [
        {
          key: "demolition_allowance",
          label: "Existing deck removal",
          weight: 3,
          includeWhenFacts: ["deck.has_existing_deck"],
          defaultIncluded: false,
        },
        {
          key: "cartage_allowance",
          label: "Cartage allowance",
          weight: 2,
          defaultIncluded: true,
        },
        {
          key: "access_allowance",
          label: "Access allowance",
          weight: 2,
          includeWhenFacts: ["deck.tight_access"],
          defaultIncluded: false,
        },
        {
          key: "unknown_conditions",
          label: "Unknown conditions allowance",
          weight: 2,
          defaultIncluded: true,
        },
      ],
    },
  },

  constraints: {
    applicable: [
      {
        key: "restricted_side_access",
        label: "Restricted side access",
        slug: "deck-restricted-access",
        questionText: "Is side or rear access restricted?",
        driverSlug: "tight-access",
      },
      {
        key: "elevated_work",
        label: "Elevated work",
        slug: "deck-elevated-work",
        questionText: "Is elevated work required?",
      },
      {
        key: "difficult_ground_conditions",
        label: "Difficult ground conditions",
        slug: "deck-difficult-ground",
        questionText: "Are ground conditions difficult?",
      },
    ],
  },

  assumptions: {
    default: [
      "Standard NZ building practices assumed.",
      "Council consent requirements to be confirmed on site.",
    ],
  },

  exclusions: {
    default: ["Engineering design unless noted", "Consent fees"],
  },

  followUps: {
    dependentQuestions: [
      {
        whenFactKey: "deck.level_type",
        whenValue: "elevated",
        askFactKey: "deck.height_m",
        questionText: "If elevated, how high off the ground?",
      },
      {
        whenFactKey: "deck.has_balustrade",
        whenValue: "yes",
        askFactKey: "deck.balustrade_supply",
        questionText:
          "Is balustrade supply and install, install only, or client supplied?",
      },
    ],
  },

  materialCategories: DECK_MATERIAL_CATEGORIES,

  confidenceWeights: [
    {
      key: "quantity",
      label: "Area known",
      weight: 25,
      category: "quantity",
      factKeys: ["deck.area_m2", "deck.length_m", "deck.width_m"],
      matchMode: "any",
    },
    {
      key: "material",
      label: "Material known",
      weight: 15,
      category: "material",
      factKeys: ["deck.material_type"],
    },
    {
      key: "elevation",
      label: "Elevation known",
      weight: 15,
      category: "quantity",
      factKeys: ["deck.level_type"],
    },
    {
      key: "finish",
      label: "Finish level known",
      weight: 10,
      category: "finish",
      factKeys: ["deck.finish_level"],
    },
    {
      key: "inclusions",
      label: "Scope inclusions confirmed",
      weight: 15,
      category: "inclusions",
      factKeys: ["deck.has_stairs", "deck.has_balustrade", "deck.has_pergola"],
    },
    {
      key: "site_access",
      label: "Site access assessed",
      weight: 10,
      category: "site_access",
      factKeys: ["deck.tight_access"],
    },
    {
      key: "rate_source",
      label: "Rate source known",
      weight: 10,
      category: "rate_source",
      factKeys: [],
    },
  ],

  estimateBreakdown: {
    defaultLineGroups: [
      {
        key: "structure",
        label: "Structure",
        componentKeys: ["substructure", "decking_boards", "fixings"],
      },
      {
        key: "extras",
        label: "Extras",
        componentKeys: ["stairs", "balustrade", "pergola", "access_allowance", "rubbish_removal"],
      },
    ],
  },
};
