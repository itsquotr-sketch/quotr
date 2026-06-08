import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

export async function findOrCreateClient(
  supabase: SupabaseClient<Database>,
  organisationId: string,
  name: string,
  phone?: string | null
): Promise<string> {
  const trimmedName = name.trim();

  const { data: existing } = await supabase
    .from("clients")
    .select("id, phone")
    .eq("organisation_id", organisationId)
    .ilike("name", trimmedName)
    .maybeSingle();

  if (existing) {
    if (phone && !existing.phone) {
      await supabase
        .from("clients")
        .update({ phone })
        .eq("id", existing.id);
    }
    return existing.id;
  }

  const { data: created, error } = await supabase
    .from("clients")
    .insert({
      organisation_id: organisationId,
      name: trimmedName,
      phone: phone ?? null,
    })
    .select("id")
    .single();

  if (error || !created) {
    throw new Error(error?.message ?? "Could not create client.");
  }

  return created.id;
}
