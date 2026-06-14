import { recalculateQuickEstimate } from "@/lib/cost-engine/recalculate-quick-estimate";
import { insertAssistantMessage } from "@/lib/assistant-v2/assistant-messages-data";
import { saveQualityLevel } from "@/lib/assistant-v2/save-quality-level";
import { getProjectById } from "@/lib/projects-data";
import { persistConstraintAssessmentBatch } from "@/lib/project-constraints-persist";
import { ensureQuickEstimateForProject } from "@/lib/quick-estimate-data";
import { listScopeBuilderInputs } from "@/lib/scope-builder-data";
import { answerValueToString } from "@/lib/scope-answer-state";
import { persistScopeAnswersBatch } from "@/lib/scope-answers-persist";
import { ensureQuestionsForProjectScopes } from "@/lib/scope-questions-seed";
import { hasMeaningfulChange } from "@/lib/autosave/has-meaningful-change";
import { userFacingConstraintPersistError } from "@/lib/supabase/log-error";
import type { QualityLevel } from "@/lib/constants/quality-level";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type Supabase = SupabaseClient<Database>;

export type BatchScopeAnswer = {
  questionId: string;
  questionKey: string;
  answer: string;
  label: string;
};

export type BatchConstraintSelection = {
  slug: string;
  label: string;
  apply: boolean;
};

export async function batchSaveScopeAnswers(
  supabase: Supabase,
  params: {
    organisationId: string;
    projectId: string;
    userId: string;
    answers: BatchScopeAnswer[];
  }
): Promise<{ error?: string; changed: boolean }> {
  if (params.answers.length === 0) {
    return { changed: false };
  }

  const { data: project, error: projectError } = await getProjectById(
    supabase,
    params.projectId,
    params.organisationId
  );

  if (projectError || !project) {
    return { error: "Project not found.", changed: false };
  }

  const ensureResult = await ensureQuestionsForProjectScopes(
    supabase,
    params.organisationId,
    params.projectId
  );

  if (ensureResult.error) {
    return { error: ensureResult.error, changed: false };
  }

  const questionIds = params.answers.map((a) => a.questionId);

  const { data: questions, error: questionsError } = await supabase
    .from("scope_questions")
    .select("id, project_scope_id, question_key")
    .in("id", questionIds);

  if (questionsError || !questions?.length) {
    return { error: "Question not found.", changed: false };
  }

  const questionById = new Map(questions.map((q) => [q.id, q]));
  const scopeIds = [...new Set(questions.map((q) => q.project_scope_id))];

  const { data: scopes, error: scopesError } = await supabase
    .from("project_scopes")
    .select("id")
    .in("id", scopeIds)
    .eq("organisation_id", params.organisationId)
    .eq("project_id", params.projectId);

  if (scopesError || scopes?.length !== scopeIds.length) {
    return { error: "Work area not found.", changed: false };
  }

  const { data: existingAnswers } = await supabase
    .from("scope_answers")
    .select("scope_question_id, answer, source")
    .in("scope_question_id", questionIds);

  const existingByQuestionId = new Map(
    (existingAnswers ?? []).map((row) => [row.scope_question_id, row])
  );

  const toPersist: {
    scopeQuestionId: string;
    projectScopeId: string;
    answer: string;
  }[] = [];

  for (const item of params.answers) {
    const question = questionById.get(item.questionId);
    if (!question) {
      return { error: "Question not found.", changed: false };
    }

    const existing = existingByQuestionId.get(item.questionId);
    const existingValue =
      answerValueToString(existing?.answer ?? null, existing?.source ?? null) ??
      "";

    if (!hasMeaningfulChange(existingValue, item.answer)) {
      continue;
    }

    toPersist.push({
      scopeQuestionId: item.questionId,
      projectScopeId: question.project_scope_id,
      answer: item.answer,
    });
  }

  if (toPersist.length === 0) {
    return { changed: false };
  }

  const persistError = await persistScopeAnswersBatch(
    supabase,
    params.organisationId,
    toPersist
  );

  if (persistError) {
    return { error: "Could not save answers.", changed: false };
  }

  const labels = params.answers.map((a) => a.label).join(", ");
  await insertAssistantMessage(supabase, {
    organisationId: params.organisationId,
    projectId: params.projectId,
    userId: params.userId,
    role: "user",
    content: labels,
    metadata: {
      messageType: "answer",
      batchSize: params.answers.length,
    },
  });

  await insertAssistantMessage(supabase, {
    organisationId: params.organisationId,
    projectId: params.projectId,
    userId: params.userId,
    role: "assistant",
    content:
      params.answers.length === 1
        ? "Got it — estimate updated."
        : `Updated ${params.answers.length} details. Estimate updated.`,
    metadata: { messageType: "assistant_text" },
  });

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

  const changeReason =
    params.answers.length === 1
      ? params.answers[0]!.label
      : `${params.answers.length} details confirmed`;

  await recalculateQuickEstimate(
    supabase,
    params.organisationId,
    params.projectId,
    { triggerEvent: "answer_changed", changeReason }
  );

  return { changed: true };
}

export async function batchSaveConstraintAnswers(
  supabase: Supabase,
  params: {
    organisationId: string;
    projectId: string;
    userId: string;
    selections: BatchConstraintSelection[];
  }
): Promise<{ error?: string; changed: boolean }> {
  if (params.selections.length === 0) {
    return { changed: false };
  }

  const { data: project, error: projectError } = await getProjectById(
    supabase,
    params.projectId,
    params.organisationId
  );

  if (projectError || !project) {
    return { error: "Project not found.", changed: false };
  }

  const estimate = await ensureQuickEstimateForProject(
    supabase,
    params.organisationId,
    params.projectId,
    params.userId
  );

  if (!estimate) {
    return { error: "Could not load estimate.", changed: false };
  }

  const persistError = await persistConstraintAssessmentBatch(supabase, {
    organisationId: params.organisationId,
    projectId: params.projectId,
    quickEstimateId: estimate.id,
    userId: params.userId,
    assessments: params.selections.map((item) => ({
      slug: item.slug,
      apply: item.apply,
    })),
  });

  if (persistError) {
    return {
      error: userFacingConstraintPersistError(persistError),
      changed: false,
    };
  }

  const applied = params.selections
    .filter((item) => item.apply)
    .map((item) => item.label);

  const appliedLabels = params.selections
    .filter((s) => s.apply)
    .map((s) => s.label);
  const declinedItems = params.selections.filter((s) => !s.apply);
  const allDeclined =
    appliedLabels.length === 0 && declinedItems.length === params.selections.length;

  if (allDeclined) {
    await insertAssistantMessage(supabase, {
      organisationId: params.organisationId,
      projectId: params.projectId,
      userId: params.userId,
      role: "user",
      content: "None of these apply.",
      metadata: {
        messageType: "constraint_declined",
        batchSize: declinedItems.length,
        constraintSlugs: declinedItems.map((item) => item.slug),
      },
    });
  } else {
    for (const item of declinedItems) {
      await insertAssistantMessage(supabase, {
        organisationId: params.organisationId,
        projectId: params.projectId,
        userId: params.userId,
        role: "user",
        content: `No — ${item.label.toLowerCase()}.`,
        metadata: {
          messageType: "constraint_declined",
          constraintSlug: item.slug,
        },
      });
    }

    if (appliedLabels.length > 0) {
      await insertAssistantMessage(supabase, {
        organisationId: params.organisationId,
        projectId: params.projectId,
        userId: params.userId,
        role: "user",
        content: appliedLabels.join(", "),
        metadata: {
          messageType: "constraint_answer",
          batchSize: appliedLabels.length,
          constraintSlugs: params.selections
            .filter((s) => s.apply)
            .map((s) => s.slug),
        },
      });
    }
  }

  if (applied.length > 0) {
    const summary =
      applied.length === 1
        ? applied[0]!
        : applied.slice(0, -1).join(", ") + " and " + applied[applied.length - 1];

    await insertAssistantMessage(supabase, {
      organisationId: params.organisationId,
      projectId: params.projectId,
      userId: params.userId,
      role: "assistant",
      content: `Got it. I've added ${summary.toLowerCase()} allowances. Estimate updated.`,
      metadata: { messageType: "assistant_text", batchSize: applied.length },
    });
  } else if (declinedItems.length > 0) {
    await insertAssistantMessage(supabase, {
      organisationId: params.organisationId,
      projectId: params.projectId,
      userId: params.userId,
      role: "assistant",
      content: "Got it — I won't include those site allowances.",
      metadata: { messageType: "assistant_text" },
    });
  }

  await recalculateQuickEstimate(
    supabase,
    params.organisationId,
    params.projectId,
    {
      triggerEvent: "constraint_changed",
      changeReason:
        applied.length > 0
          ? applied.map((label) => label.toLowerCase()).join(", ")
          : "site conditions confirmed",
    }
  );

  return { changed: true };
}

export async function saveQualityLevelWithAck(
  supabase: Supabase,
  params: {
    organisationId: string;
    projectId: string;
    userId: string;
    qualityLevel: QualityLevel;
  }
): Promise<{ error?: string; changed: boolean; label?: string }> {
  const result = await saveQualityLevel(supabase, {
    ...params,
    skipRecalc: false,
    skipThreadMessage: false,
  });

  if ("error" in result) {
    return { error: result.error, changed: false };
  }

  return { changed: result.changed, label: result.label };
}
