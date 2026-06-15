"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOrganisation } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  logSupabaseError,
  userFacingSupabaseError,
} from "@/lib/supabase/log-error";
import { recalculateQuickEstimate } from "@/lib/cost-engine/recalculate-quick-estimate";
import { revalidateEstimateOnly } from "@/lib/assistant-v2/revalidate";
import { invalidatePricingContext } from "@/lib/cost-engine/cache/load-pricing-context";
import { formatCurrencyRange } from "@/lib/format-currency";
import {
  labourRateSchema,
  materialRateSchema,
  packageRateSchema,
  parseBooleanFormValue,
  pricingSettingsSchema,
  rateIdOnlySchema,
  scopeRateSchema,
  scopeRateUpsertSchema,
  subcontractorRateSchema,
  type RateActionState,
} from "@/lib/validations/rates";

const RATES_PATH = "/rates";

function formNumber(value: FormDataEntryValue | null): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseSubcontractorForm(formData: FormData) {
  return subcontractorRateSchema.safeParse({
    trade: formData.get("trade"),
    description: formData.get("description") || undefined,
    unit: formData.get("unit") || "hour",
    lowCostRate: formNumber(formData.get("lowCostRate")),
    typicalCostRate: formNumber(formData.get("typicalCostRate")),
    highCostRate: formNumber(formData.get("highCostRate")),
    lowChargeRate: formNumber(formData.get("lowChargeRate")),
    typicalChargeRate: formNumber(formData.get("typicalChargeRate")),
    highChargeRate: formNumber(formData.get("highChargeRate")),
    defaultConfidence: formData.get("defaultConfidence") || "medium",
    isActive: parseBooleanFormValue(formData.get("isActive")),
  });
}

function subcontractorDbRow(
  data: z.infer<typeof subcontractorRateSchema>
) {
  return {
    trade: data.trade,
    description: data.description,
    unit: data.unit,
    cost_rate: data.typicalCostRate,
    charge_rate: data.typicalChargeRate,
    low_cost_rate: data.lowCostRate,
    typical_cost_rate: data.typicalCostRate,
    high_cost_rate: data.highCostRate,
    low_charge_rate: data.lowChargeRate,
    typical_charge_rate: data.typicalChargeRate,
    high_charge_rate: data.highChargeRate,
    default_confidence: data.defaultConfidence,
    is_active: data.isActive,
  };
}

function parsePackageForm(formData: FormData) {
  const marginRaw = formData.get("defaultMargin");
  return packageRateSchema.safeParse({
    packageName: formData.get("packageName"),
    workAreaType: formData.get("workAreaType") || undefined,
    description: formData.get("description") || undefined,
    unit: formData.get("unit") || "each",
    lowBaseCost: formNumber(formData.get("lowBaseCost")),
    typicalBaseCost: formNumber(formData.get("typicalBaseCost")),
    highBaseCost: formNumber(formData.get("highBaseCost")),
    lowBaseSell: formNumber(formData.get("lowBaseSell")),
    typicalBaseSell: formNumber(formData.get("typicalBaseSell")),
    highBaseSell: formNumber(formData.get("highBaseSell")),
    defaultMargin:
      marginRaw && String(marginRaw).trim() !== ""
        ? formNumber(marginRaw)
        : null,
    isActive: parseBooleanFormValue(formData.get("isActive")),
  });
}

function packageDbRow(data: z.infer<typeof packageRateSchema>) {
  return {
    package_name: data.packageName,
    work_area_type: data.workAreaType,
    description: data.description,
    unit: data.unit,
    base_cost: data.typicalBaseCost,
    base_sell: data.typicalBaseSell,
    low_base_cost: data.lowBaseCost,
    typical_base_cost: data.typicalBaseCost,
    high_base_cost: data.highBaseCost,
    low_base_sell: data.lowBaseSell,
    typical_base_sell: data.typicalBaseSell,
    high_base_sell: data.highBaseSell,
    default_margin: data.defaultMargin,
    is_active: data.isActive,
  };
}

export async function createLabourRate(
  _prev: RateActionState,
  formData: FormData
): Promise<RateActionState> {
  const { organisationId } = await requireOrganisation();
  const parsed = labourRateSchema.safeParse({
    name: formData.get("name"),
    category: formData.get("category") || undefined,
    costRate: formNumber(formData.get("costRate")),
    chargeRate: formNumber(formData.get("chargeRate")),
    unit: formData.get("unit") || "hour",
    isActive: parseBooleanFormValue(formData.get("isActive")),
  });

  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("labour_rates").insert({
    organisation_id: organisationId,
    name: parsed.data.name,
    category: parsed.data.category,
    cost_rate: parsed.data.costRate,
    charge_rate: parsed.data.chargeRate,
    unit: parsed.data.unit,
    is_active: parsed.data.isActive,
  });

  if (error) {
    logSupabaseError("createLabourRate", error);
    return { error: userFacingSupabaseError(error, "Could not create labour rate.") };
  }

  revalidatePath(RATES_PATH);
  return { success: true, message: "Labour rate added." };
}

export async function updateLabourRate(
  id: string,
  _prev: RateActionState,
  formData: FormData
): Promise<RateActionState> {
  const { organisationId } = await requireOrganisation();
  const idParsed = rateIdOnlySchema.safeParse({ id });
  if (!idParsed.success) return { error: "Invalid rate." };

  const parsed = labourRateSchema.safeParse({
    name: formData.get("name"),
    category: formData.get("category") || undefined,
    costRate: formNumber(formData.get("costRate")),
    chargeRate: formNumber(formData.get("chargeRate")),
    unit: formData.get("unit") || "hour",
    isActive: parseBooleanFormValue(formData.get("isActive")),
  });

  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("labour_rates")
    .update({
      name: parsed.data.name,
      category: parsed.data.category,
      cost_rate: parsed.data.costRate,
      charge_rate: parsed.data.chargeRate,
      unit: parsed.data.unit,
      is_active: parsed.data.isActive,
    })
    .eq("id", idParsed.data.id)
    .eq("organisation_id", organisationId);

  if (error) {
    logSupabaseError("updateLabourRate", error);
    return { error: userFacingSupabaseError(error, "Could not update labour rate.") };
  }

  revalidatePath(RATES_PATH);
  return { success: true, message: "Labour rate updated." };
}

export async function deleteLabourRate(id: string): Promise<RateActionState> {
  const { organisationId } = await requireOrganisation();
  const idParsed = rateIdOnlySchema.safeParse({ id });
  if (!idParsed.success) return { error: "Invalid rate." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("labour_rates")
    .delete()
    .eq("id", idParsed.data.id)
    .eq("organisation_id", organisationId);

  if (error) {
    logSupabaseError("deleteLabourRate", error);
    return { error: userFacingSupabaseError(error, "Could not delete labour rate.") };
  }

  revalidatePath(RATES_PATH);
  return { success: true, message: "Labour rate deleted." };
}

export async function createSubcontractorRate(
  _prev: RateActionState,
  formData: FormData
): Promise<RateActionState> {
  const { organisationId } = await requireOrganisation();
  const parsed = parseSubcontractorForm(formData);

  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("subcontractor_rates").insert({
    organisation_id: organisationId,
    ...subcontractorDbRow(parsed.data),
  });

  if (error) {
    logSupabaseError("createSubcontractorRate", error);
    return {
      error: userFacingSupabaseError(error, "Could not create subcontractor rate."),
    };
  }

  revalidatePath(RATES_PATH);
  return { success: true, message: "Subcontractor rate added." };
}

export async function updateSubcontractorRate(
  id: string,
  _prev: RateActionState,
  formData: FormData
): Promise<RateActionState> {
  const { organisationId } = await requireOrganisation();
  const idParsed = rateIdOnlySchema.safeParse({ id });
  if (!idParsed.success) return { error: "Invalid rate." };

  const parsed = parseSubcontractorForm(formData);

  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("subcontractor_rates")
    .update(subcontractorDbRow(parsed.data))
    .eq("id", idParsed.data.id)
    .eq("organisation_id", organisationId);

  if (error) {
    logSupabaseError("updateSubcontractorRate", error);
    return {
      error: userFacingSupabaseError(error, "Could not update subcontractor rate."),
    };
  }

  revalidatePath(RATES_PATH);
  return { success: true, message: "Subcontractor rate updated." };
}

export async function deleteSubcontractorRate(
  id: string
): Promise<RateActionState> {
  const { organisationId } = await requireOrganisation();
  const idParsed = rateIdOnlySchema.safeParse({ id });
  if (!idParsed.success) return { error: "Invalid rate." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("subcontractor_rates")
    .delete()
    .eq("id", idParsed.data.id)
    .eq("organisation_id", organisationId);

  if (error) {
    logSupabaseError("deleteSubcontractorRate", error);
    return {
      error: userFacingSupabaseError(error, "Could not delete subcontractor rate."),
    };
  }

  revalidatePath(RATES_PATH);
  return { success: true, message: "Subcontractor rate deleted." };
}

export async function createMaterialRate(
  _prev: RateActionState,
  formData: FormData
): Promise<RateActionState> {
  const { organisationId } = await requireOrganisation();
  const parsed = materialRateSchema.safeParse({
    materialName: formData.get("materialName"),
    category: formData.get("category") || undefined,
    costRate: formNumber(formData.get("costRate")),
    chargeRate: formNumber(formData.get("chargeRate")),
    unit: formData.get("unit") || "each",
    supplier: formData.get("supplier") || undefined,
    isActive: parseBooleanFormValue(formData.get("isActive")),
  });

  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("material_rates").insert({
    organisation_id: organisationId,
    material_name: parsed.data.materialName,
    category: parsed.data.category,
    cost_rate: parsed.data.costRate,
    charge_rate: parsed.data.chargeRate,
    unit: parsed.data.unit,
    supplier: parsed.data.supplier,
    is_active: parsed.data.isActive,
  });

  if (error) {
    logSupabaseError("createMaterialRate", error);
    return { error: userFacingSupabaseError(error, "Could not create material rate.") };
  }

  revalidatePath(RATES_PATH);
  return { success: true, message: "Material rate added." };
}

export async function updateMaterialRate(
  id: string,
  _prev: RateActionState,
  formData: FormData
): Promise<RateActionState> {
  const { organisationId } = await requireOrganisation();
  const idParsed = rateIdOnlySchema.safeParse({ id });
  if (!idParsed.success) return { error: "Invalid rate." };

  const parsed = materialRateSchema.safeParse({
    materialName: formData.get("materialName"),
    category: formData.get("category") || undefined,
    costRate: formNumber(formData.get("costRate")),
    chargeRate: formNumber(formData.get("chargeRate")),
    unit: formData.get("unit") || "each",
    supplier: formData.get("supplier") || undefined,
    isActive: parseBooleanFormValue(formData.get("isActive")),
  });

  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("material_rates")
    .update({
      material_name: parsed.data.materialName,
      category: parsed.data.category,
      cost_rate: parsed.data.costRate,
      charge_rate: parsed.data.chargeRate,
      unit: parsed.data.unit,
      supplier: parsed.data.supplier,
      is_active: parsed.data.isActive,
    })
    .eq("id", idParsed.data.id)
    .eq("organisation_id", organisationId);

  if (error) {
    logSupabaseError("updateMaterialRate", error);
    return { error: userFacingSupabaseError(error, "Could not update material rate.") };
  }

  revalidatePath(RATES_PATH);
  return { success: true, message: "Material rate updated." };
}

export async function deleteMaterialRate(id: string): Promise<RateActionState> {
  const { organisationId } = await requireOrganisation();
  const idParsed = rateIdOnlySchema.safeParse({ id });
  if (!idParsed.success) return { error: "Invalid rate." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("material_rates")
    .delete()
    .eq("id", idParsed.data.id)
    .eq("organisation_id", organisationId);

  if (error) {
    logSupabaseError("deleteMaterialRate", error);
    return { error: userFacingSupabaseError(error, "Could not delete material rate.") };
  }

  revalidatePath(RATES_PATH);
  return { success: true, message: "Material rate deleted." };
}

export async function createPackageRate(
  _prev: RateActionState,
  formData: FormData
): Promise<RateActionState> {
  const { organisationId } = await requireOrganisation();
  const parsed = parsePackageForm(formData);

  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("package_rates").insert({
    organisation_id: organisationId,
    ...packageDbRow(parsed.data),
  });

  if (error) {
    logSupabaseError("createPackageRate", error);
    return { error: userFacingSupabaseError(error, "Could not create package rate.") };
  }

  revalidatePath(RATES_PATH);
  return { success: true, message: "Package rate added." };
}

export async function updatePackageRate(
  id: string,
  _prev: RateActionState,
  formData: FormData
): Promise<RateActionState> {
  const { organisationId } = await requireOrganisation();
  const idParsed = rateIdOnlySchema.safeParse({ id });
  if (!idParsed.success) return { error: "Invalid rate." };

  const parsed = parsePackageForm(formData);

  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("package_rates")
    .update(packageDbRow(parsed.data))
    .eq("id", idParsed.data.id)
    .eq("organisation_id", organisationId);

  if (error) {
    logSupabaseError("updatePackageRate", error);
    return { error: userFacingSupabaseError(error, "Could not update package rate.") };
  }

  revalidatePath(RATES_PATH);
  return { success: true, message: "Package rate updated." };
}

export async function deletePackageRate(id: string): Promise<RateActionState> {
  const { organisationId } = await requireOrganisation();
  const idParsed = rateIdOnlySchema.safeParse({ id });
  if (!idParsed.success) return { error: "Invalid rate." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("package_rates")
    .delete()
    .eq("id", idParsed.data.id)
    .eq("organisation_id", organisationId);

  if (error) {
    logSupabaseError("deletePackageRate", error);
    return { error: userFacingSupabaseError(error, "Could not delete package rate.") };
  }

  revalidatePath(RATES_PATH);
  return { success: true, message: "Package rate deleted." };
}

export async function updatePricingSettings(
  _prev: RateActionState,
  formData: FormData
): Promise<RateActionState> {
  const { organisationId } = await requireOrganisation();
  const parsed = pricingSettingsSchema.safeParse({
    defaultMarginPercent: formNumber(formData.get("defaultMarginPercent")),
    contingencyPercent: formNumber(formData.get("contingencyPercent")),
    gstPercent: formNumber(formData.get("gstPercent")),
    currency: formData.get("currency") || "NZD",
  });

  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("organisation_pricing_settings").upsert(
    {
      organisation_id: organisationId,
      default_margin_percent: parsed.data.defaultMarginPercent,
      contingency_percent: parsed.data.contingencyPercent,
      gst_percent: parsed.data.gstPercent,
      currency: parsed.data.currency.toUpperCase(),
    },
    { onConflict: "organisation_id" }
  );

  if (error) {
    logSupabaseError("updatePricingSettings", error);
    return {
      error: userFacingSupabaseError(error, "Could not save pricing settings."),
    };
  }

  revalidatePath(RATES_PATH);
  return { success: true, message: "Pricing settings saved." };
}

function optionalFormNumber(value: FormDataEntryValue | null): number | null {
  if (value == null || String(value).trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseScopeRateForm(formData: FormData) {
  return scopeRateUpsertSchema.safeParse({
    scopeTypeKey: formData.get("scopeTypeKey"),
    label: formData.get("label"),
    unit: formData.get("unit") || "m²",
    budgetRate: optionalFormNumber(formData.get("budgetRate")),
    standardRate: optionalFormNumber(formData.get("standardRate")),
    premiumRate: optionalFormNumber(formData.get("premiumRate")),
    defaultRate: optionalFormNumber(formData.get("defaultRate")),
    labourAllocationPercent: optionalFormNumber(
      formData.get("labourAllocationPercent")
    ),
    materialsAllocationPercent: optionalFormNumber(
      formData.get("materialsAllocationPercent")
    ),
    subcontractorAllocationPercent: optionalFormNumber(
      formData.get("subcontractorAllocationPercent")
    ),
    allowanceAllocationPercent: optionalFormNumber(
      formData.get("allowanceAllocationPercent")
    ),
    isActive: parseBooleanFormValue(formData.get("isActive")),
  });
}

function scopeRateDbRow(data: z.infer<typeof scopeRateSchema>) {
  return {
    scope_type_key: data.scopeTypeKey,
    label: data.label,
    unit: data.unit,
    budget_rate: data.budgetRate,
    standard_rate: data.standardRate,
    premium_rate: data.premiumRate,
    default_rate: data.defaultRate,
    labour_allocation_percent: data.labourAllocationPercent,
    materials_allocation_percent: data.materialsAllocationPercent,
    subcontractor_allocation_percent: data.subcontractorAllocationPercent,
    allowance_allocation_percent: data.allowanceAllocationPercent,
    is_active: data.isActive,
  };
}

export async function upsertScopeRate(
  _prev: RateActionState,
  formData: FormData
): Promise<RateActionState> {
  const { organisationId } = await requireOrganisation();
  const parsed = parseScopeRateForm(formData);

  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("scope_rates").upsert(
    {
      organisation_id: organisationId,
      ...scopeRateDbRow(parsed.data),
    },
    { onConflict: "organisation_id,scope_type_key,unit" }
  );

  if (error) {
    logSupabaseError("upsertScopeRate", error);
    return {
      error: userFacingSupabaseError(error, "Could not save scope rate."),
    };
  }

  revalidatePath(RATES_PATH);
  return { success: true, message: "Scope rate saved." };
}

export async function updateScopeRate(
  _prev: RateActionState,
  formData: FormData
): Promise<RateActionState> {
  const { organisationId } = await requireOrganisation();
  const idParsed = rateIdOnlySchema.safeParse({ id: formData.get("id") });
  const parsed = parseScopeRateForm(formData);

  if (!idParsed.success) {
    return { fieldErrors: idParsed.error.flatten().fieldErrors };
  }
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("scope_rates")
    .update(scopeRateDbRow(parsed.data))
    .eq("id", idParsed.data.id)
    .eq("organisation_id", organisationId);

  if (error) {
    logSupabaseError("updateScopeRate", error);
    return {
      error: userFacingSupabaseError(error, "Could not update scope rate."),
    };
  }

  revalidatePath(RATES_PATH);
  return { success: true, message: "Scope rate updated." };
}

export async function disableScopeRate(
  id: string
): Promise<{ error?: string; success?: boolean }> {
  const { organisationId } = await requireOrganisation();
  const parsed = rateIdOnlySchema.safeParse({ id });
  if (!parsed.success) {
    return { error: "Invalid scope rate." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("scope_rates")
    .update({ is_active: false })
    .eq("id", parsed.data.id)
    .eq("organisation_id", organisationId);

  if (error) {
    logSupabaseError("disableScopeRate", error);
    return {
      error: userFacingSupabaseError(error, "Could not disable scope rate."),
    };
  }

  revalidatePath(RATES_PATH);
  return { success: true };
}

export async function saveScopeRateAndRecalculate(
  projectId: string,
  formData: FormData
): Promise<{
  error?: string;
  success?: boolean;
  message?: string;
  estimateDeltaMessage?: string;
}> {
  const { organisationId } = await requireOrganisation();
  const parsed = parseScopeRateForm(formData);

  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors.standardRate?.[0] ?? "Invalid rate." };
  }

  const supabase = await createClient();

  const { data: previousEstimate } = await supabase
    .from("quick_estimates")
    .select("estimated_cost_low, estimated_cost_high")
    .eq("project_id", projectId)
    .eq("organisation_id", organisationId)
    .maybeSingle();

  const { error: upsertError } = await supabase.from("scope_rates").upsert(
    {
      organisation_id: organisationId,
      ...scopeRateDbRow(parsed.data),
    },
    { onConflict: "organisation_id,scope_type_key,unit" }
  );

  if (upsertError) {
    logSupabaseError("saveScopeRateAndRecalculate.upsert", upsertError);
    return {
      error: userFacingSupabaseError(upsertError, "Could not save your rate."),
    };
  }

  invalidatePricingContext(organisationId);

  const recalc = await recalculateQuickEstimate(
    supabase,
    organisationId,
    projectId,
    {
      triggerEvent: "scope_rate_saved",
      changeReason: `Saved your ${parsed.data.label} rate`,
    }
  );

  if (!recalc.success) {
    return { error: recalc.error ?? "Rate saved but estimate could not update." };
  }

  revalidateEstimateOnly(projectId);

  const prevLow = previousEstimate?.estimated_cost_low;
  const prevHigh = previousEstimate?.estimated_cost_high;

  const { data: updatedEstimate } = await supabase
    .from("quick_estimates")
    .select("estimated_cost_low, estimated_cost_high")
    .eq("project_id", projectId)
    .eq("organisation_id", organisationId)
    .maybeSingle();

  let estimateDeltaMessage: string | undefined;
  if (
    prevLow != null &&
    prevHigh != null &&
    updatedEstimate?.estimated_cost_low != null &&
    updatedEstimate?.estimated_cost_high != null
  ) {
    const from = formatCurrencyRange(Number(prevLow), Number(prevHigh));
    const to = formatCurrencyRange(
      Number(updatedEstimate.estimated_cost_low),
      Number(updatedEstimate.estimated_cost_high)
    );
    if (from !== to) {
      estimateDeltaMessage = `Using your rate changed this estimate from ${from} to ${to}.`;
    }
  }

  return {
    success: true,
    message: `Your ${parsed.data.label} rate saved.`,
    estimateDeltaMessage,
  };
}
