"use server";

import { requireOrganisation } from "@/lib/auth";
import { buildMergedAnswersForScope } from "@/lib/assistant-v2/build-merged-answers";
import { formatKnownFactLabels } from "@/lib/assistant-v2/compute-information-completeness";
import { insertAssistantMessage } from "@/lib/assistant-v2/assistant-messages-data";
import { loadProjectAssistantData } from "@/lib/assistant-v2/load-assistant-data";
import {
  revalidateAssistantTags,
  revalidateConstraintsAndEstimate,
  revalidateEstimateOnly,
  revalidateProjectAssistant,
  revalidateScopeAnswers,
} from "@/lib/assistant-v2/revalidate";
import { clearSiteConditionsForEdit } from "@/lib/assistant-v2/clear-site-conditions";
import {
  confirmWorkAreaSelections,
  type WorkAreaSelection,
} from "@/lib/assistant-v2/confirm-work-areas";
import { resetAssistantState } from "@/lib/assistant-v2/reset-assistant";
import { saveConstraintAnswer } from "@/lib/assistant-v2/save-constraint-answer";
import { saveQualityLevel } from "@/lib/assistant-v2/save-quality-level";
import {
  batchSaveConstraintAnswers,
  batchSaveScopeAnswers,
} from "@/lib/assistant-v2/batch-save-answers";
import { saveScopeAnswer } from "@/lib/assistant-v2/save-scope-answer";
import {
  confirmPendingAssistantCommand,
  handleAssistantMessage,
} from "@/lib/assistant-v2/handle-assistant-message";
import {
  confirmInternalWorksPackages,
} from "@/lib/assistant-v2/confirm-internal-works";
import { acceptScopeSuggestion } from "@/actions/scope-suggestions";
import { ensureQuestionsForProjectScopes } from "@/lib/scope-questions-seed";
import { recalculateQuickEstimate } from "@/lib/cost-engine/recalculate-quick-estimate";
import { resolveWorkAreaTypeKey } from "@/lib/project-assistant-questions";
import { getProjectById } from "@/lib/projects-data";
import type { ScopeQuestionWithAnswers } from "@/lib/project-assistant-data";
import { createClient } from "@/lib/supabase/server";
import { logSupabaseError } from "@/lib/supabase/log-error";
import { getQuickEstimateForProject } from "@/lib/quick-estimate-data";
import { quickEstimateMarginSchema } from "@/lib/validations/project-assistant";
import type { QualityLevel } from "@/lib/constants/quality-level";
import type {
  ProjectScope,
  QuickEstimate,
} from "@/types/database";
import type { AssistantMessageRow } from "@/lib/assistant-v2/assistant-messages-data";

export type AssistantV2ActionState = {
  error?: string;
  success?: boolean;
  message?: string;
  fieldErrors?: Record<string, string[]>;
  analysingMode?: "ai" | "rules";
  usedFallback?: boolean;
  requiresConfirmation?: boolean;
  openBreakdown?: boolean;
  intent?: string;
  navigateTo?: string;
  rateScopes?: {
    scopeTypeKey: string;
    label: string;
    workAreaTypeKey: string;
    unit: string;
    benchmarkLow: number;
    benchmarkStandard: number;
    benchmarkPremium: number;
  }[];
  singleRateScope?: {
    scopeTypeKey: string;
    label: string;
    workAreaTypeKey: string;
    unit: string;
    benchmarkLow: number;
    benchmarkStandard: number;
    benchmarkPremium: number;
  } | null;
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
    message: "Assistant reset. Project details and notes are still saved.",
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

  const result = await handleAssistantMessage(supabase, {
    organisationId,
    projectId,
    userId: user.id,
    content,
  });

  if (result.error) {
    return { error: result.error };
  }

  revalidateProjectAssistant(projectId);
  return {
    success: true,
    message: result.message,
    analysingMode: result.analysingMode,
    usedFallback: result.usedFallback,
    requiresConfirmation: result.requiresConfirmation,
    openBreakdown: result.openBreakdown,
    intent: result.intent,
  };
}

export async function confirmAssistantCommand(
  projectId: string,
  pendingCommand: {
    intent: string;
    confidence: number;
    extractedPayload: Record<string, unknown>;
    requiresConfirmation: true;
  },
  confirmed: boolean
): Promise<AssistantV2ActionState> {
  const { user, organisationId } = await requireOrganisation();
  const supabase = await createClient();

  const result = await confirmPendingAssistantCommand(supabase, {
    organisationId,
    projectId,
    userId: user.id,
    pendingCommand: {
      intent: pendingCommand.intent as Parameters<
        typeof confirmPendingAssistantCommand
      >[1]["pendingCommand"]["intent"],
      confidence: pendingCommand.confidence,
      extractedPayload: pendingCommand.extractedPayload,
      requiresConfirmation: true,
    },
    confirmed,
  });

  if (result.error) {
    return { error: result.error };
  }

  revalidateProjectAssistant(projectId);
  return {
    success: true,
    message: result.message,
    openBreakdown: result.openBreakdown,
    intent: result.intent,
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
    revalidateScopeAnswers(projectId);
  }

  return { success: true };
}

export async function confirmAssistantWorkAreas(
  projectId: string,
  selections: WorkAreaSelection[]
): Promise<AssistantV2ActionState> {
  const { user, organisationId } = await requireOrganisation();
  const supabase = await createClient();

  const result = await confirmWorkAreaSelections(supabase, {
    organisationId,
    projectId,
    userId: user.id,
    selections,
  });

  if (result.error) {
    return { error: result.error };
  }

  revalidateScopeAnswers(projectId);
  return {
    success: true,
    message:
      result.includedNames.length > 0
        ? `Included ${result.includedNames.join(", ")} in estimate.`
        : "Work areas updated.",
  };
}

export async function reopenSiteConditions(
  projectId: string
): Promise<AssistantV2ActionState> {
  const { user, organisationId } = await requireOrganisation();
  const supabase = await createClient();

  const { error } = await clearSiteConditionsForEdit(
    supabase,
    organisationId,
    projectId,
    user.id
  );

  if (error) {
    return { error };
  }

  revalidateConstraintsAndEstimate(projectId);
  return { success: true, message: "Site conditions cleared — you can update them below." };
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
    revalidateConstraintsAndEstimate(projectId);
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
    revalidateScopeAnswers(projectId);
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
    revalidateConstraintsAndEstimate(projectId);
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
    revalidateEstimateOnly(projectId);
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

  revalidateEstimateOnly(projectId);
  return {
    success: result.success,
    error: result.error,
    message: result.message ?? "Estimate updated.",
  };
}

export type AssistantSyncPayload = {
  chatMessages: AssistantMessageRow[];
  quickEstimate: QuickEstimate | null;
  scopeQuestions: ScopeQuestionWithAnswers[];
  confirmedScopes: (ProjectScope & { scope_types: { name: string } | null })[];
  selectedConstraintSlugs: string[];
  declinedConstraintSlugs: string[];
  scopePackages: import("@/types/database").ProjectScopePackage[];
};

export async function syncAssistantState(
  projectId: string
): Promise<{ data?: AssistantSyncPayload; error?: string }> {
  const { user, organisationId } = await requireOrganisation();
  const supabase = await createClient();

  const { data, error } = await loadProjectAssistantData(
    supabase,
    organisationId,
    projectId,
    user.id
  );

  if (error || !data) {
    return { error: error ?? "Could not refresh assistant." };
  }

  return {
    data: {
      chatMessages: data.chatMessages,
      quickEstimate: data.quickEstimate,
      scopeQuestions: data.scopeQuestions,
      confirmedScopes: data.confirmedScopes,
      selectedConstraintSlugs: data.selectedConstraintSlugs,
      declinedConstraintSlugs: data.declinedConstraintSlugs,
      scopePackages: data.scopePackages ?? [],
    },
  };
}

export async function confirmInternalWorksSelection(
  projectId: string,
  params: {
    projectScopeId: string | null;
    broadCategoryKey: string;
    selectedPackageKeys: string[];
    noneApply: boolean;
  }
): Promise<AssistantV2ActionState> {
  const { user, organisationId } = await requireOrganisation();
  const supabase = await createClient();

  if (params.noneApply) {
    await insertAssistantMessage(supabase, {
      organisationId,
      projectId,
      userId: user.id,
      role: "user",
      content: "None of these apply",
      metadata: { messageType: "answer", internalWorksConfirmation: true },
    });
    await insertAssistantMessage(supabase, {
      organisationId,
      projectId,
      userId: user.id,
      role: "assistant",
      content:
        "No problem — tell me more about the internal works in your own words and I'll break them down.",
      metadata: { messageType: "assistant_text" },
    });
    revalidateProjectAssistant(projectId);
    return { success: true, message: "Noted." };
  }

  const result = await confirmInternalWorksPackages(supabase, {
    organisationId,
    projectId,
    userId: user.id,
    projectScopeId: params.projectScopeId,
    selectedPackageKeys: params.selectedPackageKeys,
    broadCategoryKey: params.broadCategoryKey,
  });

  if (result.error) {
    return { error: result.error };
  }

  revalidateProjectAssistant(projectId);
  revalidateEstimateOnly(projectId);
  return {
    success: true,
    message: result.scopeNoteMessage ?? "Internal works updated.",
  };
}

export async function updateAssistantMargin(
  projectId: string,
  targetMarginPercent: number
): Promise<AssistantV2ActionState> {
  const { organisationId } = await requireOrganisation();
  const supabase = await createClient();

  const parsed = quickEstimateMarginSchema.safeParse({ targetMarginPercent });
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
    return { success: true, message: "Margin unchanged." };
  }

  const { error: updateError } = await supabase
    .from("quick_estimates")
    .update({ target_margin_percent: parsed.data.targetMarginPercent })
    .eq("id", quickEstimate.id)
    .eq("organisation_id", organisationId);

  if (updateError) {
    logSupabaseError("updateAssistantMargin", updateError);
    return { error: "Could not save target margin." };
  }

  const result = await recalculateQuickEstimate(
    supabase,
    organisationId,
    projectId,
    { triggerEvent: "margin_changed" }
  );

  if (!result.success) {
    return { error: result.error ?? "Could not recalculate sell range." };
  }

  revalidateEstimateOnly(projectId);
  return {
    success: true,
    message: "Margin updated",
  };
}

export async function persistAssistantQuestionBatch(
  projectId: string,
  content: string,
  fingerprint: string,
  metadata?: Record<string, unknown>
): Promise<AssistantV2ActionState> {
  const { user, organisationId } = await requireOrganisation();
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("assistant_messages")
    .select("id, metadata")
    .eq("organisation_id", organisationId)
    .eq("project_id", projectId)
    .eq("role", "assistant")
    .order("created_at", { ascending: false })
    .limit(20);

  const alreadyPersisted = (existing ?? []).some((row) => {
    const meta = row.metadata as Record<string, unknown> | null;
    return meta?.batchFingerprint === fingerprint;
  });

  if (alreadyPersisted) {
    return { success: true };
  }

  await insertAssistantMessage(supabase, {
    organisationId,
    projectId,
    userId: user.id,
    role: "assistant",
    content,
    metadata: {
      messageType: "question_batch",
      batchFingerprint: fingerprint,
      ...metadata,
    },
  });

  revalidateAssistantTags(projectId, ["messages"]);
  return { success: true };
}

export async function refinementAnswerNow(
  projectId: string,
  refinementBatchId?: string,
  sourceMessageId?: string
): Promise<AssistantV2ActionState> {
  const { user, organisationId } = await requireOrganisation();
  const supabase = await createClient();

  const { executeRefinementAnswerNow } = await import(
    "@/lib/assistant-v2/refinement/execute-refinement-action"
  );

  const result = await executeRefinementAnswerNow(supabase, {
    organisationId,
    projectId,
    userId: user.id,
    refinementBatchId,
    sourceMessageId,
  });

  if (!result.success) {
    return { error: result.error ?? "Could not start refinement questions." };
  }

  revalidateProjectAssistant(projectId);
  return { success: true, message: result.message };
}

export async function refinementSkipForNow(
  projectId: string,
  refinementBatchId?: string,
  sourceMessageId?: string
): Promise<AssistantV2ActionState> {
  const { user, organisationId } = await requireOrganisation();
  const supabase = await createClient();

  const { executeRefinementSkip } = await import(
    "@/lib/assistant-v2/refinement/execute-refinement-action"
  );

  const result = await executeRefinementSkip(supabase, {
    organisationId,
    projectId,
    userId: user.id,
    refinementBatchId,
    sourceMessageId,
  });

  if (!result.success) {
    return { error: result.error ?? "Could not skip refinement." };
  }

  revalidateProjectAssistant(projectId);
  return { success: true, message: result.message };
}

export async function refinementAddMoreDetail(
  projectId: string,
  scopeId?: string
): Promise<AssistantV2ActionState> {
  const { user, organisationId } = await requireOrganisation();
  const supabase = await createClient();

  const { executeRefinementAddMoreDetail } = await import(
    "@/lib/assistant-v2/refinement/execute-refinement-action"
  );

  const result = await executeRefinementAddMoreDetail(supabase, {
    organisationId,
    projectId,
    userId: user.id,
    scopeId,
  });

  if (!result.success) {
    return { error: result.error ?? "Could not load optional details." };
  }

  revalidateProjectAssistant(projectId);
  return { success: true, message: result.message };
}

export async function refinementAddRates(
  projectId: string,
  refinementBatchId?: string,
  sourceMessageId?: string
): Promise<AssistantV2ActionState> {
  const { user, organisationId } = await requireOrganisation();
  const supabase = await createClient();

  const { executeRefinementAddRates } = await import(
    "@/lib/assistant-v2/refinement/execute-refinement-action"
  );

  const result = await executeRefinementAddRates(supabase, {
    organisationId,
    projectId,
    userId: user.id,
    refinementBatchId,
    sourceMessageId,
  });

  if (!result.success) {
    return { error: result.error ?? "Could not open rate setup." };
  }

  revalidateProjectAssistant(projectId);
  return {
    success: true,
    message: result.message,
    navigateTo: result.navigateTo,
    rateScopes: result.rateScopes,
    singleRateScope: result.singleRateScope,
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
