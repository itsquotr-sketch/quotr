import { createHash } from "crypto";
import { applyDiscoveryResults } from "@/lib/ai/discovery/apply-discovery-results";
import { enrichDiscoveryContext } from "@/lib/ai/discovery/build-discovery-context";
import { buildDiscoveryOutputRowsFromOutcome } from "@/lib/ai/discovery/build-discovery-outputs";
import { discoverProjectWithPreferredProvider, discoverProjectWithRulesProvider } from "@/lib/ai/discovery/discover-project";
import { validateDiscoveryResult } from "@/lib/ai/discovery/parse-discovery-output";
import { buildRuleBasedFallbackOutcome } from "@/lib/ai/discovery/rule-based-discovery-provider";
import { DISCOVERY_PROMPT_VERSION } from "@/lib/ai/discovery/prompts";
import type { DiscoveryRunContext, DiscoveryRunOutcome } from "@/lib/ai/discovery/types";
import { devLog } from "@/lib/dev-log";
import type { DiscoveryResult } from "@/lib/ai/discovery/types";
import { logSupabaseError } from "@/lib/supabase/log-error";
import type { Json } from "@/types/database";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type Supabase = SupabaseClient<Database>;

function hashInputText(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function resultToLegacyJson(result: DiscoveryResult): {
  work_areas: Json;
  facts: Json;
  questions: Json;
  constraints: Json;
  trades: Json;
} {
  return {
    work_areas: result.workAreas as unknown as Json,
    facts: result.facts as unknown as Json,
    questions: result.questions as unknown as Json,
    constraints: result.constraints as unknown as Json,
    trades: result.trades as unknown as Json,
  };
}

async function persistLegacyDiscoveryRun(
  supabase: Supabase,
  organisationId: string,
  projectId: string,
  sourceNotes: string,
  outcome: DiscoveryRunOutcome
) {
  const json = resultToLegacyJson(outcome.result);
  const { error } = await supabase.from("project_discovery_runs").insert({
    organisation_id: organisationId,
    project_id: projectId,
    source_notes: sourceNotes || null,
    provider: outcome.provider.id,
    provider_version: outcome.result.promptVersion,
    ...json,
  });

  if (error) {
    logSupabaseError("persistLegacyDiscoveryRun", error);
  }
}

export type ProjectDiscoveryRunResult = {
  outcome: DiscoveryRunOutcome;
  discoveryRunId: string | null;
  error: string | null;
  message: string;
};

export async function runProjectDiscovery(
  supabase: Supabase,
  params: {
    organisationId: string;
    projectId: string;
    userId: string;
    inputText: string;
    sourceInputId: string | null;
    quickEstimateId: string | null;
    forceRules?: boolean;
  }
): Promise<ProjectDiscoveryRunResult> {
  const {
    organisationId,
    projectId,
    userId,
    inputText,
    sourceInputId,
    quickEstimateId,
    forceRules = false,
  } = params;

  const context: DiscoveryRunContext = {
    projectId,
    organisationId,
    userId,
    inputText,
  };

  const inputHash = hashInputText(inputText);

  const { data: pendingRun, error: pendingError } = await supabase
    .from("discovery_runs")
    .insert({
      organisation_id: organisationId,
      project_id: projectId,
      input_text: inputText || null,
      input_hash: inputHash,
      provider: "pending",
      model: null,
      prompt_version: DISCOVERY_PROMPT_VERSION,
      status: "running",
      created_by: userId,
    })
    .select("id")
    .single();

  if (pendingError) {
    logSupabaseError("runProjectDiscovery.createRun", pendingError);
  }

  const enrichedContext = await enrichDiscoveryContext(
    supabase,
    organisationId,
    context
  );

  let outcome = forceRules
    ? await discoverProjectWithRulesProvider(enrichedContext)
    : await discoverProjectWithPreferredProvider(enrichedContext);

  let validationError: string | null = null;
  const validation = validateDiscoveryResult(outcome.result);

  if (!validation.success) {
    validationError = validation.error;
    devLog("discovery.run.validationFailed", {
      error: validationError,
      provider: outcome.provider.id,
    });

    if (!forceRules) {
      outcome = buildRuleBasedFallbackOutcome(
        enrichedContext,
        `AI output failed validation: ${validationError}`,
        outcome.attemptedProviderId ?? outcome.provider.id
      );
    } else if (pendingRun?.id) {
      await supabase
        .from("discovery_runs")
        .update({
          status: "failed",
          error_message: validationError,
        })
        .eq("id", pendingRun.id)
        .eq("organisation_id", organisationId);

      return {
        outcome,
        discoveryRunId: pendingRun.id,
        error: validationError,
        message: "Discovery failed — output did not pass validation.",
      };
    }
  }

  devLog("discovery.run.outcome", {
    provider: outcome.provider.id,
    usedFallback: outcome.usedFallback,
    fallbackReason: outcome.fallbackReason,
    confidence: outcome.result.confidence,
    workAreas: outcome.result.workAreas.length,
    constraints: outcome.result.constraints.length,
    validationError,
  });

  const parsedOutput = outcome.result as unknown as Json;
  const rawOutput = (outcome.rawOutput ?? outcome.result) as Json;

  if (pendingRun?.id) {
    const runFailed =
      (outcome.usedFallback && outcome.attemptedProviderId === "openai") ||
      (validationError !== null && forceRules);

    const { error: updateError } = await supabase
      .from("discovery_runs")
      .update({
        provider: outcome.attemptedProviderId ?? outcome.provider.id,
        model: outcome.result.model,
        prompt_version: outcome.result.promptVersion,
        raw_output: rawOutput,
        parsed_output: parsedOutput,
        status: runFailed ? "failed" : "completed",
        error_message: outcome.usedFallback
          ? outcome.fallbackReason ?? validationError
          : validationError,
      })
      .eq("id", pendingRun.id)
      .eq("organisation_id", organisationId);

    if (updateError) {
      logSupabaseError("runProjectDiscovery.updateRun", updateError);
    }

    const outputs = buildDiscoveryOutputRowsFromOutcome(
      organisationId,
      projectId,
      pendingRun.id,
      outcome
    );

    if (outputs.length > 0) {
      const { error: outputsError } = await supabase
        .from("discovery_outputs")
        .upsert(outputs, {
          onConflict: "discovery_run_id,output_type,output_key",
          ignoreDuplicates: false,
        });

      if (outputsError) {
        logSupabaseError("runProjectDiscovery.insertOutputs", outputsError);
      }
    }
  }

  await persistLegacyDiscoveryRun(
    supabase,
    organisationId,
    projectId,
    inputText,
    outcome
  );

  const applyError = await applyDiscoveryResults(supabase, {
    organisationId,
    projectId,
    userId,
    sourceInputId,
    quickEstimateId,
    result: outcome.result,
    inputText,
  });

  const message = outcome.usedFallback
    ? "Quotr used basic analysis because AI analysis was unavailable."
    : outcome.result.workAreas.length > 0
      ? "Discovery complete — review suggested work areas, facts, and constraints."
      : "Analysis complete — add more detail to your notes if needed.";

  return {
    outcome,
    discoveryRunId: pendingRun?.id ?? null,
    error: applyError.error,
    message,
  };
}
