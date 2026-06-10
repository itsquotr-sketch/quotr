import { YES_NO_UNSURE } from "@/lib/scope-templates/shared";
import type { ScopeTemplate } from "@/lib/scope-templates/types";

export const deckTemplate: ScopeTemplate = {
  key: "deck",
  name: "Deck",
  workAreaTypeKey: "Deck",
  category: "Outdoor",
  aliases: ["deck", "decking", "timber deck", "composite deck", "balustrade", "pergola"],
  description: "Timber or composite deck construction including stairs, balustrade and pergola options.",
  requiredFacts: [
    {
      key: "deck.area_m2",
      label: "Deck area",
      unit: "m²",
      required: true,
      extractionPatterns: [
        /(\d+(?:\.\d+)?)\s*(?:m2|m²|sqm|square\s*met(?:re|er)s?)\s*(?:deck|decking)/i,
        /deck(?:ing)?\s*(?:with\s+pergola\s+)?(?:of|about|approx(?:imately)?\.?|around|is)?\s*(\d+(?:\.\d+)?)\s*(?:m2|m²|sqm)/i,
        /(\d+(?:\.\d+)?)\s*(?:m2|m²|sqm)\s*deck/i,
      ],
      extractValue: (m) => m[1] ?? null,
    },
  ],
  optionalFacts: [
    {
      key: "deck.material_type",
      label: "Deck material",
      required: false,
      extractionPatterns: [
        /\bcomposite\s+deck/i,
        /\bcomposite\s+decking/i,
        /\btimber\s+deck/i,
        /\bhardwood\s+deck/i,
        /\bpine\s+deck/i,
      ],
      extractValue: (m) => {
        const text = m[0].toLowerCase();
        if (text.includes("composite")) return "composite";
        if (text.includes("timber") || text.includes("hardwood") || text.includes("pine")) {
          return "timber";
        }
        return null;
      },
    },
    {
      key: "deck.level_type",
      label: "Deck level",
      required: false,
      extractionPatterns: [/\belevated\s+deck/i, /\braised\s+deck/i, /\bupper\s+deck/i],
      extractValue: () => "elevated",
    },
    {
      key: "deck.has_pergola",
      label: "Pergola included",
      required: false,
      extractionPatterns: [/\bpergola\b/i, /\bveranda\b/i],
      extractValue: () => "yes",
    },
    {
      key: "deck.has_stairs",
      label: "Stairs included",
      required: false,
      extractionPatterns: [/\bstairs\b/i, /\bsteps\b/i],
      extractValue: () => "yes",
    },
    {
      key: "deck.access_restricted",
      label: "Restricted access",
      required: false,
      extractionPatterns: [
        /\brestricted\s+(?:side\s+)?access\b/i,
        /\btight\s+access\b/i,
        /\bnarrow\s+access\b/i,
      ],
      extractValue: () => "yes",
    },
  ],
  questions: [
    {
      questionKey: "deck.area_m2",
      label: "Approximate deck area?",
      type: "number",
      unit: "m²",
      required: true,
      affectsEstimate: true,
      placeholder: "e.g. 20",
      helpText: "Used to calculate deck cost per m².",
    },
    {
      questionKey: "deck.level_type",
      label: "Is the deck ground-level or elevated?",
      type: "select",
      required: true,
      affectsEstimate: true,
      options: [
        { value: "ground", label: "Ground level" },
        { value: "elevated", label: "Elevated" },
        { value: "unknown", label: "Not sure yet" },
      ],
    },
    {
      questionKey: "deck.material_type",
      label: "Timber or composite decking?",
      type: "select",
      required: false,
      affectsEstimate: true,
      options: [
        { value: "timber", label: "Timber" },
        { value: "composite", label: "Composite" },
        { value: "unknown", label: "Not sure yet" },
      ],
    },
    {
      questionKey: "deck.has_stairs",
      label: "Are stairs included?",
      type: "select",
      required: false,
      affectsEstimate: true,
      options: [...YES_NO_UNSURE],
    },
    {
      questionKey: "deck.has_balustrade",
      label: "Is balustrade included?",
      type: "select",
      required: false,
      affectsEstimate: true,
      options: [...YES_NO_UNSURE],
    },
    {
      questionKey: "deck.has_pergola",
      label: "Is a pergola included?",
      type: "select",
      required: false,
      affectsEstimate: true,
      options: [...YES_NO_UNSURE],
    },
    {
      questionKey: "deck.access_restricted",
      label: "Is side or rear access restricted?",
      type: "select",
      required: false,
      affectsEstimate: false,
      options: [...YES_NO_UNSURE],
      helpText: "Also captured as a site constraint if selected in Step 4.",
    },
  ],
  constraints: [
    {
      key: "restricted_side_access",
      label: "Restricted side access",
      slug: "deck-restricted-access",
      driverSlug: "tight-access",
    },
    {
      key: "elevated_work",
      label: "Elevated work",
      slug: "deck-elevated-work",
    },
    {
      key: "difficult_ground_conditions",
      label: "Difficult ground conditions",
      slug: "deck-difficult-ground",
    },
  ],
  likelyTrades: [
    "Builder / Carpenter",
    "Labourer",
    "Balustrade supplier",
    "Earthworks",
  ],
  benchmarkRates: {
    unit: "m²",
    low: 450,
    typical: 650,
    high: 900,
  },
  estimateRules: {
    calculationType: "deck_area",
    requiredFactKeys: ["deck.area_m2"],
    lowMultiplier: 0.88,
    highMultiplier: 1.18,
    elevatedModifier: 1.15,
  },
};
