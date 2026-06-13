import { listProjectAllowances } from "@/lib/assistant-v2/project-allowances-data";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type Supabase = SupabaseClient<Database>;

/** Suggestion confidence below this uses the softer discovery confirmation prompt. */
export const DISCOVERY_SUGGESTION_LOW_CONFIDENCE_THRESHOLD = 0.6;

export type AssistantProjectContext = {
  workAreaNames: string[];
  existingAllowanceKeys: string[];
  qualityLevel: string;
  confirmedWorkAreaCount: number;
  pendingSuggestionCount: number;
  hasDiscoveryRun: boolean;
};

export async function loadAssistantProjectContext(
  supabase: Supabase,
  organisationId: string,
  projectId: string
): Promise<AssistantProjectContext> {
  const [
    { data: scopes },
    { data: allowances },
    { data: pendingSuggestions },
    { data: estimate },
    { count: discoveryRunCount },
  ] = await Promise.all([
    supabase
      .from("project_scopes")
      .select("name")
      .eq("project_id", projectId)
      .eq("organisation_id", organisationId),
    listProjectAllowances(supabase, organisationId, projectId),
    supabase
      .from("project_scope_suggestions")
      .select("id")
      .eq("project_id", projectId)
      .eq("organisation_id", organisationId)
      .eq("status", "pending"),
    supabase
      .from("quick_estimates")
      .select("quality_level")
      .eq("project_id", projectId)
      .eq("organisation_id", organisationId)
      .maybeSingle(),
    supabase
      .from("discovery_runs")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectId)
      .eq("organisation_id", organisationId)
      .eq("status", "completed"),
  ]);

  return {
    workAreaNames: (scopes ?? []).map((s) => s.name),
    existingAllowanceKeys: (allowances ?? []).map((a) => a.allowance_key),
    qualityLevel: estimate?.quality_level ?? "unknown",
    confirmedWorkAreaCount: scopes?.length ?? 0,
    pendingSuggestionCount: pendingSuggestions?.length ?? 0,
    hasDiscoveryRun: (discoveryRunCount ?? 0) > 0,
  };
}

/**
 * Discovery mode runs scope extraction for new or incomplete projects.
 * Assistant command intents only apply once work areas are confirmed.
 */
export function shouldEnterDiscoveryMode(
  context: AssistantProjectContext
): boolean {
  if (context.confirmedWorkAreaCount === 0) {
    return true;
  }

  const hasDiscoveredScopes =
    context.pendingSuggestionCount > 0 || context.hasDiscoveryRun;

  if (!hasDiscoveredScopes) {
    return true;
  }

  return false;
}

export function buildDiscoveryAssistantText(input: {
  pendingSuggestions: { suggested_name: string; confidence: number | null }[];
  analyseSuccess: boolean;
  usedFallback?: boolean;
  needsClarification: boolean;
}): string {
  if (input.needsClarification) {
    return "I found some additional internal works, but I need to clarify what they involve before estimating them.";
  }

  if (input.pendingSuggestions.length > 0) {
    const maxConfidence = Math.max(
      ...input.pendingSuggestions.map((s) => Number(s.confidence ?? 0))
    );

    if (maxConfidence < DISCOVERY_SUGGESTION_LOW_CONFIDENCE_THRESHOLD) {
      return "I found possible work areas. Please confirm.";
    }

    return "I found these work areas. Confirm what should be included in this estimate.";
  }

  if (input.analyseSuccess) {
    return input.usedFallback
      ? "I used basic analysis — your notes are saved."
      : "Got it — I'm reviewing the scope.";
  }

  return "I found possible work areas. Please confirm.";
}
