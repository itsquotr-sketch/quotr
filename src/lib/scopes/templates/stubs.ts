import type { ScopeTemplate } from "@/lib/scopes/templates/types";
import { FENCE_MATERIAL_CATEGORIES } from "@/lib/scopes/material-categories";

const stubAllocations = {
  labour: 40,
  materials: 40,
  subcontractors: 10,
  allowances: 5,
  contingency: 5,
};

const FENCE_TYPE_OPTIONS = [
  { value: "paling", label: "Paling fence" },
  { value: "board_batten", label: "Board and batten" },
  { value: "horizontal_slat", label: "Horizontal slat" },
  { value: "pool", label: "Pool fence" },
  { value: "privacy", label: "Privacy fence" },
  { value: "unknown", label: "Not sure" },
];

export const fenceScopeTemplate: ScopeTemplate = {
  scopeTypeKey: "fence",
  label: "Fence",
  workAreaTypeKey: "Fence",
  category: "external",
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
  quantity: { primaryUnit: "m", requiredFields: ["fence.length_m"] },
  facts: {
    required: [
      {
        key: "fence.length_m",
        label: "Fence length",
        type: "number",
        unit: "m",
        questionText: "What is the total fence length?",
      },
      {
        key: "fence.height_m",
        label: "Fence height",
        type: "number",
        unit: "m",
        questionText: "What height should I allow for?",
        affectsEstimate: true,
        affectsConfidence: true,
      },
      {
        key: "fence.fence_type",
        label: "Fence type",
        type: "select",
        questionText: "What type of fence should I assume?",
        options: FENCE_TYPE_OPTIONS,
        affectsEstimate: true,
        affectsConfidence: true,
      },
      {
        key: "fence.material_type",
        label: "Fence material",
        type: "select",
        questionText: FENCE_MATERIAL_CATEGORIES.questionText,
        options: FENCE_MATERIAL_CATEGORIES.categories.map(({ value, label }) => ({
          value,
          label,
        })),
        affectsEstimate: true,
        affectsConfidence: true,
      },
    ],
    useful: [
      {
        key: "fence.gate_included",
        label: "Gate included",
        type: "select",
        questionText: "Is a gate included?",
      },
      {
        key: "fence.number_of_gates",
        label: "Number of gates",
        type: "number",
        questionText: "How many gates?",
      },
      {
        key: "fence.demolition_existing",
        label: "Demolition of existing fence",
        type: "select",
        questionText: "Is demolition of an existing fence required?",
      },
      {
        key: "fence.ground_conditions",
        label: "Ground conditions",
        type: "select",
        questionText: "Are ground conditions difficult?",
      },
      {
        key: "fence.access",
        label: "Site access",
        type: "select",
        questionText: "Is site access tight or restricted?",
      },
      {
        key: "fence.material_supply",
        label: "Material supply",
        type: "select",
        questionText: "Who is supplying materials?",
      },
      {
        key: "fence.post_spacing",
        label: "Post spacing",
        type: "number",
        unit: "m",
        questionText: "What post spacing should I assume?",
      },
    ],
    optional: [],
  },
  pricing: {
    supported: true,
    pricingMode: "hybrid",
    defaultRateUnit: "m",
    benchmarkRates: { budget: 180, standard: 280, premium: 420 },
    defaultAllocations: stubAllocations,
    calculationType: "fence_length",
    componentAllocation: {
      labour: [
        { key: "post_labour", label: "Post setting labour", weight: 4, defaultIncluded: true },
        { key: "fence_build_labour", label: "Fence build labour", weight: 5, defaultIncluded: true },
        { key: "project_management", label: "Project management", weight: 2, defaultIncluded: true },
      ],
      materials: [
        { key: "fence_materials", label: "Fence materials", weight: 5, defaultIncluded: true },
        { key: "fixings_materials", label: "Fixings", weight: 3, defaultIncluded: true },
        {
          key: "gate_materials",
          label: "Gate materials",
          weight: 3,
          includeWhenFacts: ["fence.gate_included"],
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
          key: "concrete_subcontractor",
          label: "Concrete subcontractor",
          weight: 2,
          defaultIncluded: false,
        },
      ],
      allowances: [
        { key: "cartage_allowance", label: "Cartage allowance", weight: 2, defaultIncluded: true },
        {
          key: "unknown_conditions",
          label: "Unknown conditions allowance",
          weight: 2,
          defaultIncluded: true,
        },
      ],
    },
  },
  constraints: { applicable: [] },
  assumptions: { default: [] },
  exclusions: { default: [] },
  followUps: { dependentQuestions: [] },
  materialCategories: FENCE_MATERIAL_CATEGORIES,
  estimateBreakdown: { defaultLineGroups: [] },
};

export const paintingScopeTemplate: ScopeTemplate = {
  scopeTypeKey: "painting_project",
  label: "Painting",
  workAreaTypeKey: "Painting",
  category: "internal",
  aliases: ["painting", "painting project", "repaint", "full repaint", "interior paint"],
  quantity: { primaryUnit: "m²", requiredFields: ["painting.floor_area_m2"] },
  facts: {
    required: [{ key: "painting.floor_area_m2", label: "Floor area", type: "number", unit: "m²" }],
    useful: [{ key: "painting.rooms_count", label: "Number of rooms", type: "number" }],
    optional: [{ key: "painting.exterior", label: "Exterior included", type: "select" }],
  },
  pricing: {
    supported: false,
    pricingMode: "not_supported",
    defaultRateUnit: "m²",
    defaultAllocations: stubAllocations,
  },
  constraints: { applicable: [] },
  assumptions: { default: [] },
  exclusions: { default: [] },
  followUps: { dependentQuestions: [] },
  estimateBreakdown: { defaultLineGroups: [] },
};

export const flooringScopeTemplate: ScopeTemplate = {
  scopeTypeKey: "flooring_project",
  label: "Flooring",
  workAreaTypeKey: "Flooring",
  category: "internal",
  aliases: ["flooring", "flooring project", "floor replacement", "new floors", "timber flooring"],
  quantity: { primaryUnit: "m²", requiredFields: ["flooring.area_m2"] },
  facts: {
    required: [{ key: "flooring.area_m2", label: "Floor area", type: "number", unit: "m²" }],
    useful: [{ key: "flooring.material_type", label: "Flooring material", type: "select" }],
    optional: [{ key: "flooring.removal_included", label: "Existing floor removal", type: "select" }],
  },
  pricing: {
    supported: false,
    pricingMode: "not_supported",
    defaultRateUnit: "m²",
    defaultAllocations: stubAllocations,
  },
  constraints: { applicable: [] },
  assumptions: { default: [] },
  exclusions: { default: [] },
  followUps: { dependentQuestions: [] },
  estimateBreakdown: { defaultLineGroups: [] },
};
