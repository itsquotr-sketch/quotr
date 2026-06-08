export const BUSINESS_TYPES = [
  { value: "sole_trader", label: "Sole trader" },
  { value: "partnership", label: "Partnership" },
  { value: "limited_company", label: "Limited company" },
  { value: "other", label: "Other" },
] as const;

export const COMPANY_SIZES = [
  { value: "1", label: "Just me" },
  { value: "2_5", label: "2–5 people" },
  { value: "6_10", label: "6–10 people" },
  { value: "11_25", label: "11–25 people" },
  { value: "26_50", label: "26–50 people" },
  { value: "50_plus", label: "50+ people" },
] as const;

export const QUOTING_VOLUMES = [
  { value: "1_5_per_month", label: "1–5 quotes per month" },
  { value: "6_15_per_month", label: "6–15 quotes per month" },
  { value: "16_30_per_month", label: "16–30 quotes per month" },
  { value: "30_plus_per_month", label: "30+ quotes per month" },
] as const;

export type BusinessType = (typeof BUSINESS_TYPES)[number]["value"];
export type CompanySize = (typeof COMPANY_SIZES)[number]["value"];
export type QuotingVolume = (typeof QUOTING_VOLUMES)[number]["value"];
