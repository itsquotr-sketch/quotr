import { runAssistantAutopilot } from "@/lib/assistant-v2/autopilot/run-assistant-autopilot";
import { recalculateQuickEstimate } from "@/lib/cost-engine/recalculate-quick-estimate";
import { insertAssistantMessage } from "@/lib/assistant-v2/assistant-messages-data";
import { saveQualityLevel } from "@/lib/assistant-v2/save-quality-level";
import { getProjectById } from "@/lib/projects-data";
import { persistConstraintAssessmentBatch } from "@/lib/project-constraints-persist";
import { ensureQuickEstimateForProject } from "@/lib/quick-estimate-data";
import { listScopeBuilderInputs } from "@/lib/scope-builder-data";
import { answerValueToString } from "@/lib/scope-answer-state";
import {
  isDiscoverySource,
  parseScopeAnswer,
} from "@/lib/scope-answer-format";
import { persistScopeAnswersBatch } from "@/lib/scope-answers-persist";
import { ensureQuestionsForProjectScopes } from "@/lib/scope-questions-seed";
import { hasMeaningfulChange } from "@/lib/autosave/has-meaningful-change";
import { userFacingConstraintPersistError } from "@/lib/supabase/log-error";
import { resolveScopeQuestionIdForSave } from "@/lib/assistant-v2/resolve-scope-question-id";
import { normalizeQuestionKey } from "@/lib/question-keys";
import type { QualityLevel } from "@/lib/constants/quality-level";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type Supabase = SupabaseClient<Database>;

function logAnswerSave(payload: Record<string, unknown>): void {
  if (process.env.NODE_ENV !== "development") return;
  console.log("[assistant.answer.save]", payload);
}

export type BatchScopeAnswer = {
  questionId: string;
  questionKey: string;
  scopeId: string;
  answer: string;
  label: string;
};

export type BatchConstraintSelection = {
  slug: string;
  label: string;
  apply: boolean;
};

export type BatchSaveScopeAnswersResult = {
  error?: string;
  changed: boolean;
  answersSaved: boolean;
  estimateUpdated: boolean;
  errorCode?: string;
  userMessage?: string;
};

export async function batchSaveScopeAnswers(
  supabase: Supabase,
  params: {
    organisationId: string;
    projectId: string;
    userId: string;
    answers: BatchScopeAnswer[];
  }
): Promise<BatchSaveScopeAnswersResult> {
  if (params.answers.length === 0) {
    return { changed: false, answersSaved: false, estimateUpdated: false };
  }

  const { data: project, error: projectError } = await getProjectById(
    supabase,
    params.projectId,
    params.organisationId
  );

  if (projectError || !project) {
    return {
      error: "Project not found.",
      changed: false,
      answersSaved: false,
      estimateUpdated: false,
    };
  }

  const ensureResult = await ensureQuestionsForProjectScopes(
    supabase,
    params.organisationId,
    params.projectId
  );

  if (ensureResult.error) {
    return {
      error: ensureResult.error,
      changed: false,
      answersSaved: false,
      estimateUpdated: false,
    };
  }

  const resolvedQuestions: {
    item: BatchScopeAnswer;
    questionId: string;
    projectScopeId: string;
    questionKey: string;
  }[] = [];

  for (const item of params.answers) {
    const normalizedKey = normalizeQuestionKey(item.questionKey);
    logAnswerSave({
      phase: "before_resolve",
      question_key: normalizedKey,
      scope_id: item.scopeId,
      answer_value: item.answer,
      answer_source: "user",
      question_id: item.questionId,
    });

    const resolved = await resolveScopeQuestionIdForSave(supabase, {
      organisationId: params.organisationId,
      projectId: params.projectId,
      questionId: item.questionId,
      questionKey: item.questionKey,
      projectScopeId: item.scopeId,
    });

    if ("error" in resolved) {
      return {
        error: resolved.error,
        changed: false,
        answersSaved: false,
        estimateUpdated: false,
      };
    }

    resolvedQuestions.push({
      item,
      questionId: resolved.questionId,
      projectScopeId: resolved.projectScopeId,
      questionKey: resolved.questionKey,
    });
  }

  const scopeIds = [
    ...new Set(resolvedQuestions.map((r) => r.projectScopeId)),
  ];

  const { data: scopes, error: scopesError } = await supabase
    .from("project_scopes")
    .select("id")
    .in("id", scopeIds)
    .eq("organisation_id", params.organisationId)
    .eq("project_id", params.projectId);

  if (scopesError || scopes?.length !== scopeIds.length) {
    return {
      error: "Work area not found.",
      changed: false,
      answersSaved: false,
      estimateUpdated: false,
    };
  }

  const { data: existingAnswers } = await supabase
    .from("scope_answers")
    .select("scope_question_id, answer, source")
    .in(
      "scope_question_id",
      resolvedQuestions.map((r) => r.questionId)
    );

  const existingByQuestionId = new Map(
    (existingAnswers ?? []).map((row) => [row.scope_question_id, row])
  );

  const toPersist: {
    scopeQuestionId: string;
    projectScopeId: string;
    answer: string;
  }[] = [];

  for (const resolved of resolvedQuestions) {
    const existing = existingByQuestionId.get(resolved.questionId);
    const existingValue =
      answerValueToString(existing?.answer ?? null, existing?.source ?? null) ??
      "";
    const existingSource =
      parseScopeAnswer(existing?.answer ?? null, existing?.source ?? null)
        ?.source ??
      existing?.source ??
      null;
    const isUpgradingSource =
      (existingSource != null && isDiscoverySource(existingSource)) ||
      existingSource === "extracted" ||
      existingSource === "assumed";

    if (process.env.NODE_ENV === "development") {
      console.log("[assistant.answer.dedup]", {
        questionKey: resolved.questionKey,
        existingValue,
        existingSource,
        newValue: resolved.item.answer,
        isUpgradingSource,
        willSkip:
          !isUpgradingSource &&
          !hasMeaningfulChange(existingValue, resolved.item.answer),
      });
    }

    if (
      !isUpgradingSource &&
      !hasMeaningfulChange(existingValue, resolved.item.answer)
    ) {
      continue;
    }

    toPersist.push({
      scopeQuestionId: resolved.questionId,
      projectScopeId: resolved.projectScopeId,
      answer: resolved.item.answer,
    });
  }

  if (toPersist.length === 0) {
    if (process.env.NODE_ENV === "development") {
      console.log("[dev:scopeAnswers.batchSave.result]", {
        success: true,
        savedCount: 0,
        savedRows: [],
        error: null,
        note: "all_answers_already_persisted",
      });
    }
    return {
      changed: false,
      answersSaved: true,
      estimateUpdated: false,
    };
  }

  const persistError = await persistScopeAnswersBatch(
    supabase,
    params.organisationId,
    toPersist
  );

  if (persistError) {
    if (process.env.NODE_ENV === "development") {
      console.log("[dev:scopeAnswers.batchSave.result]", {
        success: false,
        savedCount: 0,
        savedRows: [],
        error: persistError.message,
      });
    }
    return {
      error: "Could not save answers.",
      changed: false,
      answersSaved: false,
      estimateUpdated: false,
    };
  }

  if (process.env.NODE_ENV === "development") {
    console.log("[assistant.answer.persisted]", {
      count: toPersist.length,
      rows: toPersist.map((r) => ({
        scopeQuestionId: r.scopeQuestionId,
        projectScopeId: r.projectScopeId,
        answer: r.answer,
      })),
    });
    console.log("[dev:scopeAnswers.batchSave.result]", {
      success: true,
      savedCount: toPersist.length,
      savedRows: toPersist.map((row) => ({
        scope_question_id: row.scopeQuestionId,
        project_scope_id: row.projectScopeId,
        answer_value: row.answer,
      })),
      error: null,
    });
  }

  for (const row of toPersist) {
    logAnswerSave({
      phase: "after_save",
      saved_question_id: row.scopeQuestionId,
      saved_project_scope_id: row.projectScopeId,
      saved_answer_value: row.answer,
    });
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
        ? "Got it — estimate refreshed."
        : `Updated ${params.answers.length} details. Estimate refreshed.`,
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

  const recalcResult = await recalculateQuickEstimate(
    supabase,
    params.organisationId,
    params.projectId,
    { triggerEvent: "answer_changed", changeReason }
  );

  if (process.env.NODE_ENV === "development") {
    console.log("[assistant.answer.recalc]", {
      success: recalcResult.success,
      error: recalcResult.success ? null : recalcResult.error,
    });
  }

  if (process.env.NODE_ENV === "development") {
    const summary = recalcResult.success
      ? await supabase
          .from("quick_estimates")
          .select(
            "estimate_status, estimated_cost_low, estimated_cost_high, notes"
          )
          .eq("project_id", params.projectId)
          .eq("organisation_id", params.organisationId)
          .maybeSingle()
      : { data: null };

    let includedWorkAreas: string[] = [];
    let unpricedWorkAreas: string[] = [];
    if (summary.data?.notes) {
      try {
        const parsed = JSON.parse(summary.data.notes) as {
          workAreasIncluded?: string[];
          unpricedWorkAreas?: { name?: string }[];
        };
        includedWorkAreas = parsed.workAreasIncluded ?? [];
        unpricedWorkAreas = (parsed.unpricedWorkAreas ?? []).map(
          (area) => area.name ?? ""
        );
      } catch {
        // ignore parse errors in dev log
      }
    }

    console.log("[dev:quickEstimate.recalculate.result]", {
      success: recalcResult.success,
      estimateStatus: summary.data?.estimate_status ?? null,
      low: summary.data?.estimated_cost_low ?? null,
      high: summary.data?.estimated_cost_high ?? null,
      includedWorkAreas,
      unpricedWorkAreas,
      failureReason: recalcResult.success ? null : recalcResult.userMessage,
      error: recalcResult.success ? null : recalcResult.error,
    });
  }

  await runAssistantAutopilot(supabase, {
    organisationId: params.organisationId,
    projectId: params.projectId,
    userId: params.userId,
  });

  if (!recalcResult.success) {
    return {
      changed: true,
      answersSaved: true,
      estimateUpdated: false,
      errorCode: recalcResult.errorCode,
      userMessage: "Answers saved. Estimate refresh needs retry.",
    };
  }

  return { changed: true, answersSaved: true, estimateUpdated: true };
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

  await runAssistantAutopilot(supabase, {
    organisationId: params.organisationId,
    projectId: params.projectId,
    userId: params.userId,
  });

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

