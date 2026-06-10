import { parseDiscoveryRun, getLatestDiscoveryRun } from "@/lib/discovery-data";
import { getRelevantConstraints } from "@/lib/project-assistant-constraints";
import { resolveWorkAreaTypeKey } from "@/lib/project-assistant-questions";
import { normalizeQuestionKey } from "@/lib/question-keys";
import { listScopeQuestionsForProject } from "@/lib/project-assistant-data";
import { readAnswerValue } from "@/lib/scope-answer-format";
import type { Json } from "@/types/database";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type Supabase = SupabaseClient<Database>;

/**
 * Seeds constraint selections from discovery notes when none are saved yet.
 */
export async function syncConstraintsFromDiscovery(
  supabase: Supabase,
  organisationId: string,
  projectId: string,
  quickEstimateId: string,
  userId: string
): Promise<void> {
  const { count } = await supabase
    .from("project_estimate_driver_values")
    .select("id", { count: "exact", head: true })
    .eq("quick_estimate_id", quickEstimateId)
    .eq("organisation_id", organisationId);

  if ((count ?? 0) > 0) return;

  const { data: latestRun } = await getLatestDiscoveryRun(
    supabase,
    organisationId,
    projectId
  );
  const discovery = parseDiscoveryRun(latestRun ?? null);
  if (!discovery?.constraints.length) return;

  const { data: scopes } = await supabase
    .from("project_scopes")
    .select("id, name, scope_types(name)")
    .eq("project_id", projectId)
    .eq("organisation_id", organisationId);

  const scopeIds = (scopes ?? []).map((s) => s.id);
  const { data: questions } = await listScopeQuestionsForProject(
    supabase,
    scopeIds
  );

  const answeredQuestionKeys = new Set<string>();
  for (const q of questions ?? []) {
    const answer = readAnswerValue(
      q.scope_answers[0]?.answer,
      q.scope_answers[0]?.source
    ).trim();
    if (!answer) continue;
    const key = normalizeQuestionKey(q.question_key);
    if (key) answeredQuestionKeys.add(key);
  }

  const workAreaTypeKeys = (scopes ?? []).map((s) =>
    resolveWorkAreaTypeKey(
      (s.scope_types as { name: string } | null)?.name,
      s.name
    )
  );

  const allowed = new Set(
    getRelevantConstraints(workAreaTypeKeys, answeredQuestionKeys).map(
      (c) => c.slug
    )
  );

  const { data: drivers } = await supabase
    .from("estimate_drivers")
    .select("id, slug")
    .eq("is_active", true);

  const driverIdBySlug = new Map(
    (drivers ?? []).map((d) => [d.slug, d.id])
  );

  const driverIdsInserted = new Set<string>();

  const constraintDefs = getRelevantConstraints(
    workAreaTypeKeys,
    answeredQuestionKeys
  );

  for (const constraint of discovery.constraints) {
    if (!allowed.has(constraint.slug)) continue;

    const def = constraintDefs.find((c) => c.slug === constraint.slug);
    const driverSlug = def?.driverSlug;
    const driverId = driverSlug ? driverIdBySlug.get(driverSlug) : undefined;

    if (driverId && !driverIdsInserted.has(driverId)) {
      await supabase.from("project_estimate_drivers").insert({
        organisation_id: organisationId,
        project_id: projectId,
        quick_estimate_id: quickEstimateId,
        estimate_driver_id: driverId,
        created_by: userId,
      });
      driverIdsInserted.add(driverId);
    }

    await supabase.from("project_estimate_driver_values").insert({
      organisation_id: organisationId,
      project_id: projectId,
      quick_estimate_id: quickEstimateId,
      estimate_driver_id: null,
      constraint_key: constraint.slug,
      value: { selected: true, source: "notes" } as Json,
    });
  }
}
