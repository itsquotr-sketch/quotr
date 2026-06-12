"use server";

import { requireOrganisation } from "@/lib/auth";
import { buildMergedAnswersForScope } from "@/lib/assistant-v2/build-merged-answers";
import { formatKnownFactLabels } from "@/lib/assistant-v2/compute-information-completeness";
import { insertAssistantMessage } from "@/lib/assistant-v2/assistant-messages-data";
import { loadProjectAssistantData } from "@/lib/assistant-v2/load-assistant-data";
import { revalidateProjectAssistant } from "@/lib/assistant-v2/revalidate";
import { resetAssistantState } from "@/lib/assistant-v2/reset-assistant";
import { runAssistantAnalysis } from "@/lib/assistant-v2/run-assistant-analysis";
import { saveConstraintAnswer } from "@/lib/assistant-v2/save-constraint-answer";
import { saveQualityLevel } from "@/lib/assistant-v2/save-quality-level";
import {
  batchSaveConstraintAnswers,
  batchSaveScopeAnswers,
} from "@/lib/assistant-v2/batch-save-answers";
import { saveScopeAnswer } from "@/lib/assistant-v2/save-scope-answer";
import { submitProjectNotes } from "@/lib/assistant-v2/submit-notes";
import { acceptScopeSuggestion } from "@/actions/scope-suggestions";
import { ensureQuestionsForProjectScopes } from "@/lib/scope-questions-seed";
import { recalculateQuickEstimate } from "@/lib/cost-engine/recalculate-quick-estimate";
import { resolveWorkAreaTypeKey } from "@/lib/project-assistant-questions";
import { getProjectById } from "@/lib/projects-data";
import { createClient } from "@/lib/supabase/server";
import { logSupabaseError } from "@/lib/supabase/log-error";
import type { QualityLevel } from "@/lib/constants/quality-level";

export type AssistantV2ActionState = {
  error?: string;
  success?: boolean;
  message?: string;
  fieldErrors?: Record<string, string[]>;
  analysingMode?: "ai" | "rules";
  usedFallback?: boolean;
};

export async function resetAssistant(
  projectId: string
): Promise<AssistantV2ActionState> {
  const { organisationId } = await requireOrganisation();
  const supabase = await createClient();

  const { data: project, error: projectError } = await getProjectById(
    supabase,
    projectId,
    organisationId
  );

  if (projectError || !project) {
    return { error: "Project not found." };
  }

  const { error } = await resetAssistantState(
    supabase,
    organisationId,
    projectId
  );

  if (error) {
    return { error };
  }

  revalidateProjectAssistant(projectId);
  return {
    success: true,
    message: "Assistant reset. Your notes are still saved.",
  };
}

export async function acceptAllPendingSuggestions(
  projectId: string
): Promise<AssistantV2ActionState> {
  const { organisationId } = await requireOrganisation();
  const supabase = await createClient();

  const { data: pending, error } = await supabase
    .from("project_scope_suggestions")
    .select("id")
    .eq("project_id", projectId)
    .eq("organisation_id", organisationId)
    .eq("status", "pending");

  if (error) {
    logSupabaseError("acceptAllPendingSuggestions", error);
    return { error: "Could not load work area suggestions." };
  }

  if (!pending?.length) {
    return { success: true };
  }

  for (const suggestion of pending) {
    const result = await acceptScopeSuggestion(projectId, suggestion.id);
    if (result.error) {
      return { error: result.error };
    }
  }

  await ensureQuestionsForProjectScopes(supabase, organisationId, projectId);
  await recalculateQuickEstimate(supabase, organisationId, projectId);

  revalidateProjectAssistant(projectId);
  return { success: true, message: "Work areas confirmed." };
}

export async function submitAssistantNotes(
  projectId: string,
  _prev: AssistantV2ActionState,
  formData: FormData
): Promise<AssistantV2ActionState> {
  const { user, organisationId } = await requireOrganisation();
  const supabase = await createClient();

  const content = formData.get("content")?.toString().trim() ?? "";
  if (!content) {
    return { error: "Please enter a message." };
  }

  await insertAssistantMessage(supabase, {
    organisationId,
    projectId,
    userId: user.id,
    role: "user",
    content,
    metadata: { messageType: "note" },
  });

  const saveResult = await submitProjectNotes(supabase, {
    organisationId,
    projectId,
    userId: user.id,
    content,
  });

  if ("error" in saveResult && saveResult.error) {
    return {
      error: saveResult.error,
      fieldErrors: saveResult.fieldErrors,
    };
  }

  const analyseResult = await runAssistantAnalysis(supabase, {
    organisationId,
    projectId,
    userId: user.id,
  });

  const acceptResult = await acceptAllPendingSuggestions(projectId);
  if (acceptResult.error) {
    return { error: acceptResult.error };
  }

  const assistantText = analyseResult.success
    ? analyseResult.usedFallback
      ? "I used basic analysis — your notes are saved and I'm building the estimate."
      : "Got it — I'm reviewing the scope and updating your estimate."
    : "Notes saved. Add more detail if needed.";

  await insertAssistantMessage(supabase, {
    organisationId,
    projectId,
    userId: user.id,
    role: "assistant",
    content: assistantText,
    metadata: {
      messageType: "assistant_text",
      analysingMode: analyseResult.analysingMode,
    },
  });

  revalidateProjectAssistant(projectId);
  return {
    success: true,
    message: analyseResult.message ?? assistantText,
    analysingMode: analyseResult.analysingMode,
    usedFallback: analyseResult.usedFallback,
  };
}

export async function batchSaveAssistantScopeAnswers(
  projectId: string,
  answers: {
    questionId: string;
    questionKey: string;
    answer: string;
    label: string;
  }[]
): Promise<AssistantV2ActionState> {
  const { user, organisationId } = await requireOrganisation();
  const supabase = await createClient();

  const result = await batchSaveScopeAnswers(supabase, {
    organisationId,
    projectId,
    userId: user.id,
    answers,
  });

  if (result.error) {
    return { error: result.error };
  }

  if (result.changed) {
    revalidateProjectAssistant(projectId);
  }

  return { success: true };
}

export async function batchSaveAssistantConstraintAnswers(
  projectId: string,
  selections: { slug: string; label: string; apply: boolean }[]
): Promise<AssistantV2ActionState> {
  const { user, organisationId } = await requireOrganisation();
  const supabase = await createClient();

  const result = await batchSaveConstraintAnswers(supabase, {
    organisationId,
    projectId,
    userId: user.id,
    selections,
  });

  if (result.error) {
    return { error: result.error };
  }

  if (result.changed) {
    revalidateProjectAssistant(projectId);
  }

  return { success: true };
}

export async function autoSaveScopeQuestionAnswer(
  projectId: string,
  questionId: string,
  answer: string
): Promise<AssistantV2ActionState> {
  const { user, organisationId } = await requireOrganisation();
  const supabase = await createClient();

  const result = await saveScopeAnswer(supabase, {
    organisationId,
    projectId,
    userId: user.id,
    questionId,
    answer,
  });

  if ("error" in result) {
    return { error: result.error };
  }

  if (result.changed) {
    revalidateProjectAssistant(projectId);
  }

  return { success: true, message: result.message };
}

export async function autoSaveConstraintAnswer(
  projectId: string,
  slug: string,
  label: string,
  apply: boolean
): Promise<AssistantV2ActionState> {
  const { user, organisationId } = await requireOrganisation();
  const supabase = await createClient();

  const result = await saveConstraintAnswer(supabase, {
    organisationId,
    projectId,
    userId: user.id,
    slug,
    label,
    apply,
  });

  if ("error" in result) {
    return { error: result.error };
  }

  if (result.changed || !apply) {
    revalidateProjectAssistant(projectId);
  }

  return { success: true };
}

export async function autoSaveQualityLevel(
  projectId: string,
  qualityLevel: QualityLevel
): Promise<AssistantV2ActionState> {
  const { user, organisationId } = await requireOrganisation();
  const supabase = await createClient();

  const result = await saveQualityLevel(supabase, {
    organisationId,
    projectId,
    userId: user.id,
    qualityLevel,
  });

  if ("error" in result) {
    return { error: result.error };
  }

  if (result.changed) {
    revalidateProjectAssistant(projectId);
  }

  return { success: true, message: `Finish level set to ${result.label}.` };
}

export async function generateAssistantEstimate(
  projectId: string
): Promise<AssistantV2ActionState> {
  const { organisationId } = await requireOrganisation();
  const supabase = await createClient();

  const result = await recalculateQuickEstimate(
    supabase,
    organisationId,
    projectId,
    { triggerEvent: "manual_recalculate" }
  );

  revalidateProjectAssistant(projectId);
  return {
    success: result.success,
    error: result.error,
    message: result.message ?? "Estimate updated.",
  };
}

export async function exportScopeSummary(
  projectId: string
): Promise<{ summary?: string; error?: string }> {
  const { organisationId, user } = await requireOrganisation();
  const supabase = await createClient();

  const { data, error } = await loadProjectAssistantData(
    supabase,
    organisationId,
    projectId,
    user.id
  );

  if (error || !data) {
    return { error: "Project not found." };
  }

  const lines: string[] = [`# ${data.project.title}`, "", "## Work Areas", ""];

  for (const scope of data.confirmedScopes) {
    const typeKey = resolveWorkAreaTypeKey(
      scope.scope_types?.name,
      scope.name
    );
    const answers = buildMergedAnswersForScope(
      scope.id,
      scope.name,
      scope.scope_types?.name ?? null,
      data.scopeQuestions,
      data.discovery
    );
    const facts = formatKnownFactLabels(typeKey, answers);

    lines.push(`### ${scope.name}`);
    if (facts.length > 0) {
      for (const fact of facts) {
        lines.push(`- ${fact}`);
      }
    } else {
      lines.push("- No confirmed facts yet");
    }
    lines.push("");
  }

  if (data.quickEstimate?.estimated_cost_low != null) {
    lines.push("## Draft Estimate");
    lines.push(
      `- Range: $${Number(data.quickEstimate.estimated_cost_low).toLocaleString()} – $${Number(data.quickEstimate.estimated_cost_high).toLocaleString()}`
    );
  }

  return { summary: lines.join("\n") };
}
