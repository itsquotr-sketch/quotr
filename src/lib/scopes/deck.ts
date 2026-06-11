import { YES_NO_UNSURE } from "@/lib/scopes/shared";
import type { ScopeDefinition } from "@/lib/scopes/types";

export const deckScope: ScopeDefinition = {
  id: "deck",
  name: "Deck",
  workAreaTypeKey: "Deck",
  category: "Outdoor",
  aliases: [
    "deck",
    "decking",
    "timber deck",
    "composite deck",
    "balustrade",
    "pergola",
  ],
  description:
    "Timber or composite deck construction including stairs, balustrade and pergola options.",
  requiredFacts: [
    {
      key: "deck.area_m2",
      label: "Deck area",
      type: "number",
      unit: "m²",
      required: true,
      affectsEstimate: true,
      affectsConfidence: true,
      questionText: "Approximate deck area?",
      placeholder: "e.g. 20",
      extractionPatterns: [
        /(\d+(?:\.\d+)?)\s*(?:m2|m²|sqm|square\s*met(?:re|er)s?)\s*(?:deck|decking)/i,
        /deck(?:ing)?\s*(?:with\s+pergola\s+)?(?:of|about|approx(?:imately)?\.?|around|is)?\s*(\d+(?:\.\d+)?)\s*(?:m2|m²|sqm)/i,
        /(\d+(?:\.\d+)?)\s*(?:m2|m²|sqm)\s*deck/i,
      ],
      extractValue: (m) => m[1] ?? null,
    },
    {
      key: "deck.material_type",
      label: "Deck material",
      type: "select",
      required: true,
      affectsEstimate: true,
      affectsConfidence: true,
      questionText: "Timber or composite decking?",
      options: [
        { value: "timber", label: "Timber" },
        { value: "composite", label: "Composite" },
        { value: "unknown", label: "Not sure yet" },
      ],
      extractionPatterns: [
        /\bcomposite\s+deck/i,
        /\btimber\s+deck/i,
        /\bhardwood\s+deck/i,
      ],
      extractValue: (m) => {
        const text = m[0].toLowerCase();
        if (text.includes("composite")) return "composite";
        if (text.includes("timber") || text.includes("hardwood")) return "timber";
        return null;
      },
    },
    {
      key: "deck.level_type",
      label: "Deck level",
      type: "select",
      required: true,
      affectsEstimate: true,
      affectsConfidence: true,
      questionText: "Is the deck ground-level or elevated?",
      options: [
        { value: "ground", label: "Ground level" },
        { value: "elevated", label: "Elevated" },
        { value: "unknown", label: "Not sure yet" },
      ],
      extractionPatterns: [/\belevated\s+deck/i, /\braised\s+deck/i, /\bground\s+level/i],
      extractValue: (m) => {
        const text = m[0].toLowerCase();
        if (text.includes("elevated") || text.includes("raised")) return "elevated";
        if (text.includes("ground")) return "ground";
        return null;
      },
    },
    {
      key: "deck.finish_level",
      label: "Finish level",
      type: "select",
      required: true,
      affectsEstimate: true,
      affectsConfidence: true,
      questionText: "What finish level is expected?",
      options: [
        { value: "budget", label: "Budget / basic" },
        { value: "standard", label: "Standard / mid-range" },
        { value: "premium", label: "Premium / high-end" },
        { value: "unknown", label: "Not sure yet" },
      ],
      extractionPatterns: [
        /\bstandard\s+finish/i,
        /\bbudget\s+finish/i,
        /\bpremium\s+finish/i,
        /\bmid[- ]range\s+finish/i,
      ],
      extractValue: (m) => {
        const text = m[0].toLowerCase();
        if (text.includes("premium")) return "premium";
        if (text.includes("budget")) return "budget";
        if (text.includes("standard") || text.includes("mid")) return "standard";
        return null;
      },
    },
  ],
  optionalFacts: [
    {
      key: "deck.has_stairs",
      label: "Stairs",
      type: "select",
      required: false,
      affectsEstimate: true,
      affectsConfidence: true,
      questionText: "Are stairs included?",
      options: [...YES_NO_UNSURE],
      extractionPatterns: [/\bstairs\b/i, /\bsteps\b/i],
      extractValue: () => "yes",
    },
    {
      key: "deck.has_balustrade",
      label: "Balustrade",
      type: "select",
      required: false,
      affectsEstimate: true,
      affectsConfidence: true,
      questionText: "Is balustrade included?",
      options: [...YES_NO_UNSURE],
      extractionPatterns: [
        /\bno\s+balustrad/i,
        /\bwithout\s+balustrad/i,
        /\bbalustrad/i,
      ],
      extractValue: (m) => {
        const text = m[0].toLowerCase();
        if (text.includes("no ") || text.includes("without")) return "no";
        return "yes";
      },
    },
    {
      key: "deck.has_pergola",
      label: "Pergola",
      type: "select",
      required: false,
      affectsEstimate: true,
      affectsConfidence: true,
      questionText: "Is a pergola included?",
      options: [...YES_NO_UNSURE],
      extractionPatterns: [/\bpergola\b/i],
      extractValue: () => "yes",
    },
  ],
  pricingDrivers: [
    "deck.area_m2",
    "deck.material_type",
    "deck.level_type",
    "deck.finish_level",
    "deck.has_stairs",
    "deck.has_balustrade",
    "deck.has_pergola",
  ],
  constraints: [
    {
      key: "restricted_side_access",
      label: "Restricted side access",
      questionText: "Is side or rear access restricted?",
      slug: "deck-restricted-access",
      driverSlug: "tight-access",
    },
    {
      key: "elevated_work",
      label: "Elevated work",
      questionText: "Is elevated work required?",
      slug: "deck-elevated-work",
    },
    {
      key: "difficult_ground_conditions",
      label: "Difficult ground conditions",
      questionText: "Are ground conditions difficult?",
      slug: "deck-difficult-ground",
    },
  ],
  likelyTrades: [
    "Builder / Carpenter",
    "Labourer",
    "Balustrade supplier",
    "Earthworks",
  ],
  assumptions: [
    "Standard NZ building practices assumed.",
    "Council consent requirements to be confirmed on site.",
  ],
  confidenceRules: {
    measurementFactKeys: [
      "deck.area_m2",
      "deck.material_type",
      "deck.level_type",
      "deck.finish_level",
    ],
    highImpactOptionalKeys: [
      "deck.has_stairs",
      "deck.has_balustrade",
      "deck.has_pergola",
    ],
  },
  benchmarkRates: { unit: "m²", low: 450, typical: 650, high: 900 },
  estimateRules: {
    calculationType: "deck_area",
    requiredFactKeys: [
      "deck.area_m2",
      "deck.material_type",
      "deck.level_type",
      "deck.finish_level",
    ],
    elevatedModifier: 1.15,
  },
};
