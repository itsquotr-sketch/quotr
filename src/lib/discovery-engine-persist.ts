import { createHash } from "crypto";
import type { DiscoveryResult } from "@/lib/ai/discovery/types";
import { devLog } from "@/lib/dev-log";
import { logSupabaseError } from "@/lib/supabase/log-error";
import type { Json } from "@/types/database";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type Supabase = SupabaseClient<Database>;

function hashInputText(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function toConfidence(value: number | undefined): number | null {
  if (value == null || Number.isNaN(value)) {
    return null;
  }
  return Math.round(value * 100) / 100;
}

function buildDiscoveryOutputs(
  organisationId: string,
  projectId: string,
  discoveryRunId: string,
  result: DiscoveryResult
) {
  const rows: Database["public"]["Tables"]["discovery_outputs"]["Insert"][] =
    [];

  for (const workArea of result.workAreas) {
    rows.push({
      organisation_id: organisationId,
      project_id: projectId,
      discovery_run_id: discoveryRunId,
      output_type: "work_area",
      output_key: workArea.typeKey,
      title: workArea.name,
      content: workArea as unknown as Json,
      confidence: toConfidence(workArea.confidence),
      status: "pending",
    });
  }

  for (const fact of result.facts) {
    rows.push({
      organisation_id: organisationId,
      project_id: projectId,
      discovery_run_id: discoveryRunId,
      output_type: "fact",
      output_key: fact.key,
      title: fact.label,
      content: fact as unknown as Json,
      confidence: toConfidence(fact.confidence),
      status: "pending",
    });
  }

  for (const question of result.questions) {
    rows.push({
      organisation_id: organisationId,
      project_id: projectId,
      discovery_run_id: discoveryRunId,
      output_type: "question",
      output_key: question.key,
      title: question.text,
      content: question as unknown as Json,
      confidence: null,
      status: "pending",
    });
  }

  for (const constraint of result.constraints) {
    rows.push({
      organisation_id: organisationId,
      project_id: projectId,
      discovery_run_id: discoveryRunId,
      output_type: "constraint",
      output_key: constraint.slug,
      title: constraint.label,
      content: constraint as unknown as Json,
      confidence: toConfidence(constraint.confidence),
      status: "pending",
    });
  }

  for (const trade of result.trades) {
    rows.push({
      organisation_id: organisationId,
      project_id: projectId,
      discovery_run_id: discoveryRunId,
      output_type: "trade",
      output_key: `${trade.workAreaTypeKey}:${trade.name}`,
      title: trade.name,
      content: trade as unknown as Json,
      confidence: null,
      status: "pending",
    });
  }

  return rows;
}

/**
 * Persists a discovery run into discovery_runs + discovery_outputs.
 * Non-blocking — legacy project_discovery_runs flow continues if this fails.
 */
export async function persistDiscoveryEngineRun(
  supabase: Supabase,
  params: {
    organisationId: string;
    projectId: string;
    userId: string;
    inputText: string;
    provider: string;
    providerVersion: string;
    result: DiscoveryResult;
  }
): Promise<{ runId: string | null; error: string | null }> {
  const {
    organisationId,
    projectId,
    userId,
    inputText,
    provider,
    providerVersion,
    result,
  } = params;

  const inputHash = hashInputText(inputText);
  const parsedOutput = result as unknown as Json;

  const { data: run, error: runError } = await supabase
    .from("discovery_runs")
    .insert({
      organisation_id: organisationId,
      project_id: projectId,
      input_text: inputText || null,
      input_hash: inputHash,
      provider: provider === "rule-based" ? "rule_based" : provider,
      model: null,
      prompt_version: providerVersion || "rule_based_v1",
      raw_output: parsedOutput,
      parsed_output: parsedOutput,
      status: "completed",
      created_by: userId,
    })
    .select("id")
    .single();

  if (runError) {
    logSupabaseError("persistDiscoveryEngineRun.insertRun", runError);
    return { runId: null, error: runError.message };
  }

  const outputs = buildDiscoveryOutputs(
    organisationId,
    projectId,
    run.id,
    result
  );

  if (outputs.length > 0) {
    const { error: outputsError } = await supabase
      .from("discovery_outputs")
      .insert(outputs);

    if (outputsError) {
      logSupabaseError("persistDiscoveryEngineRun.insertOutputs", outputsError);
      return { runId: run.id, error: outputsError.message };
    }
  }

  devLog("discovery.engine.persisted", {
    runId: run.id,
    outputCount: outputs.length,
    inputHash,
  });

  return { runId: run.id, error: null };
}
