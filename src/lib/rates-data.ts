import { defaultPricingSettings } from "@/lib/validations/rates";
import { logSupabaseError } from "@/lib/supabase/log-error";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type Supabase = SupabaseClient<Database>;

export async function listLabourRates(
  supabase: Supabase,
  organisationId: string
) {
  return supabase
    .from("labour_rates")
    .select("*")
    .eq("organisation_id", organisationId)
    .order("name", { ascending: true });
}

export async function listSubcontractorRates(
  supabase: Supabase,
  organisationId: string
) {
  return supabase
    .from("subcontractor_rates")
    .select("*")
    .eq("organisation_id", organisationId)
    .order("trade", { ascending: true });
}

export async function listMaterialRates(
  supabase: Supabase,
  organisationId: string
) {
  return supabase
    .from("material_rates")
    .select("*")
    .eq("organisation_id", organisationId)
    .order("material_name", { ascending: true });
}

export async function listPackageRates(
  supabase: Supabase,
  organisationId: string
) {
  return supabase
    .from("package_rates")
    .select("*")
    .eq("organisation_id", organisationId)
    .order("package_name", { ascending: true });
}

export async function listScopeRates(
  supabase: Supabase,
  organisationId: string
) {
  return supabase
    .from("scope_rates")
    .select("*")
    .eq("organisation_id", organisationId)
    .order("label", { ascending: true });
}

export async function getOrganisationPricingSettings(
  supabase: Supabase,
  organisationId: string
) {
  const { data, error } = await supabase
    .from("organisation_pricing_settings")
    .select("*")
    .eq("organisation_id", organisationId)
    .maybeSingle();

  if (error) {
    logSupabaseError("getOrganisationPricingSettings", error);
    return { data: null, error };
  }

  return { data, error: null };
}

/** Ensures a pricing settings row exists with system defaults. */
export async function ensureOrganisationPricingSettings(
  supabase: Supabase,
  organisationId: string
) {
  const existing = await getOrganisationPricingSettings(supabase, organisationId);
  if (existing.data) {
    return existing;
  }

  const defaults = defaultPricingSettings();
  const { data, error } = await supabase
    .from("organisation_pricing_settings")
    .insert({
      organisation_id: organisationId,
      default_margin_percent: defaults.defaultMarginPercent,
      contingency_percent: defaults.contingencyPercent,
      gst_percent: defaults.gstPercent,
      currency: defaults.currency,
    })
    .select("*")
    .single();

  if (error) {
    logSupabaseError("ensureOrganisationPricingSettings", error);
  }

  return { data, error };
}
