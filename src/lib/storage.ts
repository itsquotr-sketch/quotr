import { requireOrganisation } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/** Signed URL lifetime — 24 hours. */
export const SIGNED_URL_EXPIRY_SECONDS = 86_400;

export type SignedStorageUrlResult =
  | { ok: true; url: string }
  | { ok: false; error: string };

export async function getSignedStorageUrl(
  bucket: "scope-photos" | "scope-documents" | "site-photos",
  storagePath: string
): Promise<SignedStorageUrlResult> {
  const { organisationId } = await requireOrganisation();

  if (!storagePath.startsWith(`${organisationId}/`)) {
    return { ok: false, error: "Storage path is not in your organisation." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(storagePath, SIGNED_URL_EXPIRY_SECONDS);

  if (error || !data?.signedUrl) {
    return {
      ok: false,
      error: error?.message ?? "Could not generate a download link.",
    };
  }

  return { ok: true, url: data.signedUrl };
}
