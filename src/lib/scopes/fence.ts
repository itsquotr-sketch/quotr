import { YES_NO_UNSURE } from "@/lib/scopes/shared";
import { FENCE_MATERIAL_CATEGORIES } from "@/lib/scopes/material-categories";
import type { ScopeDefinition } from "@/lib/scopes/types";

const FENCE_TYPE_OPTIONS = [
  { value: "paling", label: "Paling fence" },
  { value: "board_batten", label: "Board and batten" },
  { value: "horizontal_slat", label: "Horizontal slat" },
  { value: "pool", label: "Pool fence" },
  { value: "privacy", label: "Privacy fence" },
  { value: "unknown", label: "Not sure" },
] as const;

export const fenceScope: ScopeDefinition = {
  id: "fence",
  name: "Fence",
  workAreaTypeKey: "Fence",
  category: "Outdoor",
  aliases: [
    "fence",
    "fencing",
    "boundary fence",
    "timber fence",
    "paling fence",
    "privacy fence",
    "pool fence",
    "gate",
  ],
  description:
    "Boundary and privacy fencing including gates, posts and demolition of existing fence.",
  requiredFacts: [
    {
      key: "fence.length_m",
      label: "Fence length",
      type: "number",
      unit: "m",
      required: true,
      affectsEstimate: true,
      affectsConfidence: true,
      questionText: "What is the total fence length?",
      placeholder: "e.g. 20",
      extractionPatterns: [
        /(\d+(?:\.\d+)?)\s*(?:m|met(?:re|er)s?|lm)\s*(?:fence|fencing|long)/i,
        /(?:new|build)\s*(?:a\s+)?(\d+(?:\.\d+)?)\s*(?:m|met(?:re|er)s?)\s*(?:fence|fencing)/i,
        /fence\s*(?:around|about|approx(?:imately)?\.?|is)?\s*(\d+(?:\.\d+)?)\s*(?:m|met(?:re|er)s?|lm)/i,
      ],
      extractValue: (m) => m[1] ?? null,
    },
    {
      key: "fence.height_m",
      label: "Fence height",
      type: "number",
      unit: "m",
      required: true,
      affectsEstimate: true,
      affectsConfidence: true,
      questionText: "What height should I allow for?",
      placeholder: "e.g. 1.8",
      extractionPatterns: [
        /(\d+(?:\.\d+)?)\s*(?:m|met(?:re|er)s?)\s*(?:high|height|tall)\s*(?:fence|fencing)\b/i,
        /fence\s*(?:at|about|approx(?:imately)?\.?)?\s*(\d+(?:\.\d+)?)\s*(?:m|met(?:re|er)s?)\s*(?:high|height)/i,
      ],
      extractValue: (m) => m[1] ?? null,
    },
    {
      key: "fence.fence_type",
      label: "Fence type",
      type: "select",
      required: true,
      affectsEstimate: true,
      affectsConfidence: true,
      questionText: "What type of fence should I assume?",
      options: [...FENCE_TYPE_OPTIONS],
      extractionPatterns: [
        /\bpaling\s+fence/i,
        /\bboard\s+and\s+batten/i,
        /\bhorizontal\s+slat/i,
        /\bpool\s+fence/i,
        /\bprivacy\s+fence/i,
        /\btimber\s+fence/i,
      ],
      extractValue: (m) => {
        const text = m[0].toLowerCase();
        if (text.includes("paling")) return "paling";
        if (text.includes("board") && text.includes("batten")) return "board_batten";
        if (text.includes("horizontal")) return "horizontal_slat";
        if (text.includes("pool")) return "pool";
        if (text.includes("privacy")) return "privacy";
        if (text.includes("timber")) return "paling";
        return null;
      },
    },
    {
      key: "fence.material_type",
      label: "Fence material",
      type: "select",
      required: true,
      affectsEstimate: true,
      affectsConfidence: true,
      questionText: FENCE_MATERIAL_CATEGORIES.questionText,
      options: FENCE_MATERIAL_CATEGORIES.categories.map(({ value, label }) => ({
        value,
        label,
      })),
      extractionPatterns: [
        /\btimber\s+fenc/i,
        /\bsteel\s+fenc/i,
        /\baluminium\s+fenc/i,
        /\bpvc\s+fenc/i,
        /\bmasonry\s+fenc/i,
      ],
      extractValue: (m) => {
        const text = m[0].toLowerCase();
        if (text.includes("steel")) return "steel";
        if (text.includes("aluminium")) return "aluminium";
        if (text.includes("pvc")) return "pvc";
        if (text.includes("masonry")) return "masonry";
        if (text.includes("timber")) return "timber";
        return null;
      },
    },
  ],
  optionalFacts: [
    {
      key: "fence.gate_included",
      label: "Gate included",
      type: "select",
      required: false,
      affectsEstimate: true,
      affectsConfidence: true,
      questionText: "Is a gate included?",
      options: [...YES_NO_UNSURE],
      extractionPatterns: [/\bgate\b/i, /\bwith\s+a\s+gate\b/i],
      extractValue: () => "yes",
    },
    {
      key: "fence.number_of_gates",
      label: "Number of gates",
      type: "number",
      required: false,
      affectsEstimate: true,
      affectsConfidence: false,
      questionText: "How many gates?",
      placeholder: "e.g. 1",
      dependsOn: {
        factKey: "fence.gate_included",
        operator: "equals",
        value: "yes",
      },
    },
    {
      key: "fence.demolition_existing",
      label: "Demolition of existing fence",
      type: "select",
      required: false,
      affectsEstimate: true,
      affectsConfidence: true,
      questionText: "Is demolition of an existing fence required?",
      options: [...YES_NO_UNSURE],
    },
    {
      key: "fence.ground_conditions",
      label: "Ground conditions",
      type: "select",
      required: false,
      affectsEstimate: true,
      affectsConfidence: true,
      questionText: "Are ground conditions difficult?",
      options: [...YES_NO_UNSURE],
    },
    {
      key: "fence.access",
      label: "Site access",
      type: "select",
      required: false,
      affectsEstimate: true,
      affectsConfidence: true,
      questionText: "Is site access tight or restricted?",
      options: [...YES_NO_UNSURE],
    },
    {
      key: "fence.material_supply",
      label: "Material supply",
      type: "select",
      required: false,
      affectsEstimate: true,
      affectsConfidence: false,
      questionText: "Who is supplying materials?",
      options: [
        { value: "contractor", label: "Contractor supplied" },
        { value: "client", label: "Client supplied" },
        { value: "unknown", label: "Not sure yet" },
      ],
    },
    {
      key: "fence.post_spacing",
      label: "Post spacing",
      type: "number",
      unit: "m",
      required: false,
      affectsEstimate: false,
      affectsConfidence: true,
      questionText: "What post spacing should I assume?",
      placeholder: "e.g. 2.4",
    },
  ],
  pricingDrivers: [
    "fence.length_m",
    "fence.height_m",
    "fence.fence_type",
    "fence.material_type",
    "fence.gate_included",
    "fence.demolition_existing",
    "fence.ground_conditions",
  ],
  constraints: [],
  likelyTrades: ["Builder", "Fencer", "Labourer"],
  assumptions: [
    "Standard post-and-rail or paling construction assumed.",
    "Council consent requirements to be confirmed if pool fencing.",
  ],
  confidenceRules: {
    measurementFactKeys: [
      "fence.length_m",
      "fence.height_m",
      "fence.fence_type",
      "fence.material_type",
    ],
    highImpactOptionalKeys: [
      "fence.gate_included",
      "fence.demolition_existing",
      "fence.ground_conditions",
      "fence.access",
      "fence.material_supply",
    ],
  },
  benchmarkRates: { unit: "m", low: 180, typical: 280, high: 420 },
  estimateRules: {
    calculationType: "fence_length",
    requiredFactKeys: [
      "fence.length_m",
      "fence.height_m",
    ],
  },
};
