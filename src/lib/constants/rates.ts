export const DEFAULT_LABOUR_UNIT = "hour";
export const DEFAULT_SUBCONTRACTOR_UNIT = "hour";
export const DEFAULT_MATERIAL_UNIT = "each";
export const DEFAULT_PACKAGE_UNIT = "each";

export const DEFAULT_MARGIN_PERCENT = 20;
export const DEFAULT_CONTINGENCY_PERCENT = 5;
export const DEFAULT_GST_PERCENT = 15;
export const DEFAULT_CURRENCY = "NZD";

export const LABOUR_CATEGORIES = [
  "Carpentry",
  "Leading hand",
  "Apprentice",
  "Labour",
  "Supervision",
  "Other",
] as const;

export const MATERIAL_CATEGORIES = [
  "Timber",
  "Sheet goods",
  "Decking",
  "Concrete",
  "Insulation",
  "Fixings",
  "Other",
] as const;

export const RATE_UNITS = [
  { value: "hour", label: "Per hour" },
  { value: "day", label: "Per day" },
  { value: "each", label: "Each" },
  { value: "m", label: "Per metre" },
  { value: "m2", label: "Per m²" },
  { value: "lm", label: "Per linear metre" },
  { value: "kg", label: "Per kg" },
  { value: "bag", label: "Per bag" },
] as const;

export const PACKAGE_WORK_AREA_TYPES = [
  "Deck",
  "Bathroom renovation",
  "Kitchen renovation",
  "Retaining Wall",
  "Internal Alteration",
  "Painting",
  "Fence",
  "Flooring",
  "General Building Works",
  "Custom Scope",
] as const;

export const RATE_CONFIDENCE_LEVELS = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
] as const;

export const RATE_TAB_KEYS = [
  "labour",
  "subcontractors",
  "materials",
  "packages",
] as const;

export type RateTabKey = (typeof RATE_TAB_KEYS)[number];
