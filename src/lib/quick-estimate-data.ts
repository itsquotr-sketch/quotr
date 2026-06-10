import { logSupabaseError } from "@/lib/supabase/log-error";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type Supabase = SupabaseClient<Database>;

/** Ensures a draft quick estimate row exists for the project. */
export async function ensureQuickEstimateForProject(
  supabase: Supabase,
  organisationId: string,
  projectId: string,
  userId: string
) {
  const { data: existing } = await getQuickEstimateForProject(
    supabase,
    organisationId,
    projectId
  );

  if (existing) {
    return existing;
  }

  const { data: created, error } = await supabase
    .from("quick_estimates")
    .insert({
      organisation_id: organisationId,
      project_id: projectId,
      created_by: userId,
      status: "draft",
      quality_level: "unknown",
    })
    .select("*")
    .single();

  if (error) {
    logSupabaseError("ensureQuickEstimateForProject", error);
    return null;
  }

  return created;
}

export async function getQuickEstimateForProject(
  supabase: Supabase,
  organisationId: string,
  projectId: string
) {
  return supabase
    .from("quick_estimates")
    .select("*")
    .eq("organisation_id", organisationId)
    .eq("project_id", projectId)
    .not("status", "in", '("archived","declined")')
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
}

export async function getQuickEstimateById(
  supabase: Supabase,
  organisationId: string,
  projectId: string,
  quickEstimateId: string
) {
  return supabase
    .from("quick_estimates")
    .select("*")
    .eq("id", quickEstimateId)
    .eq("organisation_id", organisationId)
    .eq("project_id", projectId)
    .maybeSingle();
}

export async function listQuickEstimateAnswers(
  supabase: Supabase,
  organisationId: string,
  quickEstimateId: string
) {
  return supabase
    .from("quick_estimate_answers")
    .select("*")
    .eq("organisation_id", organisationId)
    .eq("quick_estimate_id", quickEstimateId)
    .order("created_at", { ascending: true });
}

export async function listEstimateDriverCategoriesWithDrivers(
  supabase: Supabase
) {
  return supabase
    .from("estimate_driver_categories")
    .select(
      `
      *,
      estimate_drivers (
        *
      )
    `
    )
    .order("sort_order", { ascending: true })
    .order("sort_order", {
      referencedTable: "estimate_drivers",
      ascending: true,
    });
}

export async function listProjectEstimateDrivers(
  supabase: Supabase,
  organisationId: string,
  quickEstimateId: string
) {
  return supabase
    .from("project_estimate_drivers")
    .select(
      `
      *,
      estimate_drivers (
        id,
        name,
        slug,
        description,
        multiplier,
        fixed_allowance,
        labour_modifier_percent
      )
    `
    )
    .eq("organisation_id", organisationId)
    .eq("quick_estimate_id", quickEstimateId);
}
