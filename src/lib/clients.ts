import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

export async function findOrCreateClient(
  supabase: SupabaseClient<Database>,
  organisationId: string,
  name: string,
  phone?: string | null,
  email?: string | null
): Promise<string> {
  const trimmedName = name.trim();

  const { data: existing } = await supabase
    .from("clients")
    .select("id, phone, email")
    .eq("organisation_id", organisationId)
    .ilike("name", trimmedName)
    .maybeSingle();

  if (existing) {
    const updates: { phone?: string; email?: string } = {};
    if (phone && !existing.phone) updates.phone = phone;
    if (email && !existing.email) updates.email = email;

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
      phone: phone ?? null,
      email: email ?? null,
    })
    .select("id")
    .single();

  if (error || !created) {
    throw new Error(error?.message ?? "Could not create client.");
  }

  return created.id;
}
