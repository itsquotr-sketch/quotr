import { logSupabaseError } from "@/lib/supabase/log-error";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type Supabase = SupabaseClient<Database>;

export type EstimateSnapshotSummary = {
  id: string;
  triggerEvent: string | null;
  estimatedCostLow: number | null;
  estimatedCostHigh: number | null;
  centralEstimate: number | null;
  createdAt: string;
};

export async function getLatestEstimateSnapshots(
  supabase: Supabase,
  organisationId: string,
  quickEstimateId: string,
  limit = 2
): Promise<{ data: EstimateSnapshotSummary[]; error: string | null }> {
  const { data, error } = await supabase
    .from("quick_estimate_snapshots")
    .select(
      "id, trigger_event, estimated_cost_low, estimated_cost_high, central_estimate, created_at"
    )
    .eq("organisation_id", organisationId)
    .eq("quick_estimate_id", quickEstimateId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    logSupabaseError("getLatestEstimateSnapshots", error);
    return { data: [], error: "Could not load estimate history." };
  }

  return {
    data: (data ?? []).map((row) => ({
      id: row.id,
      triggerEvent: row.trigger_event,
      estimatedCostLow:
        row.estimated_cost_low != null ? Number(row.estimated_cost_low) : null,
      estimatedCostHigh:
        row.estimated_cost_high != null ? Number(row.estimated_cost_high) : null,
      centralEstimate:
        row.central_estimate != null ? Number(row.central_estimate) : null,
      createdAt: row.created_at,
    })),
    error: null,
  };
}
