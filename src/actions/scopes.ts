"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOrganisation } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  validateDocumentFiles,
  validatePhotoFiles,
} from "@/lib/upload-validation";
import { syncScopeQuestionsForScope } from "@/lib/scope-questions-seed";
import { projectStatusSchema } from "@/lib/validations/project";
import {
  scopeSchema,
  updateScopeSchema,
  deleteScopeSchema,
  type ScopeActionState,
} from "@/lib/validations/scope";
import {
  rejectConvertedSuggestionForScope,
  removeScopeStorageFiles,
} from "@/lib/scope-delete";

export type DeleteScopeResult =
  | { success: true; message: string }
  | { error: string };

type UploadedFile = {
  bucket: "scope-photos" | "scope-documents";
  storagePath: string;
};

async function rollbackScopeCreation(
  supabase: Awaited<ReturnType<typeof createClient>>,
  scopeId: string,
  uploadedFiles: UploadedFile[]
) {
  for (const file of uploadedFiles) {
    await supabase.storage.from(file.bucket).remove([file.storagePath]);
  }

  await supabase.from("project_scopes").delete().eq("id", scopeId);
}

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

  const photoFiles = formData.getAll("photos") as File[];
  const validPhotos = photoFiles.filter(
    (file) => file instanceof File && file.size > 0
  );

  const documentFiles = formData.getAll("documents") as File[];
  const validDocuments = documentFiles.filter(
    (file) => file instanceof File && file.size > 0
  );

  const photoValidation = validatePhotoFiles(validPhotos);
  if (!photoValidation.ok) {
    return { error: photoValidation.error };
  }

  const documentValidation = validateDocumentFiles(validDocuments);
  if (!documentValidation.ok) {
    return { error: documentValidation.error };
  }

  const supabase = await createClient();

  const { data: project } = await supabase
    .from("projects")
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
    .eq("project_id", projectId);

  const { data: scope, error: scopeError } = await supabase
    .from("project_scopes")
    .insert({
      project_id: projectId,
      organisation_id: organisationId,
      scope_type_id: scopeTypeId,
      name: scopeName,
      description: parsed.data.description?.trim() || null,
      notes: parsed.data.notes?.trim() || null,
      location_area: parsed.data.locationArea ?? null,
      status: "capturing",
      sort_order: count ?? 0,
    })
    .select("id, name, scope_types(name)")
    .single();

  if (scopeError || !scope) {
    console.error("[createScope] Insert failed:", scopeError);
    return { error: scopeError?.message ?? "Could not save scope." };
  }

  await syncScopeQuestionsForScope(supabase, organisationId, projectId, {
    id: scope.id,
    name: scope.name,
    scope_types: scope.scope_types as { name: string } | null,
  });

  const uploadedFiles: UploadedFile[] = [];

  try {
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
        throw new Error(measurementError.message);
      }
    }

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
        throw new Error(`Photo upload failed: ${uploadError.message}`);
      }

      uploadedFiles.push({ bucket: "scope-photos", storagePath });

      const { error: photoRecordError } = await supabase
        .from("scope_photos")
        .insert({
          project_scope_id: scope.id,
          storage_path: storagePath,
          file_name: photo.name,
        });

      if (photoRecordError) {
        throw new Error(photoRecordError.message);
      }
    }

    for (const doc of validDocuments) {
      const ext = doc.name.split(".").pop() ?? "pdf";
      const fileName = `${crypto.randomUUID()}.${ext}`;
      const storagePath = `${organisationId}/${projectId}/${scope.id}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("scope-documents")
        .upload(storagePath, doc, {
          contentType: doc.type,
          upsert: false,
        });

      if (uploadError) {
        throw new Error(`Document upload failed: ${uploadError.message}`);
      }

      uploadedFiles.push({ bucket: "scope-documents", storagePath });

      const { error: docRecordError } = await supabase
        .from("scope_documents")
        .insert({
          project_scope_id: scope.id,
          storage_path: storagePath,
          file_name: doc.name,
          mime_type: doc.type || null,
        });

      if (docRecordError) {
        throw new Error(docRecordError.message);
      }
    }

    await supabase
      .from("projects")
      .update({ status: projectStatusSchema.parse("scoping") })
      .eq("id", projectId)
      .eq("organisation_id", organisationId);
  } catch (err) {
    await rollbackScopeCreation(supabase, scope.id, uploadedFiles);
    const message =
      err instanceof Error ? err.message : "Could not save scope.";
    return { error: message };
  }

  const { generateAssistantQuickEstimate } = await import(
    "@/actions/project-assistant"
  );
  await generateAssistantQuickEstimate(projectId, { silent: true });

  revalidatePath(`/projects/${projectId}`);
  redirect(`/projects/${projectId}/scopes/${scope.id}`);
}

export async function updateScope(
  projectId: string,
  scopeId: string,
  _prevState: ScopeActionState,
  formData: FormData
): Promise<ScopeActionState> {
  const { organisationId } = await requireOrganisation();

  const isCustom = formData.get("isCustom") === "true";

  const raw = {
    scopeTypeId: formData.get("scopeTypeId") || undefined,
    isCustom,
    customScopeName: formData.get("customScopeName") || undefined,
    name: formData.get("name") || undefined,
    description: formData.get("description") || undefined,
    locationArea: formData.get("locationArea") || undefined,
    notes: formData.get("notes") || undefined,
    status: formData.get("status"),
  };

  const parsed = updateScopeSchema.safeParse(raw);
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const supabase = await createClient();

  const { data: scope } = await supabase
    .from("project_scopes")
    .select("id")
    .eq("id", scopeId)
    .eq("project_id", projectId)
    .eq("organisation_id", organisationId)
    .single();

  if (!scope) {
    return { error: "Scope not found." };
  }

  let scopeName = parsed.data.name?.trim() ?? "";
  let scopeTypeId: string | null = parsed.data.scopeTypeId ?? null;

  if (parsed.data.isCustom) {
    scopeName = (parsed.data.customScopeName ?? parsed.data.name ?? "").trim();
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

  if (!scopeName) {
    return { error: "Scope name is required." };
  }

  const { error: updateError } = await supabase
    .from("project_scopes")
    .update({
      scope_type_id: scopeTypeId,
      name: scopeName,
      description: parsed.data.description?.trim() || null,
      notes: parsed.data.notes?.trim() || null,
      location_area: parsed.data.locationArea?.trim() || null,
      status: parsed.data.status,
      is_custom: parsed.data.isCustom,
    })
    .eq("id", scopeId)
    .eq("organisation_id", organisationId);

  if (updateError) {
    console.error("[updateScope] Update failed:", updateError);
    return { error: updateError.message };
  }

  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}/scopes/${scopeId}`);
  redirect(`/projects/${projectId}/scopes/${scopeId}`);
}

export async function deleteProjectScope(
  projectId: string,
  scopeId: string
): Promise<DeleteScopeResult> {
  const { organisationId } = await requireOrganisation();
  const parsed = deleteScopeSchema.safeParse({ scopeId });
  if (!parsed.success) {
    return { error: "Invalid work area." };
  }

  const supabase = await createClient();

  const { data: scope, error: scopeError } = await supabase
    .from("project_scopes")
    .select("id, name, project_id, organisation_id")
    .eq("id", parsed.data.scopeId)
    .eq("project_id", projectId)
    .eq("organisation_id", organisationId)
    .single();

  if (scopeError || !scope) {
    return { error: "Work area not found." };
  }

  const [{ data: photos }, { data: documents }] = await Promise.all([
    supabase
      .from("scope_photos")
      .select("storage_path")
      .eq("project_scope_id", scope.id),
    supabase
      .from("scope_documents")
      .select("storage_path")
      .eq("project_scope_id", scope.id),
  ]);

  const storagePaths = [
    ...(photos ?? []).map((p) => ({
      bucket: "scope-photos" as const,
      path: p.storage_path,
    })),
    ...(documents ?? []).map((d) => ({
      bucket: "scope-documents" as const,
      path: d.storage_path,
    })),
  ];

  if (storagePaths.length > 0) {
    const storageResult = await removeScopeStorageFiles(
      supabase,
      organisationId,
      storagePaths
    );
    if (!storageResult.ok) {
      return { error: storageResult.error };
    }
  }

  const { error: estimateItemsError } = await supabase
    .from("estimate_items")
    .delete()
    .eq("project_scope_id", scope.id);

  if (estimateItemsError) {
    console.error("[deleteProjectScope] estimate_items:", estimateItemsError);
    return { error: "Could not delete linked estimate items." };
  }

  await rejectConvertedSuggestionForScope(
    supabase,
    organisationId,
    projectId,
    scope.name
  );

  const { error: deleteError } = await supabase
    .from("project_scopes")
    .delete()
    .eq("id", scope.id)
    .eq("organisation_id", organisationId);

  if (deleteError) {
    console.error("[deleteProjectScope] delete:", deleteError);
    return { error: deleteError.message ?? "Could not delete work area." };
  }

  const { generateAssistantQuickEstimate } = await import(
    "@/actions/project-assistant"
  );
  await generateAssistantQuickEstimate(projectId, { silent: true });

  revalidatePath(`/projects/${projectId}`);
  return { success: true, message: `"${scope.name}" was deleted.` };
}
