import {
  getQuestionDefsForWorkAreaType,
  questionDefToDbFields,
  resolveWorkAreaTypeKey,
} from "@/lib/project-assistant-questions";
import { normalizeQuestionKey } from "@/lib/question-keys";
import { syncDiscoveryFactsToScopeAnswers } from "@/lib/sync-discovery-facts-to-answers";
import { logSupabaseError } from "@/lib/supabase/log-error";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type Supabase = SupabaseClient<Database>;

type ScopeWithType = {
  id: string;
  name: string;
  scope_types: { name: string } | null;
};

const SCHEMA_HINT =
  "Apply migration 019_align_scope_questions_schema.sql and 020_scope_questions_uniques.sql in Supabase.";

function isMissingQuestionColumnError(message: string): boolean {
  return (
    message.includes("Could not find the 'question' column") ||
    message.includes("column scope_questions.question does not exist")
  );
}

async function migrateLegacyQuestionKeys(
  supabase: Supabase,
  scopeId: string
): Promise<void> {
  const { data: rows } = await supabase
    .from("scope_questions")
    .select("id, question_key")
    .eq("project_scope_id", scopeId);

  for (const row of rows ?? []) {
    const normalized = normalizeQuestionKey(row.question_key);
    if (normalized && normalized !== row.question_key) {
      await supabase
        .from("scope_questions")
        .update({ question_key: normalized })
        .eq("id", row.id);
    }
  }
}

/**
 * Ensures rule-based scope_questions exist for a confirmed work area.
 * Idempotent by project_scope_id + question_key.
 */
export async function syncScopeQuestionsForScope(
  supabase: Supabase,
  organisationId: string,
  projectId: string,
  scope: ScopeWithType
): Promise<{ inserted: number; error: string | null }> {
  const typeKey = resolveWorkAreaTypeKey(scope.scope_types?.name, scope.name);
  const defs = getQuestionDefsForWorkAreaType(typeKey, scope.name);
  if (defs.length === 0) {
    return { inserted: 0, error: null };
  }

  await migrateLegacyQuestionKeys(supabase, scope.id);

  const { data: existing, error: existingError } = await supabase
    .from("scope_questions")
    .select("id, question, question_key")
    .eq("project_scope_id", scope.id);

  if (existingError) {
    logSupabaseError("syncScopeQuestionsForScope.existing", existingError);
    const message = existingError.message ?? "Could not read scope questions.";
    return {
      inserted: 0,
      error: isMissingQuestionColumnError(message)
        ? `${message} ${SCHEMA_HINT}`
        : message,
    };
  }

  const existingKeys = new Set(
    (existing ?? [])
      .map((q) => normalizeQuestionKey(q.question_key))
      .filter((key): key is string => Boolean(key))
  );

  for (const row of existing ?? []) {
    if (!row.question_key) {
      const def = defs.find((d) => d.text === row.question);
      if (def) {
        const fields = questionDefToDbFields(def);
        await supabase
          .from("scope_questions")
          .update({
            organisation_id: organisationId,
            question_key: fields.question_key,
            question_type: fields.question_type,
            options: fields.options,
            unit: fields.unit,
          })
          .eq("id", row.id);
        existingKeys.add(fields.question_key);
      }
    }
  }

  const toInsert = defs
    .filter((def) => !existingKeys.has(def.key))
    .map((def, index) => ({
      project_scope_id: scope.id,
      organisation_id: organisationId,
      sort_order: index,
      ...questionDefToDbFields(def),
    }));

  if (toInsert.length > 0) {
    const { error: insertError } = await supabase
      .from("scope_questions")
      .insert(toInsert);

    if (insertError) {
      logSupabaseError("syncScopeQuestionsForScope.insert", insertError);
      const message = insertError.message ?? "Could not create scope questions.";
      if (insertError.code === "23505") {
        return { inserted: 0, error: null };
      }
      return {
        inserted: 0,
        error: isMissingQuestionColumnError(message)
          ? `${message} ${SCHEMA_HINT}`
          : message,
      };
    }
  }

  return { inserted: toInsert.length, error: null };
}

/**
 * Ensures default questions exist for every confirmed work area on a project.
 */
export async function ensureQuestionsForProjectScopes(
  supabase: Supabase,
  organisationId: string,
  projectId: string
): Promise<{ error: string | null }> {
  const { data: scopes, error } = await supabase
    .from("project_scopes")
    .select("id, name, scope_types(name)")
    .eq("project_id", projectId)
    .eq("organisation_id", organisationId);

  if (error) {
    logSupabaseError("ensureQuestionsForProjectScopes", error);
    return { error: error.message ?? "Could not load work areas." };
  }

  for (const scope of scopes ?? []) {
    const scopeRow = {
      id: scope.id,
      name: scope.name,
      scope_types: scope.scope_types as { name: string } | null,
    };
    const result = await syncScopeQuestionsForScope(
      supabase,
      organisationId,
      projectId,
      scopeRow
    );
    if (result.error) {
      return { error: result.error };
    }
  }

  const syncResult = await syncDiscoveryFactsToScopeAnswers(
    supabase,
    organisationId,
    projectId
  );
  if (syncResult.error) {
    return { error: syncResult.error };
  }

  return { error: null };
}

/** @deprecated Use ensureQuestionsForProjectScopes */
export const ensureScopeQuestionsForProject = ensureQuestionsForProjectScopes;
