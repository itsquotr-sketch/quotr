import { createHash } from "crypto";
import { applyDiscoveryResults } from "@/lib/ai/discovery/apply-discovery-results";
import { enrichDiscoveryContext } from "@/lib/ai/discovery/build-discovery-context";
import { discoverProjectWithPreferredProvider } from "@/lib/ai/discovery/discover-project";
import { DISCOVERY_PROMPT_VERSION } from "@/lib/ai/discovery/prompts";
import type { DiscoveryRunContext, DiscoveryRunOutcome } from "@/lib/ai/discovery/types";
import { devLog } from "@/lib/dev-log";
import type { DiscoveryResult } from "@/lib/discovery/types";
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

function buildDiscoveryOutputs(
  organisationId: string,
  projectId: string,
  discoveryRunId: string,
  outcome: DiscoveryRunOutcome
) {
  const { result } = outcome;
  const rows: Database["public"]["Tables"]["discovery_outputs"]["Insert"][] =
    [];

  const push = (
    outputType: Database["public"]["Tables"]["discovery_outputs"]["Insert"]["output_type"],
    outputKey: string,
    title: string | null,
    content: unknown,
    confidence: number | null
  ) => {
    rows.push({
      organisation_id: organisationId,
      project_id: projectId,
      discovery_run_id: discoveryRunId,
      output_type: outputType,
      output_key: outputKey,
      title,
      content: content as Json,
      confidence,
      status: "pending",
    });
  };

  for (const workArea of result.workAreas) {
    push(
      "work_area",
      workArea.typeKey,
      workArea.name,
      workArea,
      workArea.confidence
    );
  }
  for (const fact of result.facts) {
    push("fact", fact.key, fact.label, fact, fact.confidence);
  }
  for (const question of result.questions) {
    push("question", question.key, question.text, question, null);
  }
  for (const constraint of result.constraints) {
    push(
      "constraint",
      constraint.slug,
      constraint.label,
      constraint,
      constraint.confidence
    );
  }
  for (const trade of result.trades) {
    push(
      "trade",
      `${trade.workAreaTypeKey}:${trade.name}`,
      trade.name,
      trade,
      null
    );
  }
  for (const risk of result.risks) {
    push("risk", risk.title, risk.title, risk, null);
  }
  for (const assumption of result.assumptions) {
    push("assumption", assumption, assumption, { text: assumption }, null);
  }

  return rows;
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
  }
): Promise<ProjectDiscoveryRunResult> {
  const {
    organisationId,
    projectId,
    userId,
    inputText,
    sourceInputId,
    quickEstimateId,
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

  const outcome = await discoverProjectWithPreferredProvider(enrichedContext);

  devLog("discovery.run.outcome", {
    provider: outcome.provider.id,
    usedFallback: outcome.usedFallback,
    fallbackReason: outcome.fallbackReason,
    confidence: outcome.result.confidence,
    workAreas: outcome.result.workAreas.length,
    constraints: outcome.result.constraints.length,
  });

  const parsedOutput = outcome.result as unknown as Json;
  const rawOutput = (outcome.rawOutput ?? outcome.result) as Json;

  if (pendingRun?.id) {
    const { error: updateError } = await supabase
      .from("discovery_runs")
      .update({
        provider: outcome.attemptedProviderId ?? outcome.provider.id,
        model: outcome.result.model,
        prompt_version: outcome.result.promptVersion,
        raw_output: rawOutput,
        parsed_output: parsedOutput,
        status:
          outcome.usedFallback && outcome.attemptedProviderId === "openai"
            ? "failed"
            : "completed",
        error_message: outcome.usedFallback ? outcome.fallbackReason ?? null : null,
      })
      .eq("id", pendingRun.id)
      .eq("organisation_id", organisationId);

    if (updateError) {
      logSupabaseError("runProjectDiscovery.updateRun", updateError);
    }

    const outputs = buildDiscoveryOutputs(
      organisationId,
      projectId,
      pendingRun.id,
      outcome
    );

    if (outputs.length > 0) {
      const { error: outputsError } = await supabase
        .from("discovery_outputs")
        .insert(outputs);

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
