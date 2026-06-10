import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

function normalizeWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function normalizeOptional(value?: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed || null;
}

export async function findOrCreateClient(
  supabase: SupabaseClient<Database>,
  organisationId: string,
  name: string,
  phone?: string | null,
  email?: string | null
): Promise<string> {
  const trimmedName = normalizeWhitespace(name);
  const normalizedPhone = normalizeOptional(phone);
  const normalizedEmail = normalizeOptional(email)?.toLowerCase() ?? null;

  const { data: existing } = await supabase
    .from("clients")
    .select("id, phone, email")
    .eq("organisation_id", organisationId)
    .ilike("name", trimmedName)
    .maybeSingle();

  if (existing) {
    const updates: { phone?: string; email?: string } = {};
    if (normalizedPhone && !existing.phone) updates.phone = normalizedPhone;
    if (normalizedEmail && !existing.email) updates.email = normalizedEmail;

    if (Object.keys(updates).length > 0) {
      await supabase.from("clients").update(updates).eq("id", existing.id);
    }
    return existing.id;
  }

  const { data: created, error } = await supabase
    .from("clients")
    .insert({
      organisation_id: organisationId,
      name: trimmedName,
      phone: normalizedPhone,
      email: normalizedEmail,
    })
    .select("id")
    .single();

  if (error || !created) {
    throw new Error(error?.message ?? "Could not create client.");
  }

  return created.id;
}
