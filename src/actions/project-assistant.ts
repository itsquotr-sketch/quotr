"use server";

import { revalidatePath } from "next/cache";
import { requireOrganisation } from "@/lib/auth";
import { runProjectDiscovery } from "@/lib/ai/discovery";
import { recalculateQuickEstimate } from "@/lib/cost-engine/recalculate-quick-estimate";
import { devLog } from "@/lib/dev-log";
import { persistProjectConstraints } from "@/lib/project-constraints-persist";
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
  userId: string
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
  });

  if (discoveryResult.error) {
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
  revalidatePath(`/projects/${projectId}`);

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
  revalidatePath(`/projects/${projectId}`);
  return { success: true };
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

    answersToSave.push({
      scopeQuestionId: item.questionId,
      projectScopeId: question.project_scope_id,
      answer: item.answer,
    });
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
  await recalculateQuickEstimateAction(projectId, { silent: true });

  revalidatePath(`/projects/${projectId}`);
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
  revalidatePath(`/projects/${projectId}`);

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

  await recalculateQuickEstimateAction(projectId, { silent: true });

  revalidatePath(`/projects/${projectId}`);

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
    projectId
  );

  if (!result.success) {
    return { error: result.error ?? "Could not recalculate sell range." };
  }

  revalidatePath(`/projects/${projectId}`);
  return {
    success: true,
    message: `Target margin updated to ${parsed.data.targetMarginPercent}%.`,
  };
}

async function recalculateQuickEstimateAction(
  projectId: string,
  options?: { silent?: boolean; nextStep?: number }
): Promise<ProjectAssistantActionState> {
  const { organisationId } = await requireOrganisation();
  const supabase = await createClient();

  const result = await recalculateQuickEstimate(
    supabase,
    organisationId,
    projectId
  );

  if (!result.success) {
    return { error: result.error ?? "Could not update quick estimate." };
  }

  revalidatePath(`/projects/${projectId}`);
  return {
    success: true,
    message: result.message,
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
