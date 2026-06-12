"use server";

import { revalidatePath } from "next/cache";
import { requireOrganisation } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { logSupabaseError } from "@/lib/supabase/log-error";
import {
  addProjectTradeSchema,
  removeProjectTradeSchema,
} from "@/lib/validations/project-trade";

export type ProjectTradeActionState = {
  success?: boolean;
  error?: string;
  message?: string;
};

function revalidateProject(projectId: string) {
  revalidatePath(`/projects/${projectId}`);
}

export async function addProjectTrade(
  projectId: string,
  _prev: ProjectTradeActionState,
  formData: FormData
): Promise<ProjectTradeActionState> {
  const { organisationId } = await requireOrganisation();
  const supabase = await createClient();

  const scopeIdRaw = formData.get("projectScopeId")?.toString();
  const parsed = addProjectTradeSchema.safeParse({
    tradeName: formData.get("tradeName"),
    note: formData.get("note")?.toString() || undefined,
    projectScopeId: scopeIdRaw && scopeIdRaw.length > 0 ? scopeIdRaw : null,
  });

  if (!parsed.success) {
    return {
      error:
        parsed.error.flatten().fieldErrors.tradeName?.[0] ??
        "Invalid trade details.",
    };
  }

  const { data: project } = await supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .eq("organisation_id", organisationId)
    .maybeSingle();

  if (!project) {
    return { error: "Project not found." };
  }

  if (parsed.data.projectScopeId) {
    const { data: scope } = await supabase
      .from("project_scopes")
      .select("id")
      .eq("id", parsed.data.projectScopeId)
      .eq("project_id", projectId)
      .eq("organisation_id", organisationId)
      .maybeSingle();

    if (!scope) {
      return { error: "Work area not found." };
    }
  }

  const { error } = await supabase.from("project_trades").insert({
    organisation_id: organisationId,
    project_id: projectId,
    project_scope_id: parsed.data.projectScopeId ?? null,
    trade_name: parsed.data.tradeName,
    note: parsed.data.note ?? null,
    source: "user",
    is_active: true,
  });

  if (error) {
    logSupabaseError("addProjectTrade", error);
    return { error: "Could not add trade." };
  }

  revalidateProject(projectId);
  return { success: true, message: `${parsed.data.tradeName} added.` };
}

export async function removeProjectTrade(
  projectId: string,
  tradeId: string
): Promise<ProjectTradeActionState> {
  const { organisationId } = await requireOrganisation();
  const supabase = await createClient();

  const parsed = removeProjectTradeSchema.safeParse({ tradeId });
  if (!parsed.success) {
    return { error: "Invalid trade." };
  }

  const { error } = await supabase
    .from("project_trades")
    .update({ is_active: false })
    .eq("id", parsed.data.tradeId)
    .eq("project_id", projectId)
    .eq("organisation_id", organisationId);

  if (error) {
    logSupabaseError("removeProjectTrade", error);
    return { error: "Could not remove trade." };
  }

  revalidateProject(projectId);
  return { success: true, message: "Trade removed." };
}
