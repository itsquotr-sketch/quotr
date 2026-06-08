"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOrganisation } from "@/lib/auth";
import { findOrCreateClient } from "@/lib/clients";
import { PROJECTS_TABLE } from "@/lib/projects-data";
import { createClient } from "@/lib/supabase/server";
import {
  DEFAULT_PROJECT_STATUS,
  projectSchema,
  projectStatusSchema,
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
    .from(PROJECTS_TABLE)
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
