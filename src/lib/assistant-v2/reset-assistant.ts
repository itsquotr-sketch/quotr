import { deleteAssistantMessagesForProject } from "@/lib/assistant-v2/assistant-messages-data";
import { logSupabaseError } from "@/lib/supabase/log-error";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type Supabase = SupabaseClient<Database>;

export async function resetAssistantState(
  supabase: Supabase,
  organisationId: string,
  projectId: string
): Promise<{ error: string | null }> {
  const { data: scopes, error: scopesError } = await supabase
    .from("project_scopes")
    .select("id")
    .eq("project_id", projectId)
    .eq("organisation_id", organisationId);

  if (scopesError) {
    logSupabaseError("resetAssistantState.scopes", scopesError);
    return { error: "Could not load work areas." };
  }

  const scopeIds = (scopes ?? []).map((s) => s.id);

  if (scopeIds.length > 0) {
    const { error: answersError } = await supabase
      .from("scope_answers")
      .delete()
      .in("project_scope_id", scopeIds);

    if (answersError) {
      logSupabaseError("resetAssistantState.answers", answersError);
      return { error: "Could not clear answers." };
    }
  }

  const { error: discoveryRunsError } = await supabase
    .from("discovery_runs")
    .delete()
    .eq("project_id", projectId)
    .eq("organisation_id", organisationId);

  if (discoveryRunsError) {
    logSupabaseError("resetAssistantState.discoveryRuns", discoveryRunsError);
    return { error: "Could not clear discovery." };
  }

  const { error: legacyDiscoveryError } = await supabase
    .from("project_discovery_runs")
    .delete()
    .eq("project_id", projectId)
    .eq("organisation_id", organisationId);

  if (legacyDiscoveryError) {
    logSupabaseError("resetAssistantState.legacyDiscovery", legacyDiscoveryError);
    return { error: "Could not clear discovery history." };
  }

  const { error: suggestionsError } = await supabase
    .from("project_scope_suggestions")
    .delete()
    .eq("project_id", projectId)
    .eq("organisation_id", organisationId);

  if (suggestionsError) {
    logSupabaseError("resetAssistantState.suggestions", suggestionsError);
    return { error: "Could not clear work area suggestions." };
  }

  const { error: messagesError } = await deleteAssistantMessagesForProject(
    supabase,
    organisationId,
    projectId
  );

  if (messagesError) {
    return { error: messagesError };
  }

  const { error: outputsError } = await supabase
    .from("discovery_outputs")
    .delete()
    .eq("project_id", projectId)
    .eq("organisation_id", organisationId);

  if (outputsError) {
    logSupabaseError("resetAssistantState.discoveryOutputs", outputsError);
    return { error: "Could not clear discovery outputs." };
  }

  const { data: quickEstimate } = await supabase
    .from("quick_estimates")
    .select("id")
    .eq("project_id", projectId)
    .eq("organisation_id", organisationId)
    .not("status", "in", '("archived","declined")')
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (quickEstimate?.id) {
    await supabase
      .from("quick_estimate_snapshots")
      .delete()
      .eq("quick_estimate_id", quickEstimate.id)
      .eq("organisation_id", organisationId);

    const { error: driversError } = await supabase
      .from("project_estimate_driver_values")
      .delete()
      .eq("quick_estimate_id", quickEstimate.id)
      .eq("organisation_id", organisationId);

    if (driversError) {
      logSupabaseError("resetAssistantState.drivers", driversError);
      return { error: "Could not clear constraints." };
    }

    const { error: estimateDriversError } = await supabase
      .from("project_estimate_drivers")
      .delete()
      .eq("quick_estimate_id", quickEstimate.id)
      .eq("organisation_id", organisationId);

    if (estimateDriversError) {
      logSupabaseError("resetAssistantState.estimateDrivers", estimateDriversError);
      return { error: "Could not clear estimate drivers." };
    }

    const { error: estimateError } = await supabase
      .from("quick_estimates")
      .update({
        status: "draft",
        estimated_cost_low: null,
        estimated_cost_high: null,
        recommended_sell_low: null,
        recommended_sell_high: null,
        expected_margin_percent: null,
        confidence_level: "low",
        quality_level: "unknown",
        budget_fit: "unknown",
        notes: null,
      })
      .eq("id", quickEstimate.id)
      .eq("organisation_id", organisationId);

    if (estimateError) {
      logSupabaseError("resetAssistantState.estimate", estimateError);
      return { error: "Could not reset estimate." };
    }
  }

  return { error: null };
}
