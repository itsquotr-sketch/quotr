import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

export async function listScopeBuilderInputs(
  supabase: SupabaseClient<Database>,
  organisationId: string,
  jobId: string
) {
  return supabase
    .from("project_scope_builder_inputs")
    .select("*")
    .eq("organisation_id", organisationId)
    .eq("project_id", jobId)
    .order("created_at", { ascending: false });
}

export async function getLatestScopeBuilderInput(
  supabase: SupabaseClient<Database>,
  organisationId: string,
  jobId: string
) {
  return supabase
    .from("project_scope_builder_inputs")
    .select("*")
    .eq("organisation_id", organisationId)
    .eq("project_id", jobId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
}

export async function listScopeSuggestions(
  supabase: SupabaseClient<Database>,
  organisationId: string,
  jobId: string
) {
  return supabase
    .from("project_scope_suggestions")
    .select("*")
    .eq("organisation_id", organisationId)
    .eq("project_id", jobId)
    .order("created_at", { ascending: false });
}

/** Types already suggested and still active (pending draft or converted to scope). */
export async function listActiveScopeSuggestionTypes(
  supabase: SupabaseClient<Database>,
  organisationId: string,
  jobId: string
) {
  return supabase
    .from("project_scope_suggestions")
    .select("suggested_scope_type")
    .eq("organisation_id", organisationId)
    .eq("project_id", jobId)
    .in("status", ["pending", "converted"]);
}

export async function getScopeBuilderInputById(
  supabase: SupabaseClient<Database>,
  organisationId: string,
  jobId: string,
  inputId: string
) {
  return supabase
    .from("project_scope_builder_inputs")
    .select("*")
    .eq("id", inputId)
    .eq("organisation_id", organisationId)
    .eq("project_id", jobId)
    .maybeSingle();
}