"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOrganisation } from "@/lib/auth";
import { findOrCreateClient } from "@/lib/clients";
import { createClient } from "@/lib/supabase/server";
import {
  DEFAULT_PROJECT_STATUS,
  projectSchema,
  projectStatusSchema,
  updateProjectSchema,
  type ProjectActionState,
} from "@/lib/validations/project";

export async function createProject(
  _prevState: ProjectActionState,
  formData: FormData
): Promise<ProjectActionState> {
  const { user, organisationId } = await requireOrganisation();

  const raw = {
    title: formData.get("title"),
    clientName: formData.get("clientName"),
    clientPhone: formData.get("clientPhone") || undefined,
    clientEmail: formData.get("clientEmail") || undefined,
    siteAddress: formData.get("siteAddress"),
    enquirySource: formData.get("enquirySource"),
    clientBrief: formData.get("clientBrief") || undefined,
    priority: formData.get("priority"),
    initialNotes: formData.get("initialNotes") || undefined,
  };

  const parsed = projectSchema.safeParse(raw);
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const supabase = await createClient();

  let clientId: string | null = null;

  if (parsed.data.clientName.trim()) {
    try {
      clientId = await findOrCreateClient(
        supabase,
        organisationId,
        parsed.data.clientName,
        parsed.data.clientPhone,
        parsed.data.clientEmail || null
      );
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not save client.";
      return { error: message };
    }
  }

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .insert({
      organisation_id: organisationId,
      created_by: user.id,
      client_id: clientId,
      title: parsed.data.title,
      site_address: parsed.data.siteAddress,
      enquiry_source: parsed.data.enquirySource,
      enquiry_status: "new",
      client_brief: parsed.data.clientBrief ?? null,
      priority: parsed.data.priority,
      description: parsed.data.initialNotes ?? null,
      status: projectStatusSchema.parse(DEFAULT_PROJECT_STATUS),
    })
    .select("id")
    .single();

  if (projectError || !project) {
    console.error("[createProject] Insert failed:", projectError);
    return { error: projectError?.message ?? "Could not save project." };
  }

  revalidatePath("/projects");
  revalidatePath("/dashboard");
  redirect(`/projects/${project.id}`);
}

export async function updateProject(
  projectId: string,
  _prevState: ProjectActionState,
  formData: FormData
): Promise<ProjectActionState> {
  const { organisationId } = await requireOrganisation();

  const raw = {
    title: formData.get("title"),
    clientName: formData.get("clientName"),
    clientPhone: formData.get("clientPhone") || undefined,
    clientEmail: formData.get("clientEmail") || undefined,
    siteAddress: formData.get("siteAddress"),
    enquirySource: formData.get("enquirySource"),
    clientBrief: formData.get("clientBrief") || undefined,
    priority: formData.get("priority"),
    initialNotes: formData.get("initialNotes") || undefined,
    status: formData.get("status"),
  };

  const parsed = updateProjectSchema.safeParse(raw);
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .eq("organisation_id", organisationId)
    .single();

  if (!existing) {
    return { error: "Project not found." };
  }

  let clientId: string | null = null;

  try {
    clientId = await findOrCreateClient(
      supabase,
      organisationId,
      parsed.data.clientName,
      parsed.data.clientPhone,
      parsed.data.clientEmail || null
    );
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not save client.";
    return { error: message };
  }

  const { error: updateError } = await supabase
    .from("projects")
    .update({
      title: parsed.data.title,
      client_id: clientId,
      site_address: parsed.data.siteAddress,
      enquiry_source: parsed.data.enquirySource,
      client_brief: parsed.data.clientBrief ?? null,
      priority: parsed.data.priority,
      description: parsed.data.initialNotes ?? null,
      status: parsed.data.status,
    })
    .eq("id", projectId)
    .eq("organisation_id", organisationId);

  if (updateError) {
    console.error("[updateProject] Update failed:", updateError);
    return { error: updateError.message };
  }

  revalidatePath("/projects");
  revalidatePath("/dashboard");
  revalidatePath(`/projects/${projectId}`);
  redirect(`/projects/${projectId}`);
}
