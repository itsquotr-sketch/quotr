import type { DiscoveryRunResult } from "@/lib/ai/discovery/types";
import type { DiscoveryQuestion } from "@/lib/ai/discovery/types";
import { resolveWorkAreaTypeKey } from "@/lib/project-assistant-questions";
import { normalizeQuestionKey } from "@/lib/question-keys";
import { listActiveScopeSuggestionTypes } from "@/lib/scope-builder-data";
import { syncConstraintsFromDiscovery } from "@/lib/sync-discovery-constraints";
import { syncQualityLevelFromDiscovery } from "@/lib/sync-discovery-quality-level";
import { logSupabaseError } from "@/lib/supabase/log-error";
import type { Json } from "@/types/database";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type Supabase = SupabaseClient<Database>;

function discoveryQuestionsForScope(
  questions: DiscoveryQuestion[],
  workAreaTypeKey: string
): DiscoveryQuestion[] {
  return questions.filter((q) => q.workAreaTypeKey === workAreaTypeKey);
}

export async function applyWorkAreaSuggestions(
  supabase: Supabase,
  organisationId: string,
  projectId: string,
  userId: string,
  sourceInputId: string | null,
  result: DiscoveryRunResult
): Promise<{ inserted: number; error: string | null }> {
  if (result.workAreas.length === 0) {
    return { inserted: 0, error: null };
  }

  const { data: existingSuggestions, error: existingError } =
    await listActiveScopeSuggestionTypes(supabase, organisationId, projectId);

  if (existingError) {
    logSupabaseError("applyWorkAreaSuggestions.existing", existingError);
    return { inserted: 0, error: existingError.message };
  }

  const existingTypes = new Set(
    (existingSuggestions ?? []).map((item) => item.suggested_scope_type)
  );

  const toInsert = result.workAreas
    .filter((area) => !existingTypes.has(area.typeKey))
    .map((area) => ({
      organisation_id: organisationId,
      project_id: projectId,
      source_input_id: sourceInputId,
      suggested_scope_type: area.typeKey,
      suggested_name: area.name,
      suggested_description: area.description || null,
      suggested_location_area: area.locationArea,
      confidence: area.confidence,
      status: "pending" as const,
      created_by: userId,
    }));

  if (toInsert.length === 0) {
    return { inserted: 0, error: null };
  }

  const { error: insertError } = await supabase
    .from("project_scope_suggestions")
    .insert(toInsert);

  if (insertError) {
    logSupabaseError("applyWorkAreaSuggestions.insert", insertError);
    return { inserted: 0, error: insertError.message };
  }

  return { inserted: toInsert.length, error: null };
}

export async function syncDiscoveryQuestionsToScopes(
  supabase: Supabase,
  organisationId: string,
  projectId: string,
  result: DiscoveryRunResult
): Promise<{ inserted: number; error: string | null }> {
  if (result.questions.length === 0) {
    return { inserted: 0, error: null };
  }

  const { data: scopes, error: scopesError } = await supabase
    .from("project_scopes")
    .select("id, name, scope_types(name)")
    .eq("project_id", projectId)
    .eq("organisation_id", organisationId);

  if (scopesError) {
    logSupabaseError("syncDiscoveryQuestionsToScopes.scopes", scopesError);
    return { inserted: 0, error: scopesError.message };
  }

  let inserted = 0;

  for (const scope of scopes ?? []) {
    const typeKey = resolveWorkAreaTypeKey(
      (scope.scope_types as { name: string } | null)?.name,
      scope.name
    );
    const discoveryQuestions = discoveryQuestionsForScope(
      result.questions,
      typeKey
    );
    if (discoveryQuestions.length === 0) continue;

    const { data: existing } = await supabase
      .from("scope_questions")
      .select("id, question_key")
      .eq("project_scope_id", scope.id);

    const existingKeys = new Set(
      (existing ?? [])
        .map((q) => normalizeQuestionKey(q.question_key))
        .filter((key): key is string => Boolean(key))
    );

    const rows = discoveryQuestions
      .filter((q) => !existingKeys.has(normalizeQuestionKey(q.key) ?? q.key))
      .map((q, index) => ({
        project_scope_id: scope.id,
        organisation_id: organisationId,
        sort_order: (existing?.length ?? 0) + index,
        question: q.text,
        question_key: q.key,
        question_type: q.inputType,
        options: null as Json | null,
        unit: q.unit ?? null,
      }));

    if (rows.length === 0) continue;

    const { error: insertError } = await supabase
      .from("scope_questions")
      .insert(rows);

    if (insertError) {
      if (insertError.code === "23505") continue;
      logSupabaseError("syncDiscoveryQuestionsToScopes.insert", insertError);
      return { inserted, error: insertError.message };
    }

    inserted += rows.length;
  }

  return { inserted, error: null };
}

export async function applyDiscoveryResults(
  supabase: Supabase,
  params: {
    organisationId: string;
    projectId: string;
    userId: string;
    sourceInputId: string | null;
    quickEstimateId: string | null;
    result: DiscoveryRunResult;
  }
): Promise<{ error: string | null }> {
  const {
    organisationId,
    projectId,
    userId,
    sourceInputId,
    quickEstimateId,
    result,
  } = params;

  const suggestionResult = await applyWorkAreaSuggestions(
    supabase,
    organisationId,
    projectId,
    userId,
    sourceInputId,
    result
  );
  if (suggestionResult.error) {
    return { error: suggestionResult.error };
  }

  const questionResult = await syncDiscoveryQuestionsToScopes(
    supabase,
    organisationId,
    projectId,
    result
  );
  if (questionResult.error) {
    return { error: questionResult.error };
  }

  if (quickEstimateId) {
    await syncConstraintsFromDiscovery(
      supabase,
      organisationId,
      projectId,
      quickEstimateId,
      userId
    );
    await syncQualityLevelFromDiscovery(
      supabase,
      organisationId,
      quickEstimateId,
      result.qualityLevel
    );
  }

  return { error: null };
}
