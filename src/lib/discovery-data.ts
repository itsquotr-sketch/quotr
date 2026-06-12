import {
  buildDiscoveryQuestionsAndTrades,
  type DiscoveryResult,
} from "@/lib/ai/discovery";
import { logSupabaseError } from "@/lib/supabase/log-error";
import type { Json } from "@/types/database";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type Supabase = SupabaseClient<Database>;

function resultToJson(result: DiscoveryResult): {
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

function parseJsonArray<T>(value: Json | null): T[] {
  if (!value || !Array.isArray(value)) return [];
  return value as T[];
}

export async function getLatestDiscoveryEngineRun(
  supabase: Supabase,
  organisationId: string,
  projectId: string
) {
  const { data, error } = await supabase
    .from("discovery_runs")
    .select("*")
    .eq("organisation_id", organisationId)
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    logSupabaseError("getLatestDiscoveryEngineRun", error);
    return { data: null, error };
  }

  return { data, error: null };
}

export function parseDiscoveryEngineRun(
  row: Database["public"]["Tables"]["discovery_runs"]["Row"] | null
): DiscoveryResult | null {
  if (!row?.parsed_output || typeof row.parsed_output !== "object") {
    return null;
  }

  const parsed = row.parsed_output as DiscoveryResult & {
    risks?: DiscoveryResult["risks"];
    assumptions?: string[];
    qualityLevel?: DiscoveryResult["qualityLevel"];
    confidence?: number;
  };

  return {
    workAreas: parsed.workAreas ?? [],
    facts: parsed.facts ?? [],
    questions: parsed.questions ?? [],
    constraints: parsed.constraints ?? [],
    trades: parsed.trades ?? [],
    risks: parsed.risks ?? [],
    assumptions: parsed.assumptions ?? [],
    qualityLevel: parsed.qualityLevel,
    confidence: parsed.confidence,
    model: row.model,
    promptVersion: row.prompt_version,
  };
}

export async function getLatestDiscoveryRun(
  supabase: Supabase,
  organisationId: string,
  projectId: string
) {
  const { data, error } = await supabase
    .from("project_discovery_runs")
    .select("*")
    .eq("organisation_id", organisationId)
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    logSupabaseError("getLatestDiscoveryRun", error);
    return { data: null, error };
  }

  return { data, error: null };
}

export function parseDiscoveryRun(
  row: Database["public"]["Tables"]["project_discovery_runs"]["Row"] | null
): DiscoveryResult | null {
  if (!row) return null;

  return {
    workAreas: parseJsonArray(row.work_areas),
    facts: parseJsonArray(row.facts),
    questions: parseJsonArray(row.questions),
    constraints: parseJsonArray(row.constraints),
    trades: parseJsonArray(row.trades),
  };
}

/**
 * Updates questions and trades on the latest discovery run after work areas are confirmed.
 */
export async function refreshDiscoveryQuestionsAndTrades(
  supabase: Supabase,
  organisationId: string,
  projectId: string,
  workAreas: { typeKey: string; name: string }[]
): Promise<void> {
  const { data: latest } = await getLatestDiscoveryRun(
    supabase,
    organisationId,
    projectId
  );

  if (!latest) return;

  const { questions, trades } = buildDiscoveryQuestionsAndTrades(workAreas);
  const json = resultToJson({
    workAreas: parseJsonArray(latest.work_areas),
    facts: parseJsonArray(latest.facts),
    questions,
    constraints: parseJsonArray(latest.constraints),
    trades,
  });

  const { error } = await supabase
    .from("project_discovery_runs")
    .update({
      questions: json.questions,
      trades: json.trades,
    })
    .eq("id", latest.id)
    .eq("organisation_id", organisationId);

  if (error) {
    logSupabaseError("refreshDiscoveryQuestionsAndTrades", error);
  }
}
