import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { ACTIVE_PROJECT_STATUSES } from "@/lib/constants/projects";

async function countProjectsByStatus(
  supabase: SupabaseClient<Database>,
  organisationId: string,
  statuses: readonly string[]
): Promise<number> {
  const { count, error } = await supabase
    .from("projects")
    .select("id", { count: "exact", head: true })
    .eq("organisation_id", organisationId)
    .in("status", [...statuses]);

  if (error) {
    console.error("[dashboard-metrics] countProjectsByStatus:", error);
    return 0;
  }

  return count ?? 0;
}

async function countScopesByEstimateStatus(
  supabase: SupabaseClient<Database>,
  organisationId: string,
  estimateStatuses: readonly string[]
): Promise<number> {
  const { count, error } = await supabase
    .from("project_scopes")
    .select("id", { count: "exact", head: true })
    .eq("organisation_id", organisationId)
    .in("estimate_status", [...estimateStatuses]);

  if (error) {
    console.error("[dashboard-metrics] countScopesByEstimateStatus:", error);
    return 0;
  }

  return count ?? 0;
}

export type DashboardMetrics = {
  activeProjects: number;
  quickEstimates: number;
  detailedEstimates: number;
  quotesReady: number;
};

/**
 * Dashboard counts use Supabase count() — never fetch-all-and-count in JS.
 *
 * Quick Estimates     → projects in scoping (capture complete, ballpark stage)
 * Detailed Estimates  → scopes with estimate in draft or review
 * Quotes Ready        → projects ready_to_quote
 */
export async function getDashboardMetrics(
  supabase: SupabaseClient<Database>,
  organisationId: string
): Promise<DashboardMetrics> {
  const [activeProjects, quickEstimates, detailedEstimates, quotesReady] =
    await Promise.all([
      countProjectsByStatus(supabase, organisationId, ACTIVE_PROJECT_STATUSES),
      countProjectsByStatus(supabase, organisationId, ["scoping"]),
      countScopesByEstimateStatus(supabase, organisationId, ["draft", "review"]),
      countProjectsByStatus(supabase, organisationId, ["ready_to_quote"]),
    ]);

  return {
    activeProjects,
    quickEstimates,
    detailedEstimates,
    quotesReady,
  };
}

export const DASHBOARD_METRIC_LABELS = {
  activeProjects: "Active Projects",
  quickEstimates: "Quick Estimates",
  detailedEstimates: "Detailed Estimates",
  quotesReady: "Quotes Ready",
} as const;
