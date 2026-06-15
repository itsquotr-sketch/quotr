"use server";

import { revalidateProjectAssistant } from "@/lib/assistant-v2/revalidate";
import { requireOrganisation } from "@/lib/auth";
import { runProjectDiscovery } from "@/lib/ai/discovery";
import { autosaveDevLog } from "@/lib/autosave/autosave-dev-log";
import { hasMeaningfulChange } from "@/lib/autosave/has-meaningful-change";
import { recalculateQuickEstimate } from "@/lib/cost-engine/recalculate-quick-estimate";
import { devLog } from "@/lib/dev-log";
import { loadSavedProjectConstraints } from "@/lib/project-constraints-load";
import { persistProjectConstraints } from "@/lib/project-constraints-persist";
import { answerValueToString } from "@/lib/scope-answer-state";
import { persistScopeAnswersBatch } from "@/lib/scope-answers-persist";
import { getProjectById } from "@/lib/projects-data";
import {
  ensureQuickEstimateForProject,
  getQuickEstimateForProject,
} from "@/lib/quick-estimate-data";
import {
  getLatestScopeBuilderInput,
  listScopeBuilderInputs,
} from "@/lib/scope-builder-data";
import { ensureQuestionsForProjectScopes } from "@/lib/scope-questions-seed";
import { createClient } from "@/lib/supabase/server";
import {
  logSupabaseError,
  userFacingConstraintPersistError,
  userFacingSupabaseError,
} from "@/lib/supabase/log-error";
import {
  DEFAULT_SCOPE_BUILDER_INPUT_STATUS,
  scopeBuilderInputSchema,
} from "@/lib/validations/scope-builder";
import {
  assistantConstraintsSchema,
  quickEstimateMarginSchema,
  scopeQuestionAnswerSchema,
  scopeQuestionAnswersSchema,
} from "@/lib/validations/project-assistant";
export type ProjectAssistantActionState = {
  error?: string;
  success?: boolean;
  message?: string;
  fieldErrors?: Record<string, string[]>;
  nextStep?: number;
  analysingMode?: "ai" | "rules";
  usedFallback?: boolean;
};

async function getCombinedProjectNotes(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organisationId: string,
  projectId: string
): Promise<string> {
  const { data: inputs } = await listScopeBuilderInputs(
    supabase,
    organisationId,
    projectId
  );

  return (inputs ?? [])
    .map((i) => i.content.trim())
    .filter(Boolean)
    .join("\n\n---\n\n");
}

async function syncNotesToQuickEstimate(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organisationId: string,
  projectId: string,
  userId: string
) {
  const combined = await getCombinedProjectNotes(
    supabase,
    organisationId,
    projectId
  );

  const estimate = await ensureQuickEstimateForProject(
    supabase,
    organisationId,
    projectId,
    userId
  );

  if (!estimate) {
    return null;
  }

  if (combined) {
    await supabase
      .from("quick_estimates")
      .update({ source_notes: combined })
      .eq("id", estimate.id)
      .eq("organisation_id", organisationId);
  }

  return estimate;
}

async function executeProjectDiscovery(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organisationId: string,
  projectId: string,
  userId: string,
  options?: { forceRules?: boolean }
): Promise<ProjectAssistantActionState> {
  const combinedNotes = await getCombinedProjectNotes(
    supabase,
    organisationId,
    projectId
  );

  if (!combinedNotes.trim()) {
    return {
      error: "Add and save project notes before analysing the project.",
    };
  }

  const estimate = await syncNotesToQuickEstimate(
    supabase,
    organisationId,
    projectId,
    userId
  );

  const { data: latestInput } = await getLatestScopeBuilderInput(
    supabase,
    organisationId,
    projectId
  );

  const discoveryResult = await runProjectDiscovery(supabase, {
    organisationId,
    projectId,
    userId,
    inputText: combinedNotes,
    sourceInputId: latestInput?.id ?? null,
    quickEstimateId: estimate?.id ?? null,
    forceRules: options?.forceRules ?? false,
  });

  if (discoveryResult.error) {
    if (!options?.forceRules) {
      const fallback = await runProjectDiscovery(supabase, {
        organisationId,
        projectId,
        userId,
        inputText: combinedNotes,
        sourceInputId: latestInput?.id ?? null,
        quickEstimateId: estimate?.id ?? null,
        forceRules: true,
      });
      if (!fallback.error) {
        await ensureQuestionsForProjectScopes(
          supabase,
          organisationId,
          projectId
        );
        await recalculateQuickEstimateAction(projectId, {
          silent: true,
          triggerEvent: "discovery_fallback",
        });
        revalidateProjectAssistant(projectId);
        return {
          success: true,
          message:
            "Basic analysis complete — AI was unavailable but your notes were processed.",
          nextStep: 2,
          analysingMode: "rules",
          usedFallback: true,
        };
      }
    }
    return { error: discoveryResult.error };
  }

  const ensureResult = await ensureQuestionsForProjectScopes(
    supabase,
    organisationId,
    projectId
  );
  if (ensureResult.error) {
    return { error: ensureResult.error };
  }

  await recalculateQuickEstimateAction(projectId, { silent: true });
  revalidateProjectAssistant(projectId);

  const { outcome } = discoveryResult;
  const analysingMode =
    outcome.provider.id === "openai" && !outcome.usedFallback
      ? "ai"
      : "rules";

  return {
    success: true,
    message: discoveryResult.message,
    nextStep: 2,
    analysingMode,
    usedFallback: outcome.usedFallback,
  };
}

export async function analyseProject(
  projectId: string
): Promise<ProjectAssistantActionState> {
  const { user, organisationId } = await requireOrganisation();
  const supabase = await createClient();
  return executeProjectDiscovery(
    supabase,
    organisationId,
    projectId,
    user.id
  );
}

export async function analyseProjectBasic(
  projectId: string
): Promise<ProjectAssistantActionState> {
  const { user, organisationId } = await requireOrganisation();
  const supabase = await createClient();
  return executeProjectDiscovery(
    supabase,
    organisationId,
    projectId,
    user.id,
    { forceRules: true }
  );
}

export async function generateDraftQuickEstimate(
  projectId: string
): Promise<ProjectAssistantActionState> {
  return recalculateQuickEstimateAction(projectId, {
    nextStep: 5,
    triggerEvent: "generate_draft",
  });
}

export async function saveAndAnalyseProject(
  projectId: string,
  _prevState: ProjectAssistantActionState,
  formData: FormData
): Promise<ProjectAssistantActionState> {
  const { user, profile, organisationId } = await requireOrganisation();

  if (!profile.organisation_id) {
    return { error: "Your account is not linked to an organisation yet." };
  }

  const raw = {
    inputType: "typed_note",
    content: formData.get("content"),
  };

  const parsed = scopeBuilderInputSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      fieldErrors: parsed.error.flatten().fieldErrors as Record<
        string,
        string[]
      >,
    };
  }

  const supabase = await createClient();

  const { data: project, error: projectError } = await getProjectById(
    supabase,
    projectId,
    organisationId
  );

  if (projectError || !project) {
    return { error: "Project not found." };
  }

  const { error: insertError } = await supabase
    .from("project_scope_builder_inputs")
    .insert({
      organisation_id: organisationId,
      project_id: projectId,
      input_type: parsed.data.inputType,
      content: parsed.data.content.trim(),
      status: DEFAULT_SCOPE_BUILDER_INPUT_STATUS,
      created_by: user.id,
    });

  if (insertError) {
    logSupabaseError("saveAndAnalyseProject.insert", insertError);
    return {
      error: userFacingSupabaseError(
        insertError,
        "Could not save project notes."
      ),
    };
  }

  const discoveryState = await executeProjectDiscovery(
    supabase,
    organisationId,
    projectId,
    user.id
  );

  if (discoveryState.error) {
    return {
      success: true,
      message: "Notes saved. Add more detail, then analyse again.",
      nextStep: 1,
    };
  }

  return {
    ...discoveryState,
    message:
      discoveryState.message ??
      "Notes saved — discovery complete. Confirm the work areas that apply.",
  };
}

export async function ensureAssistantQuestions(
  projectId: string
): Promise<ProjectAssistantActionState> {
  const { organisationId } = await requireOrganisation();
  const supabase = await createClient();
  const result = await ensureQuestionsForProjectScopes(
    supabase,
    organisationId,
    projectId
  );
  if (result.error) {
    return { error: result.error };
  }
  revalidateProjectAssistant(projectId);
  return { success: true };
}

export async function autoSaveScopeQuestionAnswer(
  projectId: string,
  questionId: string,
  answer: string
): Promise<ProjectAssistantActionState> {
  const parsed = scopeQuestionAnswerSchema.safeParse({ questionId, answer });
  if (!parsed.success) {
    return { error: "Invalid answer." };
  }

  const formData = new FormData();
  formData.set(`answer_${parsed.data.questionId}`, parsed.data.answer);

  return saveScopeQuestionAnswers(projectId, {}, formData);
}

export async function autoSaveAssistantConstraints(
  projectId: string,
  quickEstimateId: string,
  payload: {
    constraintSlugs: string[];
    qualityLevel: string;
    followUps?: Record<string, string>;
  }
): Promise<ProjectAssistantActionState> {
  const formData = new FormData();
  for (const slug of payload.constraintSlugs) {
    formData.append("constraintSlugs", slug);
  }
  formData.set("qualityLevel", payload.qualityLevel);
  if (payload.followUps) {
    for (const [slug, value] of Object.entries(payload.followUps)) {
      formData.set(`followUp_${slug}`, value);
    }
  }
  return saveAssistantConstraints(projectId, quickEstimateId, {}, formData);
}

export async function saveScopeQuestionAnswers(
  projectId: string,
  _prevState: ProjectAssistantActionState,
  formData: FormData
): Promise<ProjectAssistantActionState> {
  const { user, organisationId } = await requireOrganisation();
  const supabase = await createClient();

  const { data: project, error: projectError } = await getProjectById(
    supabase,
    projectId,
    organisationId
  );

  if (projectError || !project) {
    return { error: "Project not found." };
  }

  const ensureResult = await ensureQuestionsForProjectScopes(
    supabase,
    organisationId,
    projectId
  );
  if (ensureResult.error) {
    return { error: ensureResult.error };
  }

  const entries: { questionId: string; answer: string }[] = [];
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("answer_") && typeof value === "string" && value.trim()) {
      entries.push({
        questionId: key.replace("answer_", ""),
        answer: value.trim(),
      });
    }
  }

  const parsed = scopeQuestionAnswersSchema.safeParse({ answers: entries });
  if (!parsed.success) {
    return { error: "Could not save answers." };
  }

  const answersToSave: {
    scopeQuestionId: string;
    projectScopeId: string;
    answer: string;
  }[] = [];

  for (const item of parsed.data.answers) {
    const { data: question } = await supabase
      .from("scope_questions")
      .select("id, project_scope_id")
      .eq("id", item.questionId)
      .single();

    if (!question) continue;

    const { data: scope } = await supabase
      .from("project_scopes")
      .select("id")
      .eq("id", question.project_scope_id)
      .eq("organisation_id", organisationId)
      .single();

    if (!scope) continue;

    const { data: existing } = await supabase
      .from("scope_answers")
      .select("answer, source")
      .eq("scope_question_id", item.questionId)
      .maybeSingle();

    const existingValue =
      answerValueToString(existing?.answer ?? null, existing?.source ?? null) ??
      "";

    if (!hasMeaningfulChange(existingValue, item.answer)) {
      autosaveDevLog("autosave", "skipped — no value change");
      continue;
    }

    autosaveDevLog("autosave", "saving changed value");

    answersToSave.push({
      scopeQuestionId: item.questionId,
      projectScopeId: question.project_scope_id,
      answer: item.answer,
    });
  }

  if (answersToSave.length === 0) {
    return { success: true, message: "No changes." };
  }

  const persistError = await persistScopeAnswersBatch(
    supabase,
    organisationId,
    answersToSave
  );
  if (persistError) {
    return {
      error: userFacingSupabaseError(
        persistError,
        "Could not save one or more answers."
      ),
    };
  }

  await syncNotesToQuickEstimate(supabase, organisationId, projectId, user.id);
  await recalculateQuickEstimateAction(projectId, {
    silent: true,
    triggerEvent: "answer_changed",
  });

  revalidateProjectAssistant(projectId);
  return {
    success: true,
    message: "Answers saved.",
  };
}

export async function continueToAssistantConstraints(
  projectId: string
): Promise<ProjectAssistantActionState> {
  const { user, organisationId } = await requireOrganisation();
  const supabase = await createClient();

  const ensureResult = await ensureQuestionsForProjectScopes(
    supabase,
    organisationId,
    projectId
  );
  if (ensureResult.error) {
    return { error: ensureResult.error };
  }
  await syncNotesToQuickEstimate(supabase, organisationId, projectId, user.id);
  await recalculateQuickEstimateAction(projectId, { silent: true });
  revalidateProjectAssistant(projectId);

  return {
    success: true,
    message: "Estimate updated.",
  };
}

export async function saveAssistantConstraints(
  projectId: string,
  quickEstimateId: string,
  _prevState: ProjectAssistantActionState,
  formData: FormData
): Promise<ProjectAssistantActionState> {
  const { user, organisationId } = await requireOrganisation();
  const supabase = await createClient();

  const selectedSlugs = formData.getAll("constraintSlugs").map(String);
  devLog("constraints.action.save", {
    projectId,
    quickEstimateId,
    selectedSlugs,
  });

  const parsed = assistantConstraintsSchema.safeParse({
    constraintSlugs: selectedSlugs,
    qualityLevel: formData.get("qualityLevel")?.toString() ?? "unknown",
  });

  if (!parsed.success) {
    return { error: "Invalid budget, finish or constraints." };
  }

  const { data: currentEstimate } = await supabase
    .from("quick_estimates")
    .select("quality_level")
    .eq("id", quickEstimateId)
    .eq("organisation_id", organisationId)
    .maybeSingle();

  const saved = await loadSavedProjectConstraints(
    supabase,
    organisationId,
    projectId,
    quickEstimateId
  );

  const followUpsFromForm = Object.fromEntries(
    parsed.data.constraintSlugs.map((slug) => [
      slug,
      formData.get(`followUp_${slug}`)?.toString() ?? "",
    ])
  );

  const slugsUnchanged =
    JSON.stringify([...saved.slugs].sort()) ===
    JSON.stringify([...parsed.data.constraintSlugs].sort());
  const qualityUnchanged =
    (currentEstimate?.quality_level ?? "unknown") === parsed.data.qualityLevel;
  const followUpsUnchanged = parsed.data.constraintSlugs.every((slug) => {
    const savedValue = saved.followUpValues[slug];
    const nextValue = followUpsFromForm[slug] ?? "";
    return !hasMeaningfulChange(
      savedValue?.toString() ?? "",
      nextValue
    );
  });

  if (slugsUnchanged && qualityUnchanged && followUpsUnchanged) {
    autosaveDevLog("autosave", "skipped — no value change");
    return { success: true, message: "No changes." };
  }

  autosaveDevLog("autosave", "saving changed value");

  const { error: qualityError } = await supabase
    .from("quick_estimates")
    .update({ quality_level: parsed.data.qualityLevel })
    .eq("id", quickEstimateId)
    .eq("organisation_id", organisationId);

  if (qualityError) {
    logSupabaseError("saveAssistantConstraints.qualityLevel", qualityError);
    return { error: "Could not save finish level." };
  }

  const persistError = await persistProjectConstraints(supabase, {
    organisationId,
    projectId,
    quickEstimateId,
    userId: user.id,
    constraintSlugs: parsed.data.constraintSlugs,
    formData,
  });

  if (persistError) {
    return { error: userFacingConstraintPersistError(persistError) };
  }

  await recalculateQuickEstimateAction(projectId, {
    silent: true,
    triggerEvent: "condition_changed",
  });

  revalidateProjectAssistant(projectId);

  return {
    success: true,
    message: "Budget, finish and constraints saved.",
  };
}

export async function updateQuickEstimate(
  projectId: string
): Promise<ProjectAssistantActionState> {
  return recalculateQuickEstimateAction(projectId, { nextStep: 5 });
}

export async function updateQuickEstimateMargin(
  projectId: string,
  _prevState: ProjectAssistantActionState,
  formData: FormData
): Promise<ProjectAssistantActionState> {
  const { organisationId } = await requireOrganisation();
  const supabase = await createClient();

  const parsed = quickEstimateMarginSchema.safeParse({
    targetMarginPercent: formData.get("targetMarginPercent"),
  });

  if (!parsed.success) {
    return {
      error:
        parsed.error.flatten().fieldErrors.targetMarginPercent?.[0] ??
        "Invalid margin percentage.",
    };
  }

  const { data: quickEstimate } = await getQuickEstimateForProject(
    supabase,
    organisationId,
    projectId
  );

  if (!quickEstimate) {
    return { error: "Quick estimate not found." };
  }

  const currentMargin = Number(quickEstimate.target_margin_percent ?? 0);
  if (currentMargin === parsed.data.targetMarginPercent) {
    autosaveDevLog("autosave", "skipped — no value change");
    return { success: true, message: "Margin unchanged." };
  }

  autosaveDevLog("autosave", "saving changed value");

  const { error: updateError } = await supabase
    .from("quick_estimates")
    .update({ target_margin_percent: parsed.data.targetMarginPercent })
    .eq("id", quickEstimate.id)
    .eq("organisation_id", organisationId);

  if (updateError) {
    logSupabaseError("updateQuickEstimateMargin", updateError);
    return { error: "Could not save target margin." };
  }

  const result = await recalculateQuickEstimate(
    supabase,
    organisationId,
    projectId,
    { triggerEvent: "margin_changed" }
  );

  if (!result.success) {
    console.error(
      "[updateQuickEstimateMargin]",
      result.technicalMessage ?? result.error
    );
    return {
      error: result.userMessage ?? result.error ?? "Could not recalculate sell range.",
    };
  }

  revalidateProjectAssistant(projectId);
  return {
    success: true,
    message: `Target margin updated to ${parsed.data.targetMarginPercent}%.`,
  };
}

async function recalculateQuickEstimateAction(
  projectId: string,
  options?: { silent?: boolean; nextStep?: number; triggerEvent?: string }
): Promise<ProjectAssistantActionState> {
  const { organisationId } = await requireOrganisation();
  const supabase = await createClient();

  const result = await recalculateQuickEstimate(
    supabase,
    organisationId,
    projectId,
    { triggerEvent: options?.triggerEvent ?? "recalculate" }
  );

  if (!result.success) {
    console.error(
      "[recalculateQuickEstimateAction]",
      result.technicalMessage ?? result.error
    );
    return {
      error: result.userMessage ?? result.error ?? "Could not update quick estimate.",
    };
  }

  if (!options?.silent) {
    revalidateProjectAssistant(projectId);
  }

  return {
    success: true,
    message: result.warning
      ? `${result.message ?? "Estimate updated."} ${result.warning}`
      : result.message,
    ...(options?.silent ? {} : { nextStep: options?.nextStep ?? 5 }),
  };
}

/** @deprecated Use recalculateQuickEstimateAction */
export async function generateAssistantQuickEstimate(
  projectId: string,
  options?: { silent?: boolean; nextStep?: number }
): Promise<ProjectAssistantActionState> {
  return recalculateQuickEstimateAction(projectId, options);
}
