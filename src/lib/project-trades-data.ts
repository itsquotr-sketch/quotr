import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, ProjectTrade } from "@/types/database";

type Supabase = SupabaseClient<Database>;

export async function listProjectTrades(
  supabase: Supabase,
  organisationId: string,
  projectId: string
): Promise<{ data: ProjectTrade[]; error: Error | null }> {
  const { data, error } = await supabase
    .from("project_trades")
    .select("*")
    .eq("organisation_id", organisationId)
    .eq("project_id", projectId)
    .eq("is_active", true)
    .order("created_at", { ascending: true });

  return { data: data ?? [], error: error ? new Error(error.message) : null };
}
