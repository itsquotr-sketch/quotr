import { requireOrganisation } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function getSignedStorageUrl(
  bucket: "scope-photos" | "scope-documents" | "site-photos",
  storagePath: string
) {
  const { organisationId } = await requireOrganisation();

  if (!storagePath.startsWith(`${organisationId}/`)) {
    return null;
  }

  const supabase = await createClient();
  const { data } = await supabase.storage
    .from(bucket)
    .createSignedUrl(storagePath, 3600);

  return data?.signedUrl ?? null;
}
