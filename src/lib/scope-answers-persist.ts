import {
  serializeScopeAnswer,
  sourceToColumn,
  type ScopeAnswerSource,
} from "@/lib/scope-answer-format";
import { logSupabaseError } from "@/lib/supabase/log-error";
import type { PostgrestError } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type Supabase = SupabaseClient<Database>;

function isMissingSourceColumn(error: PostgrestError): boolean {
  return (
    error.code === "PGRST204" && error.message.includes("'source'")
  );
}

function isMissingOrganisationIdColumn(error: PostgrestError): boolean {
  return (
    error.code === "PGRST204" &&
    error.message.includes("'organisation_id'")
  );
}

function isMissingDiscoverySourceCheck(error: PostgrestError): boolean {
  return (
    error.code === "23514" &&
    error.message.includes("scope_answers_source_check")
  );
}

function devLogPersist(payload: Record<string, unknown>): void {
  if (process.env.NODE_ENV !== "development") return;
  console.log("[dev:scopeAnswers.persist]", payload);
}

type PersistScopeAnswerParams = {
  organisationId: string;
  scopeQuestionId: string;
  projectScopeId: string;
  answer: string;
  source?: ScopeAnswerSource;
  unit?: string;
};

function buildAnswerRow(
  params: PersistScopeAnswerParams,
  serialized: string,
  columnSource: string
) {
  return {
    organisation_id: params.organisationId,
    scope_question_id: params.scopeQuestionId,
    project_scope_id: params.projectScopeId,
    answer: serialized,
    source: columnSource,
  };
}

/**
 * Saves one scope answer — upsert by scope_question_id (and project_scope_id when indexed).
 */
export async function persistScopeAnswer(
  supabase: Supabase,
  params: PersistScopeAnswerParams
): Promise<PostgrestError | null> {
  const source = params.source ?? "user";
  const serialized = serializeScopeAnswer(params.answer, {
    source,
    unit: params.unit,
  });
  const columnSource = sourceToColumn(source);
  const row = buildAnswerRow(params, serialized, columnSource);

  let { error } = await supabase
    .from("scope_answers")
    .upsert(row, { onConflict: "scope_question_id" });

  if (error?.code === "42P10" || error?.message.includes("ON CONFLICT")) {
    ({ error } = await supabase
      .from("scope_answers")
      .upsert(row, {
        onConflict: "project_scope_id,scope_question_id",
      }));
  }

  if (error && isMissingSourceColumn(error)) {
    ({ error } = await supabase.from("scope_answers").upsert(
      {
        organisation_id: row.organisation_id,
        scope_question_id: row.scope_question_id,
        project_scope_id: row.project_scope_id,
        answer: row.answer,
      } satisfies Database["public"]["Tables"]["scope_answers"]["Insert"],
      { onConflict: "scope_question_id" }
    ));
  }

  if (error && isMissingDiscoverySourceCheck(error)) {
    if (columnSource === "user_answered" || columnSource === "user_prompt") {
      ({ error } = await supabase.from("scope_answers").upsert(
        { ...row, source: "user" },
        { onConflict: "scope_question_id" }
      ));
    } else {
      ({ error } = await supabase.from("scope_answers").upsert(
        { ...row, source: "notes" },
        { onConflict: "scope_question_id" }
      ));
    }
  }

  if (!error) {
    const { data: savedRow } = await supabase
      .from("scope_answers")
      .select("id, source")
      .eq("scope_question_id", params.scopeQuestionId)
      .maybeSingle();

    devLogPersist({
      project_scope_id: params.projectScopeId,
      question_key: params.scopeQuestionId,
      answer_value: params.answer,
      answer_label: params.answer,
      source: savedRow?.source ?? columnSource,
      confidence: "confirmed",
      rowId: savedRow?.id ?? null,
    });
  }

  if (error?.code === "23505") {
    return updateExistingAnswer(supabase, params, serialized, columnSource);
  }

  if (error) {
    logSupabaseError("persistScopeAnswer.upsert", error);
  }

  return error;
}

async function updateExistingAnswer(
  supabase: Supabase,
  params: PersistScopeAnswerParams,
  serialized: string,
  columnSource: string
): Promise<PostgrestError | null> {
  const { data: existingRows, error: lookupError } = await supabase
    .from("scope_answers")
    .select("id")
    .eq("scope_question_id", params.scopeQuestionId)
    .order("created_at", { ascending: true });

  if (lookupError) {
    logSupabaseError("persistScopeAnswer.lookup", lookupError);
    return lookupError;
  }

  if ((existingRows?.length ?? 0) > 1) {
    const duplicateIds = existingRows!.slice(1).map((r) => r.id);
    await supabase.from("scope_answers").delete().in("id", duplicateIds);
  }

  const existing = existingRows?.[0];
  if (!existing) {
    return persistScopeAnswer(supabase, params);
  }

  let { error: updateError } = await supabase
    .from("scope_answers")
    .update({
      answer: serialized,
      source: columnSource,
      organisation_id: params.organisationId,
    })
    .eq("id", existing.id);

  if (updateError && isMissingSourceColumn(updateError)) {
    ({ error: updateError } = await supabase
      .from("scope_answers")
      .update({
        answer: serialized,
        organisation_id: params.organisationId,
      })
      .eq("id", existing.id));
  }

  if (updateError && isMissingOrganisationIdColumn(updateError)) {
    ({ error: updateError } = await supabase
      .from("scope_answers")
      .update({ answer: serialized, source: columnSource })
      .eq("id", existing.id));
  }

  if (updateError) {
    logSupabaseError("persistScopeAnswer.update", updateError);
  } else {
    devLogPersist({
      project_scope_id: params.projectScopeId,
      question_key: params.scopeQuestionId,
      answer_value: params.answer,
      answer_label: params.answer,
      source: columnSource,
      confidence: "confirmed",
      rowId: existing.id,
    });
  }

  return updateError;
}

export async function persistScopeAnswersBatch(
  supabase: Supabase,
  organisationId: string,
  answers: {
    scopeQuestionId: string;
    projectScopeId: string;
    answer: string;
    unit?: string;
  }[]
): Promise<PostgrestError | null> {
  for (const item of answers) {
    const error = await persistScopeAnswer(supabase, {
      organisationId,
      ...item,
      source: "user_answered",
    });
    if (error) {
      return error;
    }
  }
  return null;
}

