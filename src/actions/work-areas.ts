"use server";

import { revalidatePath } from "next/cache";
import { requireOrganisation } from "@/lib/auth";
import { ensureQuestionsForProjectScopes } from "@/lib/scope-questions-seed";
import { recalculateQuickEstimate } from "@/lib/cost-engine/recalculate-quick-estimate";
import { createClient } from "@/lib/supabase/server";
import { logSupabaseError } from "@/lib/supabase/log-error";
import { syncScopeQuestionsForScope } from "@/lib/scope-questions-seed";
import {
  addAssistantWorkAreaSchema,
  toggleWorkAreaEstimateSchema,
} from "@/lib/validations/project-trade";

export type WorkAreaActionState = {
  success?: boolean;
  error?: string;
  message?: string;
};

const TEMPLATE_SCOPE_TYPES: Record<
  "deck" | "retaining-wall" | "bathroom-renovation",
  { scopeTypeSlug: string; defaultName: string; workAreaTypeKey: string }
> = {
  deck: {
    scopeTypeSlug: "deck",
    defaultName: "Deck",
    workAreaTypeKey: "Deck",
  },
  "retaining-wall": {
    scopeTypeSlug: "other",
    defaultName: "Retaining wall",
    workAreaTypeKey: "Retaining Wall",
  },
  "bathroom-renovation": {
    scopeTypeSlug: "bathroom-renovation",
    defaultName: "Bathroom renovation",
    workAreaTypeKey: "Bathroom renovation",
  },
};

function revalidateProject(projectId: string) {
  revalidatePath(`/projects/${projectId}`);
}

export async function toggleWorkAreaInQuickEstimate(
  projectId: string,
  scopeId: string,
  includeInQuickEstimate: boolean
): Promise<WorkAreaActionState> {
  const { organisationId } = await requireOrganisation();
  const supabase = await createClient();

  const parsed = toggleWorkAreaEstimateSchema.safeParse({
    scopeId,
    includeInQuickEstimate,
  });
  if (!parsed.success) {
    return { error: "Invalid work area." };
  }

  const { data: scope } = await supabase
    .from("project_scopes")
    .select("id, include_in_quick_estimate")
    .eq("id", parsed.data.scopeId)
    .eq("project_id", projectId)
    .eq("organisation_id", organisationId)
    .maybeSingle();

  if (!scope) {
    return { error: "Work area not found." };
  }

  if (scope.include_in_quick_estimate === parsed.data.includeInQuickEstimate) {
    return { success: true, message: "No change." };
  }

  const { error } = await supabase
    .from("project_scopes")
    .update({ include_in_quick_estimate: parsed.data.includeInQuickEstimate })
    .eq("id", parsed.data.scopeId)
    .eq("organisation_id", organisationId);

  if (error) {
    logSupabaseError("toggleWorkAreaInQuickEstimate", error);
    return { error: "Could not update work area." };
  }

  await recalculateQuickEstimate(supabase, organisationId, projectId, {
    triggerEvent: parsed.data.includeInQuickEstimate
      ? "work_area_included"
      : "work_area_excluded",
  });

  revalidateProject(projectId);
  return {
    success: true,
    message: parsed.data.includeInQuickEstimate
      ? "Work area included in estimate."
      : "Work area excluded for now.",
  };
}

export async function addAssistantWorkArea(
  projectId: string,
  _prev: WorkAreaActionState,
  formData: FormData
): Promise<WorkAreaActionState> {
  const { organisationId } = await requireOrganisation();
  const supabase = await createClient();

  const mode = formData.get("mode")?.toString();
  const raw =
    mode === "custom"
      ? {
          mode: "custom" as const,
          name: formData.get("name"),
          description: formData.get("description")?.toString() || undefined,
          likelyTrade: formData.get("likelyTrade")?.toString() || undefined,
        }
      : {
          mode: "template" as const,
          templateKey: formData.get("templateKey"),
          name: formData.get("name")?.toString() || undefined,
          description: formData.get("description")?.toString() || undefined,
        };

  const parsed = addAssistantWorkAreaSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      error:
        parsed.error.flatten().fieldErrors.name?.[0] ??
        "Invalid work area details.",
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

  let scopeTypeId: string | null = null;
  let name = "";
  let description: string | null = null;
  let isCustom = false;

  if (parsed.data.mode === "template") {
    const template = TEMPLATE_SCOPE_TYPES[parsed.data.templateKey];
    name = parsed.data.name?.trim() || template.defaultName;
    description = parsed.data.description?.trim() || null;

    const { data: scopeType } = await supabase
      .from("scope_types")
      .select("id")
      .eq("slug", template.scopeTypeSlug)
      .maybeSingle();

    scopeTypeId = scopeType?.id ?? null;
    isCustom = template.scopeTypeSlug === "other";
  } else {
    name = parsed.data.name.trim();
    description = parsed.data.description?.trim() || null;
    isCustom = true;

    const { data: otherType } = await supabase
      .from("scope_types")
      .select("id")
      .eq("slug", "other")
      .maybeSingle();

    scopeTypeId = otherType?.id ?? null;
  }

  const { data: maxSort } = await supabase
    .from("project_scopes")
    .select("sort_order")
    .eq("project_id", projectId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: scope, error: scopeError } = await supabase
    .from("project_scopes")
    .insert({
      organisation_id: organisationId,
      project_id: projectId,
      scope_type_id: scopeTypeId,
      name,
      description,
      is_custom: isCustom,
      include_in_quick_estimate: true,
      sort_order: (maxSort?.sort_order ?? 0) + 1,
      status: "draft",
      ai_status: "not_started",
      estimate_status: "draft",
    })
    .select("id, name, scope_types(name)")
    .single();

  if (scopeError || !scope) {
    logSupabaseError("addAssistantWorkArea.insert", scopeError);
    return { error: "Could not add work area." };
  }

  await syncScopeQuestionsForScope(
    supabase,
    organisationId,
    projectId,
    scope as {
      id: string;
      name: string;
      scope_types: { name: string } | null;
    }
  );
  await ensureQuestionsForProjectScopes(supabase, organisationId, projectId);

  if (parsed.data.mode === "custom" && parsed.data.likelyTrade?.trim()) {
    await supabase.from("project_trades").insert({
      organisation_id: organisationId,
      project_id: projectId,
      project_scope_id: scope.id,
      trade_name: parsed.data.likelyTrade.trim(),
      source: "user",
      is_active: true,
    });
  }

  await recalculateQuickEstimate(supabase, organisationId, projectId, {
    triggerEvent: "work_area_added",
  });

  revalidateProject(projectId);
  return { success: true, message: `${name} added.` };
}
