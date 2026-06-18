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
        /\bkwila\b/i,
        /\bmerbau\b/i,
        /\bspotted\s+gum\b/i,
        /\bblackbutt\b/i,
        /\btreated\s+pine\b/i,
        /\bpine\s+deck/i,
        /\bhardwood\b/i,
        /\bhard\s+wood\b/i,
        /\bcomposite\b/i,
      ],
      extractValue: (m) => {
        const text = m[0].toLowerCase();
        if (text.includes("composite")) return "composite";
        if (
          text.includes("timber") ||
          text.includes("hardwood") ||
          text.includes("hard wood") ||
          text.includes("kwila") ||
          text.includes("merbau") ||
          text.includes("spotted gum") ||
          text.includes("blackbutt") ||
          text.includes("treated pine") ||
          text.includes("pine")
        ) {
          return "timber";
        }
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
      extractionPatterns: [/\belevated\s+deck/i, /\braised\s+deck/i, /\bground\s+level/i, /\bground.?level/i],
      extractValue: (m) => {
        const text = m[0].toLowerCase();
        if (text.includes("elevated") || text.includes("raised")) return "elevated";
        if (text.includes("ground")) return "ground";
        return null;
      },
    },
    {
      key: "deck.height_m",
      label: "Deck height",
      type: "number",
      unit: "m",
      required: false,
      affectsEstimate: true,
      affectsConfidence: true,
      questionText: "If elevated, how high off the ground?",
      placeholder: "e.g. 1.2",
      extractionPatterns: [
        /(\d+(?:\.\d+)?)\s*(?:m|met(?:re|er)s?)\s*(?:high|height|off\s+the\s+ground)/i,
        /elevated\s*(?:at|about|approx(?:imately)?\.?)?\s*(\d+(?:\.\d+)?)\s*(?:m|met(?:re|er)s?)/i,
      ],
      extractValue: (m) => m[1] ?? null,
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
        /\bhigh[- ]end\b/i,
        /\bhigh[- ]quality\b/i,
        /\bhigh[- ]spec\b/i,
        /\bluxury\b/i,
        /\bpremium\b/i,
        /\bbudget\b/i,
        /\bbasic\b/i,
        /\bstandard\b/i,
        /\bmid[- ]range\b/i,
      ],
      extractValue: (m) => {
        const text = m[0].toLowerCase();
        if (
          text.includes("premium") ||
          text.includes("high-end") ||
          text.includes("high end") ||
          text.includes("high-quality") ||
          text.includes("high quality") ||
          text.includes("high-spec") ||
          text.includes("high spec") ||
          text.includes("luxury")
        ) {
          return "premium";
        }
        if (text.includes("budget") || text.includes("basic")) return "budget";
        if (
          text.includes("standard") ||
          text.includes("mid-range") ||
          text.includes("mid range")
        ) {
          return "standard";
        }
        return null;
      },
    },
  ],
  optionalFacts: [
    {
      key: "deck.length_m",
      label: "Deck length",
      type: "number",
      unit: "m",
      required: false,
      affectsEstimate: false,
      affectsConfidence: false,
      questionText: "Deck length?",
      placeholder: "e.g. 8",
      extractionPatterns: [
        /(\d+(?:\.\d+)?)\s*(?:m|met(?:re|er)s?)\s*long\b/i,
        /\blength\s*(?:of\s*)?(\d+(?:\.\d+)?)\s*(?:m|met(?:re|er)s?)?\b/i,
        // Ambiguous "5m x 8m deck": convention is width × length (first × second).
        /(\d+(?:\.\d+)?)\s*(?:m|met(?:re|er)s?)\s*(?:x|by)\s*(\d+(?:\.\d+)?)\s*(?:m|met(?:re|er)s?)?(?:\s+\w+)*\s*deck/i,
      ],
      extractValue: (m) => (m[2] != null ? m[2] : m[1]) ?? null,
    },
    {
      key: "deck.width_m",
      label: "Deck width",
      type: "number",
      unit: "m",
      required: false,
      affectsEstimate: false,
      affectsConfidence: false,
      questionText: "Deck width?",
      placeholder: "e.g. 5",
      extractionPatterns: [
        /(\d+(?:\.\d+)?)\s*(?:m|met(?:re|er)s?)\s*wide\b/i,
        /\bwidth\s*(?:of\s*)?(\d+(?:\.\d+)?)\s*(?:m|met(?:re|er)s?)?\b/i,
        /(\d+(?:\.\d+)?)\s*(?:m|met(?:re|er)s?)\s*(?:x|by)\s*(\d+(?:\.\d+)?)\s*(?:m|met(?:re|er)s?)?(?:\s+\w+)*\s*deck/i,
      ],
      extractValue: (m) => m[1] ?? null,
    },
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
    {
      key: "deck.has_existing_deck",
      label: "Existing deck / demo",
      type: "select",
      required: false,
      affectsEstimate: true,
      affectsConfidence: true,
      questionText: "Is there an existing deck to remove?",
      options: [...YES_NO_UNSURE],
      extractionPatterns: [
        /\bexisting\s+deck\b/i,
        /\bdemo(?:lish)?\s+(?:the\s+)?deck\b/i,
        /\bremove\s+(?:the\s+)?(?:old\s+)?deck\b/i,
      ],
      extractValue: () => "yes",
    },
    {
      key: "deck.tight_access",
      label: "Site access",
      type: "select",
      required: false,
      affectsEstimate: true,
      affectsConfidence: true,
      questionText: "Is site access tight or restricted?",
      options: [...YES_NO_UNSURE],
      extractionPatterns: [
        /\btight\s+access\b/i,
        /\brestricted\s+access\b/i,
        /\bpoor\s+access\b/i,
        /\blimited\s+access\b/i,
      ],
      extractValue: () => "yes",
    },
    {
      key: "deck.rubbish_removal",
      label: "Rubbish removal",
      type: "select",
      required: false,
      affectsEstimate: false,
      affectsConfidence: true,
      questionText: "Is rubbish removal required?",
      options: [...YES_NO_UNSURE],
      extractionPatterns: [/\brubbish\b/i, /\bwaste\s+removal\b/i, /\bskip\b/i],
      extractValue: () => "yes",
    },
    {
      key: "deck.material_supply",
      label: "Material supply",
      type: "select",
      required: false,
      affectsEstimate: true,
      affectsConfidence: true,
      questionText: "Supply and install, labour only, or client-supplied materials?",
      options: [
        { value: "supply_and_install", label: "Supply and install" },
        { value: "labour_only", label: "Labour only" },
        { value: "client_supplied", label: "Client supplies materials" },
      ],
      extractionPatterns: [
        /\blabour\s+only\b/i,
        /\bclient\s+suppl(?:y|ies)\s+(?:deck|materials|decking)/i,
        /\bsupply\s+and\s+install\b/i,
      ],
      extractValue: (m) => {
        const text = m[0].toLowerCase();
        if (text.includes("labour only")) return "labour_only";
        if (text.includes("client suppl")) return "client_supplied";
        return "supply_and_install";
      },
    },
    {
      key: "deck.balustrade_supply",
      label: "Balustrade supply",
      type: "select",
      required: false,
      affectsEstimate: true,
      affectsConfidence: true,
      questionText: "Is balustrade supplied and installed, or install only?",
      options: [
        { value: "supply_and_install", label: "Supply and install" },
        { value: "client_supplied", label: "Client supplies — install only" },
        { value: "excluded", label: "Excluded" },
      ],
      extractionPatterns: [
        /exclude\s+balustrade/i,
        /install\s+only.*balustrad/i,
        /client\s+suppl.*balustrad/i,
      ],
      extractValue: (m) => {
        const text = m[0].toLowerCase();
        if (text.includes("exclude")) return "excluded";
        if (text.includes("install only") || text.includes("client suppl")) {
          return "client_supplied";
        }
        return "supply_and_install";
      },
    },
  ],
  pricingDrivers: [
    "deck.area_m2",
    "deck.material_type",
    "deck.level_type",
    "deck.height_m",
    "deck.finish_level",
    "deck.has_stairs",
    "deck.has_balustrade",
    "deck.has_pergola",
    "deck.has_existing_deck",
    "deck.tight_access",
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
      "deck.height_m",
      "deck.tight_access",
      "deck.material_supply",
      "deck.balustrade_supply",
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
