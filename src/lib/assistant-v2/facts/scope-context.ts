import { buildMergedAnswersForScope } from "@/lib/assistant-v2/build-merged-answers";
import type { ScopeForFactResolution } from "@/lib/assistant-v2/facts/resolve-fact-update";
import type { DiscoveryResult } from "@/lib/ai/discovery/types";
import { listScopeQuestionsForProject } from "@/lib/project-assistant-data";
import { resolveWorkAreaTypeKey } from "@/lib/project-assistant-questions";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type Supabase = SupabaseClient<Database>;

export async function loadScopeFactContext(
  supabase: Supabase,
  organisationId: string,
  projectId: string,
  discovery: DiscoveryResult | null = null
): Promise<ScopeForFactResolution[]> {
  const { data: scopes } = await supabase
    .from("project_scopes")
    .select("id, name, scope_types(name)")
    .eq("project_id", projectId)
    .eq("organisation_id", organisationId);

  if (!scopes?.length) return [];

  const scopeIds = scopes.map((s) => s.id);
  const { data: questions } = await listScopeQuestionsForProject(
    supabase,
    scopeIds
  );

  return scopes.map((scope) => {
    const typeKey = resolveWorkAreaTypeKey(
      scope.scope_types?.name ?? null,
      scope.name
    );
    const answers = buildMergedAnswersForScope(
      scope.id,
      scope.name,
      scope.scope_types?.name ?? null,
      questions ?? [],
      discovery
    );

    return {
      scopeId: scope.id,
      scopeName: scope.name,
      workAreaTypeKey: typeKey,
      answers,
    };
  });
}
