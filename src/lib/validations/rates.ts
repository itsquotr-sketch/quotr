import { z } from "zod";
import {
  DEFAULT_CURRENCY,
  DEFAULT_CONTINGENCY_PERCENT,
  DEFAULT_GST_PERCENT,
  DEFAULT_LABOUR_UNIT,
  DEFAULT_MARGIN_PERCENT,
  DEFAULT_MATERIAL_UNIT,
  DEFAULT_PACKAGE_UNIT,
  DEFAULT_SUBCONTRACTOR_UNIT,
} from "@/lib/constants/rates";

const positiveRate = z.coerce
  .number({ invalid_type_error: "Enter a valid number" })
  .min(0, "Must be zero or greater");

export const rateRangeSchema = z.object({
  low: positiveRate,
  typical: positiveRate,
  high: positiveRate,
});

export const rateConfidenceSchema = z.enum(["low", "medium", "high"], {
  errorMap: () => ({ message: "Select a confidence level" }),
});

const optionalText = z
  .string()
  .optional()
  .transform((v) => (v?.trim() ? v.trim() : null));

const rateIdSchema = z.string().uuid("Invalid rate id");

export const labourRateSchema = z.object({
  name: z.string().min(1, "Name is required"),
  category: optionalText,
  costRate: positiveRate,
  chargeRate: positiveRate,
  unit: z.string().min(1).default(DEFAULT_LABOUR_UNIT),
  isActive: z.coerce.boolean().default(true),
});

export const subcontractorRateSchema = z.object({
  trade: z.string().min(1, "Trade is required"),
  description: optionalText,
  unit: z.string().min(1).default(DEFAULT_SUBCONTRACTOR_UNIT),
  lowCostRate: positiveRate,
  typicalCostRate: positiveRate,
  highCostRate: positiveRate,
  lowChargeRate: positiveRate,
  typicalChargeRate: positiveRate,
  highChargeRate: positiveRate,
  defaultConfidence: rateConfidenceSchema.default("medium"),
  isActive: z.coerce.boolean().default(true),
});

export const materialRateSchema = z.object({
  materialName: z.string().min(1, "Material name is required"),
  category: optionalText,
  costRate: positiveRate,
  chargeRate: positiveRate,
  unit: z.string().min(1).default(DEFAULT_MATERIAL_UNIT),
  supplier: optionalText,
  isActive: z.coerce.boolean().default(true),
});

export const packageRateSchema = z.object({
  packageName: z.string().min(1, "Package name is required"),
  workAreaType: optionalText,
  description: optionalText,
  unit: z.string().min(1).default(DEFAULT_PACKAGE_UNIT),
  lowBaseCost: positiveRate,
  typicalBaseCost: positiveRate,
  highBaseCost: positiveRate,
  lowBaseSell: positiveRate,
  typicalBaseSell: positiveRate,
  highBaseSell: positiveRate,
  defaultMargin: positiveRate.optional().nullable(),
  isActive: z.coerce.boolean().default(true),
});

export const pricingSettingsSchema = z.object({
  defaultMarginPercent: positiveRate.max(100, "Margin cannot exceed 100%"),
  contingencyPercent: positiveRate.max(100, "Contingency cannot exceed 100%"),
  gstPercent: positiveRate.max(100, "GST cannot exceed 100%"),
  currency: z.string().min(3).max(3).default(DEFAULT_CURRENCY),
});

export const rateIdOnlySchema = z.object({
  id: rateIdSchema,
});

const optionalPercent = z.coerce
  .number({ invalid_type_error: "Enter a valid number" })
  .min(0, "Must be zero or greater")
  .max(100, "Cannot exceed 100%")
  .optional()
  .nullable();

export const scopeRateSchema = z.object({
  scopeTypeKey: z.string().min(1, "Scope type is required"),
  label: z.string().min(1, "Label is required"),
  unit: z.string().min(1, "Unit is required"),
  budgetRate: positiveRate.optional().nullable(),
  standardRate: positiveRate.optional().nullable(),
  premiumRate: positiveRate.optional().nullable(),
  defaultRate: positiveRate.optional().nullable(),
  labourAllocationPercent: optionalPercent,
  materialsAllocationPercent: optionalPercent,
  subcontractorAllocationPercent: optionalPercent,
  allowanceAllocationPercent: optionalPercent,
  isActive: z.coerce.boolean().default(true),
});

export const scopeRateUpsertSchema = scopeRateSchema.refine(
  (data) =>
    data.budgetRate != null ||
    data.standardRate != null ||
    data.premiumRate != null ||
    data.defaultRate != null,
  {
    message: "Enter at least one rate",
    path: ["standardRate"],
  }
);

export type RateRangeInput = z.infer<typeof rateRangeSchema>;
export type LabourRateInput = z.infer<typeof labourRateSchema>;
export type SubcontractorRateInput = z.infer<typeof subcontractorRateSchema>;
export type MaterialRateInput = z.infer<typeof materialRateSchema>;
export type PackageRateInput = z.infer<typeof packageRateSchema>;
export type ScopeRateInput = z.infer<typeof scopeRateSchema>;
export type PricingSettingsInput = z.infer<typeof pricingSettingsSchema>;

export type RateActionState = {
  error?: string;
  success?: boolean;
  message?: string;
  fieldErrors?: Record<string, string[]>;
};

export function parseBooleanFormValue(value: FormDataEntryValue | null): boolean {
  if (value === "true" || value === "on") return true;
  return false;
}

export function defaultPricingSettings() {
  return {
    defaultMarginPercent: DEFAULT_MARGIN_PERCENT,
    contingencyPercent: DEFAULT_CONTINGENCY_PERCENT,
    gstPercent: DEFAULT_GST_PERCENT,
    currency: DEFAULT_CURRENCY,
  };
}
