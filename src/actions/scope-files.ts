"use server";

import { revalidatePath } from "next/cache";
import { requireOrganisation } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type DeleteFileResult =
  | { ok: true }
  | { ok: false; error: string };

async function deleteScopeFile(
  projectId: string,
  scopeId: string,
  fileId: string,
  table: "scope_photos" | "scope_documents",
  bucket: "scope-photos" | "scope-documents"
): Promise<DeleteFileResult> {
  const { organisationId } = await requireOrganisation();
  const supabase = await createClient();

  const { data: file } = await supabase
    .from(table)
    .select("*")
    .eq("id", fileId)
    .single();

  if (!file) {
    return { ok: false, error: "File not found." };
  }

  const { data: scope } = await supabase
    .from("project_scopes")
    .select("id")
    .eq("id", file.project_scope_id)
    .eq("project_id", projectId)
    .eq("organisation_id", organisationId)
    .single();

  if (!scope || scope.id !== scopeId) {
    return { ok: false, error: "File not found." };
  }

  if (!file.storage_path.startsWith(`${organisationId}/`)) {
    return { ok: false, error: "Invalid storage path." };
  }

  const { error: dbError } = await supabase
    .from(table)
    .delete()
    .eq("id", fileId);

  if (dbError) {
    return { ok: false, error: dbError.message };
  }

  const { error: storageError } = await supabase.storage
    .from(bucket)
    .remove([file.storage_path]);

  if (storageError) {
    const { error: restoreError } = await supabase.from(table).insert(file);
    if (restoreError) {
      console.error("[deleteScopeFile] Failed to restore DB record:", restoreError);
    }
    return { ok: false, error: storageError.message };
  }

  revalidatePath(`/projects/${projectId}/scopes/${scopeId}`);
  return { ok: true };
}

export async function deleteScopePhoto(
  projectId: string,
  scopeId: string,
  photoId: string
): Promise<DeleteFileResult> {
  return deleteScopeFile(
    projectId,
    scopeId,
    photoId,
    "scope_photos",
    "scope-photos"
  );
}

export async function deleteScopeDocument(
  projectId: string,
  scopeId: string,
  documentId: string
): Promise<DeleteFileResult> {
  return deleteScopeFile(
    projectId,
    scopeId,
    documentId,
    "scope_documents",
    "scope-documents"
  );
}
