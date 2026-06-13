import { logSupabaseError } from "@/lib/supabase/log-error";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type Supabase = SupabaseClient<Database>;

export type ProjectAllowanceRow =
  Database["public"]["Tables"]["project_allowances"]["Row"];

export async function listProjectAllowances(
  supabase: Supabase,
  organisationId: string,
  projectId: string
): Promise<{ data: ProjectAllowanceRow[]; error: string | null }> {
  const { data, error } = await supabase
    .from("project_allowances")
    .select("*")
    .eq("organisation_id", organisationId)
    .eq("project_id", projectId)
    .eq("is_active", true)
    .order("created_at", { ascending: true });

  if (error) {
    logSupabaseError("listProjectAllowances", error);
    return { data: [], error: "Could not load project allowances." };
  }

  return { data: data ?? [], error: null };
}

export async function findProjectAllowance(
  supabase: Supabase,
  organisationId: string,
  projectId: string,
  allowanceKey: string,
  projectScopeId: string | null = null
): Promise<ProjectAllowanceRow | null> {
  let query = supabase
    .from("project_allowances")
    .select("*")
    .eq("organisation_id", organisationId)
    .eq("project_id", projectId)
    .eq("allowance_key", allowanceKey)
    .eq("is_active", true);

  if (projectScopeId) {
    query = query.eq("project_scope_id", projectScopeId);
  } else {
    query = query.is("project_scope_id", null);
  }

  const { data, error } = await query.maybeSingle();

  if (error) {
    logSupabaseError("findProjectAllowance", error);
    return null;
  }

  return data;
}

export async function upsertProjectAllowance(
  supabase: Supabase,
  params: {
    organisationId: string;
    projectId: string;
    allowanceKey: string;
    label: string;
    amount: number;
    projectScopeId?: string | null;
    note?: string | null;
    source?: string;
  }
): Promise<{ data: ProjectAllowanceRow | null; error: string | null }> {
  const scopeId = params.projectScopeId ?? null;
  const existing = await findProjectAllowance(
    supabase,
    params.organisationId,
    params.projectId,
    params.allowanceKey,
    scopeId
  );

  if (existing) {
    const { data, error } = await supabase
      .from("project_allowances")
      .update({
        amount: params.amount,
        label: params.label,
        note: params.note ?? existing.note,
        source: params.source ?? "user",
        is_active: true,
      })
      .eq("id", existing.id)
      .eq("organisation_id", params.organisationId)
      .select("*")
      .single();

    if (error) {
      logSupabaseError("upsertProjectAllowance.update", error);
      return { data: null, error: "Could not update allowance." };
    }

    return { data, error: null };
  }

  const { data, error } = await supabase
    .from("project_allowances")
    .insert({
      organisation_id: params.organisationId,
      project_id: params.projectId,
      project_scope_id: scopeId,
      allowance_key: params.allowanceKey,
      label: params.label,
      amount: params.amount,
      source: params.source ?? "user",
      note: params.note ?? null,
      is_active: true,
    })
    .select("*")
    .single();

  if (error) {
    logSupabaseError("upsertProjectAllowance.insert", error);
    return { data: null, error: "Could not save allowance." };
  }

  return { data, error: null };
}

export async function deactivateProjectAllowance(
  supabase: Supabase,
  organisationId: string,
  allowanceId: string
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from("project_allowances")
    .update({ is_active: false })
    .eq("id", allowanceId)
    .eq("organisation_id", organisationId);

  if (error) {
    logSupabaseError("deactivateProjectAllowance", error);
    return { error: "Could not remove allowance." };
  }

  return { error: null };
}
