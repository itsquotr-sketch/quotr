import { YES_NO_UNSURE } from "@/lib/scopes/shared";
import type { ScopeDefinition } from "@/lib/scopes/types";

const KITCHEN_SIZE_OPTIONS = [
  { value: "small", label: "Small" },
  { value: "medium", label: "Medium" },
  { value: "large", label: "Large" },
  { value: "unknown", label: "Not sure yet" },
] as const;

const BENCHTOP_OPTIONS = [
  { value: "laminate", label: "Laminate" },
  { value: "engineered_stone", label: "Engineered stone" },
  { value: "premium", label: "Premium stone" },
  { value: "not_sure", label: "Not sure yet" },
] as const;

const CABINETRY_LEVEL_OPTIONS = [
  { value: "budget", label: "Budget" },
  { value: "standard", label: "Standard" },
  { value: "premium", label: "Premium" },
  { value: "not_sure", label: "Not sure yet" },
] as const;

export const KITCHEN_SIZE_BENCHMARKS = {
  small: { low: 15000, typical: 22000, high: 35000 },
  medium: { low: 25000, typical: 38000, high: 55000 },
  large: { low: 40000, typical: 60000, high: 85000 },
} as const;

export const kitchenRenovationScope: ScopeDefinition = {
  id: "kitchen_renovation",
  name: "Kitchen renovation",
  workAreaTypeKey: "Kitchen renovation",
  category: "Interior",
  aliases: [
    "kitchen",
    "kitchen renovation",
    "kitchen remodel",
    "kitchen reno",
    "new kitchen",
  ],
  description:
    "Kitchen renovation including cabinetry, benchtops, services and demolition.",
  requiredFacts: [
    {
      key: "kitchen.kitchen_size_type",
      label: "Kitchen size",
      type: "select",
      required: true,
      affectsEstimate: true,
      affectsConfidence: true,
      questionText: "Is this a small, medium or large kitchen?",
      options: [...KITCHEN_SIZE_OPTIONS],
      extractionPatterns: [
        /\bsmall\s+kitchen\b/i,
        /\bmedium\s+kitchen\b/i,
        /\blarge\s+kitchen\b/i,
      ],
      extractValue: (m) => {
        const text = m[0].toLowerCase();
        if (text.includes("small")) return "small";
        if (text.includes("medium")) return "medium";
        if (text.includes("large")) return "large";
        return null;
      },
    },
    {
      key: "kitchen.layout_changing",
      label: "Layout changing",
      type: "select",
      required: true,
      affectsEstimate: true,
      affectsConfidence: true,
      questionText: "Is the layout changing?",
      options: [...YES_NO_UNSURE],
      extractionPatterns: [/\blayout\s+chang/i, /\breconfigur/i],
      extractValue: () => "yes",
    },
    {
      key: "kitchen.appliances_client_supplied",
      label: "Appliances client supplied",
      type: "select",
      required: true,
      affectsEstimate: true,
      affectsConfidence: true,
      questionText: "Are appliances client supplied?",
      options: [...YES_NO_UNSURE],
    },
    {
      key: "kitchen.benchtop_type",
      label: "Benchtop type",
      type: "select",
      required: true,
      affectsEstimate: true,
      affectsConfidence: true,
      questionText: "What benchtop should I assume?",
      options: [...BENCHTOP_OPTIONS],
    },
    {
      key: "kitchen.plumbing_changes",
      label: "Plumbing changes",
      type: "select",
      required: true,
      affectsEstimate: true,
      affectsConfidence: true,
      questionText: "Are plumbing changes required?",
      options: [...YES_NO_UNSURE],
    },
    {
      key: "kitchen.electrical_changes",
      label: "Electrical changes",
      type: "select",
      required: true,
      affectsEstimate: true,
      affectsConfidence: true,
      questionText: "Are electrical changes required?",
      options: [...YES_NO_UNSURE],
    },
  ],
  optionalFacts: [
    {
      key: "kitchen.floor_area_m2",
      label: "Floor area",
      type: "number",
      unit: "m²",
      required: false,
      affectsEstimate: true,
      affectsConfidence: true,
      questionText: "Approximate kitchen floor area?",
      placeholder: "e.g. 12",
      extractionPatterns: [
        /(?:around|approx(?:\.|imately)?|about)\s*(\d+(?:\.\d+)?)\s*(?:m2|m²|sqm|square\s*met(?:re|er)s?)(?:\s+floor\s*area)?/i,
        /(\d+(?:\.\d+)?)\s*(?:m2|m²|sqm|square\s*met(?:re|er)s?)\s*(?:kitchen|floor\s*area)/i,
        /kitchen\s*(?:floor\s*)?(?:area|size)?\s*(?:of|about|approx(?:imately)?\.?|around|is)?\s*(\d+(?:\.\d+)?)\s*(?:m2|m²|sqm|square\s*met(?:re|er)s?)/i,
        /kitchen\s+renovation\s+(\d+(?:\.\d+)?)\s*(?:m2|m²|sqm|square\s*met(?:re|er)s?)/i,
        /kitchen\s+(\d+(?:\.\d+)?)\s*(?:m2|m²|sqm|square\s*met(?:re|er)s?)/i,
        /floor\s*area\s*(?:(?:of|is|about|around|approx(?:\.|imately)?)\s*)?(\d+(?:\.\d+)?)\s*(?:m2|m²|sqm)/i,
      ],
      extractValue: (m) => m[1] ?? null,
    },
    {
      key: "kitchen.cabinetry_length_m",
      label: "Cabinetry length",
      type: "number",
      unit: "m",
      required: false,
      affectsEstimate: true,
      affectsConfidence: true,
      questionText: "Approximate cabinetry run length?",
      placeholder: "e.g. 6",
    },
    {
      key: "kitchen.demolition_required",
      label: "Demolition required",
      type: "select",
      required: false,
      affectsEstimate: true,
      affectsConfidence: true,
      questionText: "Is demolition of the existing kitchen required?",
      options: [...YES_NO_UNSURE],
      extractionPatterns: [
        /\bfull\s+demolition\s+of\s+existing\s+kitchen\b/i,
        /\bdemo(?:lish)?(?:ition)?\s+(?:of\s+)?(?:the\s+)?existing\s+kitchen\b/i,
        /\bstrip\s*out\s+(?:the\s+)?kitchen\b/i,
      ],
      extractValue: () => "yes",
    },
    {
      key: "kitchen.cabinetry_level",
      label: "Cabinetry level",
      type: "select",
      required: false,
      affectsEstimate: true,
      affectsConfidence: true,
      questionText: "What cabinetry level should I assume?",
      options: [...CABINETRY_LEVEL_OPTIONS],
    },
    {
      key: "kitchen.splashback",
      label: "Splashback included",
      type: "select",
      required: false,
      affectsEstimate: true,
      affectsConfidence: true,
      questionText: "Is splashback included?",
      options: [...YES_NO_UNSURE],
    },
    {
      key: "kitchen.flooring_included",
      label: "Flooring included",
      type: "select",
      required: false,
      affectsEstimate: true,
      affectsConfidence: true,
      questionText: "Is new flooring included?",
      options: [...YES_NO_UNSURE],
    },
  ],
  pricingDrivers: [
    "kitchen.kitchen_size_type",
    "kitchen.layout_changing",
    "kitchen.demolition_required",
    "kitchen.benchtop_type",
    "kitchen.cabinetry_level",
    "kitchen.plumbing_changes",
    "kitchen.electrical_changes",
  ],
  constraints: [
    {
      key: "occupied_home",
      label: "Occupied home",
      questionText: "Is the home occupied during the work?",
      slug: "kitchen-occupied-home",
    },
    {
      key: "apartment_access",
      label: "Apartment access",
      questionText: "Are there apartment access restrictions?",
      slug: "kitchen-apartment-access",
    },
  ],
  likelyTrades: [
    "Builder / Joiner",
    "Plumber",
    "Electrician",
    "Tiler",
    "Painter",
  ],
  assumptions: [
    "Kitchen pricing is a rough allowance — confirm rates before relying on this.",
    "Standard kitchen renovation sequence assumed.",
  ],
  confidenceRules: {
    measurementFactKeys: ["kitchen.kitchen_size_type"],
    highImpactOptionalKeys: [
      "kitchen.demolition_required",
      "kitchen.floor_area_m2",
      "kitchen.cabinetry_length_m",
      "kitchen.benchtop_type",
      "kitchen.cabinetry_level",
      "kitchen.splashback",
      "kitchen.flooring_included",
    ],
  },
  benchmarkRates: { unit: "each", low: 25000, typical: 38000, high: 55000 },
  estimateRules: {
    calculationType: "kitchen_size",
    requiredFactKeys: ["kitchen.kitchen_size_type"],
    layoutChangeModifier: 1.15,
  },
};
