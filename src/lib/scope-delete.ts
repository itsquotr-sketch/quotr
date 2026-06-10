import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type Supabase = SupabaseClient<Database>;

export async function removeScopeStorageFiles(
  supabase: Supabase,
  organisationId: string,
  storagePaths: { bucket: "scope-photos" | "scope-documents"; path: string }[]
): Promise<{ ok: true } | { ok: false; error: string }> {
  const byBucket = new Map<"scope-photos" | "scope-documents", string[]>();

  for (const item of storagePaths) {
    if (!item.path.startsWith(`${organisationId}/`)) {
      return { ok: false, error: "Invalid storage path for this organisation." };
    }
    const existing = byBucket.get(item.bucket) ?? [];
    existing.push(item.path);
    byBucket.set(item.bucket, existing);
  }

  for (const [bucket, paths] of byBucket) {
    if (paths.length === 0) continue;

    const { error } = await supabase.storage.from(bucket).remove(paths);
    if (error) {
      console.error("[removeScopeStorageFiles]", error.message);
      return {
        ok: false,
        error: `Could not delete files from storage: ${error.message}`,
      };
    }
  }

  return { ok: true };
}

/**
 * When a confirmed work area is deleted, mark the originating suggestion as rejected
 * so it does not remain in "converted" state. Match by scope name on converted suggestions.
 */
export async function rejectConvertedSuggestionForScope(
  supabase: Supabase,
  organisationId: string,
  projectId: string,
  scopeName: string
) {
  const { error } = await supabase
    .from("project_scope_suggestions")
    .update({ status: "rejected" })
    .eq("organisation_id", organisationId)
    .eq("project_id", projectId)
    .eq("status", "converted")
    .ilike("suggested_name", scopeName);

  if (error) {
    console.error("[rejectConvertedSuggestionForScope]", error.message);
  }
}
