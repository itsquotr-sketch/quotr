import { autosaveDevLog } from "@/lib/autosave/autosave-dev-log";
import { hasMeaningfulChange } from "@/lib/autosave/has-meaningful-change";
import { recalculateQuickEstimate } from "@/lib/cost-engine/recalculate-quick-estimate";
import { getProjectById } from "@/lib/projects-data";
import { ensureQuickEstimateForProject } from "@/lib/quick-estimate-data";
import { listScopeBuilderInputs } from "@/lib/scope-builder-data";
import { answerValueToString } from "@/lib/scope-answer-state";
import { persistScopeAnswersBatch } from "@/lib/scope-answers-persist";
import { ensureQuestionsForProjectScopes } from "@/lib/scope-questions-seed";
import { insertAssistantMessage } from "@/lib/assistant-v2/assistant-messages-data";
import { userFacingSupabaseError } from "@/lib/supabase/log-error";
import { scopeQuestionAnswerSchema } from "@/lib/validations/project-assistant";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type Supabase = SupabaseClient<Database>;

export type SaveScopeAnswerResult =
  | { success: true; message: string; changed: boolean }
  | { error: string };

export async function saveScopeAnswer(
  supabase: Supabase,
  params: {
    organisationId: string;
    projectId: string;
    userId: string;
    questionId: string;
    answer: string;
    skipRecalc?: boolean;
    skipThreadMessage?: boolean;
  }
): Promise<SaveScopeAnswerResult> {
  const parsed = scopeQuestionAnswerSchema.safeParse({
    questionId: params.questionId,
    answer: params.answer,
  });

  if (!parsed.success) {
    return { error: "Invalid answer." };
  }

  const { data: project, error: projectError } = await getProjectById(
    supabase,
    params.projectId,
    params.organisationId
  );

  if (projectError || !project) {
    return { error: "Project not found." };
  }

  const ensureResult = await ensureQuestionsForProjectScopes(
    supabase,
    params.organisationId,
    params.projectId
  );

  if (ensureResult.error) {
    return { error: ensureResult.error };
  }

  const { data: question } = await supabase
    .from("scope_questions")
    .select("id, project_scope_id")
    .eq("id", parsed.data.questionId)
    .single();

  if (!question) {
    return { error: "Question not found." };
  }

  const { data: scope } = await supabase
    .from("project_scopes")
    .select("id")
    .eq("id", question.project_scope_id)
    .eq("organisation_id", params.organisationId)
    .single();

  if (!scope) {
    return { error: "Work area not found." };
  }

  const { data: existing } = await supabase
    .from("scope_answers")
    .select("answer, source")
    .eq("scope_question_id", parsed.data.questionId)
    .maybeSingle();

  const existingValue =
    answerValueToString(existing?.answer ?? null, existing?.source ?? null) ??
    "";

  if (!hasMeaningfulChange(existingValue, parsed.data.answer)) {
    autosaveDevLog("autosave", "skipped — no value change");
    return { success: true, message: "No changes.", changed: false };
  }

  autosaveDevLog("autosave", "saving changed value");

  const persistError = await persistScopeAnswersBatch(
    supabase,
    params.organisationId,
    [
      {
        scopeQuestionId: parsed.data.questionId,
        projectScopeId: question.project_scope_id,
        answer: parsed.data.answer,
      },
    ]
  );

  if (persistError) {
    return {
      error: userFacingSupabaseError(
        persistError,
        "Could not save answer."
      ),
    };
  }

  const { data: inputs } = await listScopeBuilderInputs(
    supabase,
    params.organisationId,
    params.projectId
  );
  const combined = (inputs ?? [])
    .map((i) => i.content.trim())
    .filter(Boolean)
    .join("\n\n---\n\n");

  const estimate = await ensureQuickEstimateForProject(
    supabase,
    params.organisationId,
    params.projectId,
    params.userId
  );

  if (estimate && combined) {
    await supabase
      .from("quick_estimates")
      .update({ source_notes: combined })
      .eq("id", estimate.id)
      .eq("organisation_id", params.organisationId);
  }

  if (!params.skipThreadMessage) {
    await insertAssistantMessage(supabase, {
      organisationId: params.organisationId,
      projectId: params.projectId,
      userId: params.userId,
      role: "user",
      content: parsed.data.answer,
      metadata: {
        messageType: "answer",
        questionId: parsed.data.questionId,
      },
    });
  }

  if (!params.skipRecalc) {
    await recalculateQuickEstimate(
      supabase,
      params.organisationId,
      params.projectId,
      { triggerEvent: "answer_changed" }
    );
  }

  return { success: true, message: "Answer saved.", changed: true };
}
