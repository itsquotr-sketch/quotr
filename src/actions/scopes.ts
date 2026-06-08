"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOrganisation } from "@/lib/auth";
import {
  PROJECTS_TABLE,
  combineScopeDescription,
} from "@/lib/projects-data";
import { createClient } from "@/lib/supabase/server";
import { projectStatusSchema } from "@/lib/validations/project";
import { scopeSchema, type ScopeActionState } from "@/lib/validations/scope";

export async function createScope(
  projectId: string,
  _prevState: ScopeActionState,
  formData: FormData
): Promise<ScopeActionState> {
  const { organisationId } = await requireOrganisation();

  const measurementsRaw = formData.get("measurements");
  let measurements: { label: string; value: string; unit?: string }[] = [];

  if (typeof measurementsRaw === "string" && measurementsRaw) {
    try {
      measurements = JSON.parse(measurementsRaw);
    } catch {
      return { error: "Invalid measurements data." };
    }
  }

  const isCustom = formData.get("isCustom") === "true";

  const raw = {
    scopeTypeId: formData.get("scopeTypeId") || undefined,
    isCustom,
    customScopeName: formData.get("customScopeName") || undefined,
    name: formData.get("name") || undefined,
    description: formData.get("description") || undefined,
    locationArea: formData.get("locationArea") || undefined,
    notes: formData.get("notes") || undefined,
    measurements,
  };

  const parsed = scopeSchema.safeParse(raw);
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const supabase = await createClient();

  const { data: project } = await supabase
    .from(PROJECTS_TABLE)
    .select("id")
    .eq("id", projectId)
    .eq("organisation_id", organisationId)
    .single();

  if (!project) {
    return { error: "Project not found." };
  }

  let scopeName = parsed.data.name?.trim() ?? "";
  let scopeTypeId: string | null = parsed.data.scopeTypeId ?? null;

  if (parsed.data.isCustom) {
    scopeName = parsed.data.customScopeName!.trim();
    scopeTypeId = null;
  } else if (scopeTypeId) {
    const { data: scopeType } = await supabase
      .from("scope_types")
      .select("name")
      .eq("id", scopeTypeId)
      .single();

    if (!scopeType) {
      return { error: "Scope type not found." };
    }
    scopeName = scopeName || scopeType.name;
  }

  const { count } = await supabase
    .from("project_scopes")
    .select("id", { count: "exact", head: true })
    .eq("job_id", projectId);

  const { data: scope, error: scopeError } = await supabase
    .from("project_scopes")
    .insert({
      job_id: projectId,
      organisation_id: organisationId,
      scope_type_id: scopeTypeId,
      name: scopeName,
      description: combineScopeDescription(
        parsed.data.description,
        parsed.data.notes
      ),
      location_area: parsed.data.locationArea ?? null,
      status: "capturing",
      sort_order: count ?? 0,
    })
    .select("id")
    .single();

  if (scopeError || !scope) {
    console.error("[createScope] Insert failed:", scopeError);
    return { error: scopeError?.message ?? "Could not save scope." };
  }

  if (parsed.data.measurements.length > 0) {
    const measurementRows = parsed.data.measurements.map((m, index) => ({
      project_scope_id: scope.id,
      label: m.label,
      value: m.value,
      unit: m.unit ?? null,
      sort_order: index,
    }));

    const { error: measurementError } = await supabase
      .from("scope_measurements")
      .insert(measurementRows);

    if (measurementError) {
      return { error: measurementError.message };
    }
  }

  const photoFiles = formData.getAll("photos") as File[];
  const validPhotos = photoFiles.filter(
    (file) => file instanceof File && file.size > 0
  );

  for (const photo of validPhotos) {
    const ext = photo.name.split(".").pop() ?? "jpg";
    const fileName = `${crypto.randomUUID()}.${ext}`;
    const storagePath = `${organisationId}/${projectId}/${scope.id}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from("scope-photos")
      .upload(storagePath, photo, {
        contentType: photo.type,
        upsert: false,
      });

    if (uploadError) {
      return { error: `Photo upload failed: ${uploadError.message}` };
    }

    const { error: photoRecordError } = await supabase
      .from("scope_photos")
      .insert({
        project_scope_id: scope.id,
        storage_path: storagePath,
        file_name: photo.name,
      });

    if (photoRecordError) {
      return { error: photoRecordError.message };
    }
  }

  const documentFiles = formData.getAll("documents") as File[];
  const validDocuments = documentFiles.filter(
    (file) => file instanceof File && file.size > 0
  );

  for (const doc of validDocuments) {
    const ext = doc.name.split(".").pop() ?? "pdf";
    const fileName = `${crypto.randomUUID()}.${ext}`;
    const storagePath = `${organisationId}/${projectId}/${scope.id}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from("scope-documents")
      .upload(storagePath, doc, {
        contentType: doc.type || "application/octet-stream",
        upsert: false,
      });

    if (uploadError) {
      return { error: `Document upload failed: ${uploadError.message}` };
    }

    const { error: docRecordError } = await supabase
      .from("scope_documents")
      .insert({
        project_scope_id: scope.id,
        storage_path: storagePath,
        file_name: doc.name,
        mime_type: doc.type || null,
      });

    if (docRecordError) {
      return { error: docRecordError.message };
    }
  }

  await supabase
    .from(PROJECTS_TABLE)
    .update({ status: projectStatusSchema.parse("scoping") })
    .eq("id", projectId)
    .eq("organisation_id", organisationId);

  revalidatePath(`/projects/${projectId}`);
  redirect(`/projects/${projectId}/scopes/${scope.id}`);
}
