import { resolveQuestionDef, resolveWorkAreaTypeKey } from "@/lib/project-assistant-questions";
import { normalizeQuestionKey } from "@/lib/question-keys";
import type { ScopeQuestionWithAnswers } from "@/lib/project-assistant-data";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type Supabase = SupabaseClient<Database>;

export function isSyntheticQuestionId(questionId: string): boolean {
  return questionId.startsWith("synthetic-");
}

export function findScopeQuestionByKey(
  scopeQuestions: ScopeQuestionWithAnswers[],
  projectScopeId: string,
  questionKey: string
): ScopeQuestionWithAnswers | undefined {
  const normalized = normalizeQuestionKey(questionKey);
  if (!normalized) return undefined;

  return scopeQuestions.find(
    (q) =>
      q.project_scope_id === projectScopeId &&
      normalizeQuestionKey(q.question_key) === normalized
  );
}

function logAnswerResolve(payload: Record<string, unknown>): void {
  if (process.env.NODE_ENV !== "development") return;
  console.log("[assistant.answer.resolve]", payload);
}

/**
 * Resolves a pricing question id to a persisted scope_questions row.
 * Synthetic ids are mapped via project_scope_id + canonical question_key.
 */
export async function resolveScopeQuestionIdForSave(
  supabase: Supabase,
  params: {
    organisationId: string;
    projectId: string;
    questionId: string;
    questionKey: string;
    projectScopeId: string;
  }
): Promise<
  | { questionId: string; projectScopeId: string; questionKey: string }
  | { error: string }
> {
  const normalizedKey = normalizeQuestionKey(params.questionKey);
  if (!normalizedKey) {
    return { error: "Invalid question key." };
  }

  const { data: scope } = await supabase
    .from("project_scopes")
    .select("id, name, scope_types(name)")
    .eq("id", params.projectScopeId)
    .eq("organisation_id", params.organisationId)
    .eq("project_id", params.projectId)
    .maybeSingle();

  if (!scope) {
    return { error: "Work area not found." };
  }

  if (!isSyntheticQuestionId(params.questionId)) {
    const { data: question, error } = await supabase
      .from("scope_questions")
      .select("id, project_scope_id, question_key")
      .eq("id", params.questionId)
      .maybeSingle();

    if (error || !question) {
      return { error: "Question not found." };
    }

    if (question.project_scope_id !== params.projectScopeId) {
      return { error: "Question not found." };
    }

    logAnswerResolve({
      mode: "existing_id",
      questionId: question.id,
      questionKey: normalizeQuestionKey(question.question_key) ?? normalizedKey,
      projectScopeId: question.project_scope_id,
    });

    return {
      questionId: question.id,
      projectScopeId: question.project_scope_id,
      questionKey: normalizeQuestionKey(question.question_key) ?? normalizedKey,
    };
  }

  const { data: byKey } = await supabase
    .from("scope_questions")
    .select("id, project_scope_id, question_key")
    .eq("project_scope_id", params.projectScopeId)
    .eq("question_key", normalizedKey)
    .maybeSingle();

  if (byKey) {
    logAnswerResolve({
      mode: "lookup_by_key",
      questionId: byKey.id,
      questionKey: normalizedKey,
      projectScopeId: byKey.project_scope_id,
    });
    return {
      questionId: byKey.id,
      projectScopeId: byKey.project_scope_id,
      questionKey: normalizedKey,
    };
  }

  const typeKey = resolveWorkAreaTypeKey(
    (scope.scope_types as { name: string } | null)?.name,
    scope.name
  );
  const def = resolveQuestionDef(
    { question: normalizedKey, question_key: normalizedKey },
    typeKey
  );

  const { data: inserted, error: insertError } = await supabase
    .from("scope_questions")
    .insert({
      project_scope_id: params.projectScopeId,
      organisation_id: params.organisationId,
      question_key: normalizedKey,
      question: def?.text ?? normalizedKey,
      question_type: def?.inputType ?? "text",
      options: def?.options ?? null,
      unit: def?.unit ?? null,
      sort_order: 999,
    })
    .select("id, project_scope_id, question_key")
    .single();

  if (insertError || !inserted) {
    return { error: "Question not found." };
  }

  logAnswerResolve({
    mode: "inserted",
    questionId: inserted.id,
    questionKey: normalizedKey,
    projectScopeId: inserted.project_scope_id,
  });

  return {
    questionId: inserted.id,
    projectScopeId: inserted.project_scope_id,
    questionKey: normalizedKey,
  };
}
