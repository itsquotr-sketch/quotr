import { runProjectDiscovery } from "@/lib/ai/discovery";
import { recalculateQuickEstimate } from "@/lib/cost-engine/recalculate-quick-estimate";
import { ensureQuickEstimateForProject } from "@/lib/quick-estimate-data";
import {
  getLatestScopeBuilderInput,
  listScopeBuilderInputs,
} from "@/lib/scope-builder-data";
import { ensureQuestionsForProjectScopes } from "@/lib/scope-questions-seed";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type Supabase = SupabaseClient<Database>;

export type AssistantAnalysisResult = {
  success: boolean;
  error?: string;
  message?: string;
  analysingMode?: "ai" | "rules";
  usedFallback?: boolean;
};

async function getCombinedProjectNotes(
  supabase: Supabase,
  organisationId: string,
  projectId: string
): Promise<string> {
  const { data: inputs } = await listScopeBuilderInputs(
    supabase,
    organisationId,
    projectId
  );

  return (inputs ?? [])
    .map((i) => i.content.trim())
    .filter(Boolean)
    .join("\n\n---\n\n");
}

async function syncNotesToQuickEstimate(
  supabase: Supabase,
  organisationId: string,
  projectId: string,
  userId: string
) {
  const combined = await getCombinedProjectNotes(
    supabase,
    organisationId,
    projectId
  );

  const estimate = await ensureQuickEstimateForProject(
    supabase,
    organisationId,
    projectId,
    userId
  );

  if (!estimate) {
    return null;
  }

  if (combined) {
    await supabase
      .from("quick_estimates")
      .update({ source_notes: combined })
      .eq("id", estimate.id)
      .eq("organisation_id", organisationId);
  }

  return estimate;
}

export async function runAssistantAnalysis(
  supabase: Supabase,
  params: {
    organisationId: string;
    projectId: string;
    userId: string;
    forceRules?: boolean;
  }
): Promise<AssistantAnalysisResult> {
  const combinedNotes = await getCombinedProjectNotes(
    supabase,
    params.organisationId,
    params.projectId
  );

  if (!combinedNotes.trim()) {
    return {
      success: false,
      error: "Add and save project notes before analysing the project.",
    };
  }

  const estimate = await syncNotesToQuickEstimate(
    supabase,
    params.organisationId,
    params.projectId,
    params.userId
  );

  const { data: latestInput } = await getLatestScopeBuilderInput(
    supabase,
    params.organisationId,
    params.projectId
  );

  const discoveryResult = await runProjectDiscovery(supabase, {
    organisationId: params.organisationId,
    projectId: params.projectId,
    userId: params.userId,
    inputText: combinedNotes,
    sourceInputId: latestInput?.id ?? null,
    quickEstimateId: estimate?.id ?? null,
    forceRules: params.forceRules ?? false,
  });

  if (discoveryResult.error) {
    if (!params.forceRules) {
      const fallback = await runProjectDiscovery(supabase, {
        organisationId: params.organisationId,
        projectId: params.projectId,
        userId: params.userId,
        inputText: combinedNotes,
        sourceInputId: latestInput?.id ?? null,
        quickEstimateId: estimate?.id ?? null,
        forceRules: true,
      });

      if (!fallback.error) {
        await ensureQuestionsForProjectScopes(
          supabase,
          params.organisationId,
          params.projectId
        );
        await recalculateQuickEstimate(
          supabase,
          params.organisationId,
          params.projectId,
          { triggerEvent: "discovery_fallback" }
        );
        return {
          success: true,
          message:
            "Basic analysis complete — AI was unavailable but your notes were processed.",
          analysingMode: "rules",
          usedFallback: true,
        };
      }
    }

    return { success: false, error: discoveryResult.error };
  }

  const ensureResult = await ensureQuestionsForProjectScopes(
    supabase,
    params.organisationId,
    params.projectId
  );

  if (ensureResult.error) {
    return { success: false, error: ensureResult.error };
  }

  await recalculateQuickEstimate(
    supabase,
    params.organisationId,
    params.projectId,
    { triggerEvent: "discovery_complete" }
  );

  const { outcome } = discoveryResult;
  const analysingMode =
    outcome.provider.id === "openai" && !outcome.usedFallback
      ? "ai"
      : "rules";

  return {
    success: true,
    message: discoveryResult.message,
    analysingMode,
    usedFallback: outcome.usedFallback,
  };
}
