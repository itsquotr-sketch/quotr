import { createHash } from "crypto";
import type { DiscoveryResult } from "@/lib/ai/discovery/types";
import { buildDiscoveryOutputRows } from "@/lib/ai/discovery/build-discovery-outputs";
import { devLog } from "@/lib/dev-log";
import { logSupabaseError } from "@/lib/supabase/log-error";
import type { Json } from "@/types/database";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type Supabase = SupabaseClient<Database>;

function hashInputText(text: string): string {
  return createHash("sha256").update(text).digest("hex");
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

  const outputs = buildDiscoveryOutputRows(
    organisationId,
    projectId,
    run.id,
    result
  );

  if (outputs.length > 0) {
    const { error: outputsError } = await supabase
      .from("discovery_outputs")
      .upsert(outputs, {
        onConflict: "discovery_run_id,output_type,output_key",
        ignoreDuplicates: false,
      });

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
