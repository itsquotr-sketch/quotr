import { recalculateQuickEstimate } from "@/lib/cost-engine/recalculate-quick-estimate";
import { insertAssistantMessage } from "@/lib/assistant-v2/assistant-messages-data";
import { saveConstraintAnswer } from "@/lib/assistant-v2/save-constraint-answer";
import { saveScopeAnswer } from "@/lib/assistant-v2/save-scope-answer";
import { saveQualityLevel } from "@/lib/assistant-v2/save-quality-level";
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

  let anyChanged = false;

  for (const item of params.answers) {
    const result = await saveScopeAnswer(supabase, {
      organisationId: params.organisationId,
      projectId: params.projectId,
      userId: params.userId,
      questionId: item.questionId,
      answer: item.answer,
      skipRecalc: true,
      skipThreadMessage: true,
    });

    if ("error" in result) {
      return { error: result.error, changed: anyChanged };
    }
    if (result.changed) anyChanged = true;
  }

  if (anyChanged) {
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
      content: `Got it — I've updated the estimate with ${params.answers.length === 1 ? "that detail" : "those details"}.`,
      metadata: { messageType: "assistant_text" },
    });

    await recalculateQuickEstimate(
      supabase,
      params.organisationId,
      params.projectId,
      { triggerEvent: "answer_changed" }
    );
  }

  return { changed: anyChanged };
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

  let anyChanged = false;
  const applied: string[] = [];

  for (const item of params.selections) {
    const result = await saveConstraintAnswer(supabase, {
      organisationId: params.organisationId,
      projectId: params.projectId,
      userId: params.userId,
      slug: item.slug,
      label: item.label,
      apply: item.apply,
      skipRecalc: true,
      skipThreadMessage: true,
    });

    if ("error" in result) {
      return { error: result.error, changed: anyChanged };
    }
    if (result.changed) {
      anyChanged = true;
      if (item.apply) applied.push(item.label);
    }
  }

  const appliedLabels = params.selections
    .filter((s) => s.apply)
    .map((s) => s.label);
  const declinedItems = params.selections.filter((s) => !s.apply);

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
      },
    });
  } else if (declinedItems.length > 0) {
    await insertAssistantMessage(supabase, {
      organisationId: params.organisationId,
      projectId: params.projectId,
      userId: params.userId,
      role: "user",
      content: "None of these apply",
      metadata: { messageType: "constraint_declined", batchSize: declinedItems.length },
    });
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
      content: `Got it. I've added ${summary.toLowerCase()} allowances.`,
      metadata: { messageType: "assistant_text", batchSize: applied.length },
    });

    await recalculateQuickEstimate(
      supabase,
      params.organisationId,
      params.projectId,
      { triggerEvent: "constraint_changed" }
    );
  } else if (anyChanged) {
    await insertAssistantMessage(supabase, {
      organisationId: params.organisationId,
      projectId: params.projectId,
      userId: params.userId,
      role: "assistant",
      content: "Got it — noted.",
      metadata: { messageType: "assistant_text" },
    });
  }

  return { changed: anyChanged };
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
