import type { ScopeTemplate } from "@/lib/scopes/templates/types";
import { FENCE_MATERIAL_CATEGORIES } from "@/lib/scopes/material-categories";

const stubAllocations = {
  labour: 40,
  materials: 40,
  subcontractors: 10,
  allowances: 5,
  contingency: 5,
};

export const fenceScopeTemplate: ScopeTemplate = {
  scopeTypeKey: "fence",
  label: "Fence",
  workAreaTypeKey: "Fence",
  category: "external",
  aliases: ["fence", "fencing", "boundary fence", "paling fence", "gate"],
  quantity: { primaryUnit: "m", requiredFields: ["fence.length_m"] },
  facts: {
    required: [
      { key: "fence.length_m", label: "Fence length", type: "number", unit: "m", questionText: "What is the total fence length?" },
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
      { key: "fence.height_m", label: "Fence height", type: "number", unit: "m", questionText: "How high is the fence?" },
    ],
    optional: [{ key: "fence.has_gate", label: "Gate included", type: "select", questionText: "Is a gate included?" }],
  },
  pricing: {
    supported: false,
    pricingMode: "not_supported",
    defaultRateUnit: "m",
    defaultAllocations: stubAllocations,
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

export const kitchenRenovationScopeTemplate: ScopeTemplate = {
  scopeTypeKey: "kitchen_renovation",
  label: "Kitchen renovation",
  workAreaTypeKey: "Kitchen renovation",
  category: "renovation",
  aliases: ["kitchen", "kitchen renovation", "kitchen remodel", "kitchen reno"],
  quantity: { primaryUnit: "m²", requiredFields: ["kitchen.floor_area_m2"] },
  facts: {
    required: [{ key: "kitchen.floor_area_m2", label: "Floor area", type: "number", unit: "m²" }],
    useful: [
      { key: "kitchen.layout_changing", label: "Layout changing", type: "select" },
      { key: "kitchen.appliances_client_supplied", label: "Appliances client supplied", type: "select" },
    ],
    optional: [{ key: "kitchen.joinery_client_supplied", label: "Joinery client supplied", type: "select" }],
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
