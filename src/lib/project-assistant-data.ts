import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, ScopeQuestion } from "@/types/database";

type Supabase = SupabaseClient<Database>;

export type ScopeQuestionWithAnswers = ScopeQuestion & {
  scope_answers: {
    id: string;
    answer: string | null;
    source: string;
    updated_at: string;
  }[];
};

export async function listScopeQuestionsForProject(
  supabase: Supabase,
  scopeIds: string[]
): Promise<{ data: ScopeQuestionWithAnswers[]; error: Error | null }> {
  if (scopeIds.length === 0) {
    return { data: [], error: null };
  }

  const { data: questions, error: questionsError } = await supabase
    .from("scope_questions")
    .select("*")
    .in("project_scope_id", scopeIds)
    .order("sort_order", { ascending: true });

  if (questionsError) {
    return { data: [], error: questionsError };
  }

  const questionIds = (questions ?? []).map((q) => q.id);
  if (questionIds.length === 0) {
    return { data: [], error: null };
  }

  let { data: answers, error: answersError } = await supabase
    .from("scope_answers")
    .select("id, scope_question_id, answer, source, updated_at")
    .in("scope_question_id", questionIds);

  if (
    answersError?.code === "PGRST204" &&
    answersError.message.includes("'source'")
  ) {
    const fallback = await supabase
      .from("scope_answers")
      .select("id, scope_question_id, answer, updated_at")
      .in("scope_question_id", questionIds);
    answers = fallback.data?.map((a) => ({ ...a, source: "user" })) ?? null;
    answersError = fallback.error;
  }

  if (answersError) {
    return { data: [], error: answersError };
  }

  const answersByQuestion = new Map<
    string,
    { id: string; answer: string | null; source: string; updated_at: string }[]
  >();

  for (const answer of answers ?? []) {
    const list = answersByQuestion.get(answer.scope_question_id) ?? [];
    list.push({
      id: answer.id,
      answer: answer.answer,
      source: answer.source ?? "user",
      updated_at: answer.updated_at,
    });
    answersByQuestion.set(answer.scope_question_id, list);
  }

  for (const [questionId, list] of answersByQuestion.entries()) {
    list.sort(
      (a, b) =>
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    );
    answersByQuestion.set(questionId, list);
  }

  const combined: ScopeQuestionWithAnswers[] = (questions ?? []).map((q) => ({
    ...q,
    scope_answers: answersByQuestion.get(q.id) ?? [],
  }));

  return { data: combined, error: null };
}

export async function listDriverValuesForQuickEstimate(
  supabase: Supabase,
  organisationId: string,
  quickEstimateId: string
) {
  return supabase
    .from("project_estimate_driver_values")
    .select("*")
    .eq("organisation_id", organisationId)
    .eq("quick_estimate_id", quickEstimateId);
}
