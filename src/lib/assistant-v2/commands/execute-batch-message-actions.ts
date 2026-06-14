import { insertAssistantMessage } from "@/lib/assistant-v2/assistant-messages-data";
import type { MessageAction } from "@/lib/assistant-v2/intent/types";
import { summarizeAppliedActions } from "@/lib/assistant-v2/intent/extract-message-actions";
import type { CommandResult } from "@/lib/assistant-v2/commands/update-allowance";
import { getDependentFollowUpQuestions } from "@/lib/assistant-v2/questions/get-dependent-follow-up-questions";
import { getKnownFactsForScope } from "@/lib/assistant-v2/facts/get-known-facts-for-scope";
import { recalculateQuickEstimate } from "@/lib/cost-engine/recalculate-quick-estimate";
import { saveConstraintAnswer } from "@/lib/assistant-v2/save-constraint-answer";
import { saveQualityLevel } from "@/lib/assistant-v2/save-quality-level";
import { persistScopeAnswersBatch } from "@/lib/scope-answers-persist";
import { ensureQuestionsForProjectScopes } from "@/lib/scope-questions-seed";
import { logSupabaseError } from "@/lib/supabase/log-error";
import { getScopeByWorkAreaType } from "@/lib/scopes";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { UpdateScopeFactPayload } from "@/lib/assistant-v2/intent/types";
import type { QualityLevel } from "@/lib/constants/quality-level";

type Supabase = SupabaseClient<Database>;

function groupFactUpdates(
  actions: MessageAction[]
): Map<string, UpdateScopeFactPayload> {
  const groups = new Map<string, UpdateScopeFactPayload>();

  for (const action of actions) {
    if (action.intent !== "update_existing_fact") continue;
    if (!action.scopeId || !action.factKey || !action.scopeTypeKey) continue;

    const scopeName =
      action.scopeTypeKey === "Deck"
        ? "Deck"
        : action.scopeTypeKey === "Retaining Wall"
          ? "Retaining wall"
          : action.scopeTypeKey;

    const existing = groups.get(action.scopeId);
    const item = {
      factKey: action.factKey,
      factLabel: action.factLabel ?? action.factKey,
      newValue: action.value,
      unit: action.unit,
    };

    if (!existing) {
      groups.set(action.scopeId, {
        scopeId: action.scopeId,
        scopeName,
        factKey: item.factKey,
        factLabel: item.factLabel,
        newValue: item.newValue,
        unit: item.unit,
        additionalFacts: [],
      });
    } else if (existing.factKey === item.factKey) {
      existing.newValue = item.newValue;
    } else {
      existing.additionalFacts = existing.additionalFacts ?? [];
      const dup = existing.additionalFacts.some((f) => f.factKey === item.factKey);
      if (!dup) {
        existing.additionalFacts.push(item);
      }
    }
  }

  return groups;
}

export async function executeBatchMessageActions(
  supabase: Supabase,
  params: {
    organisationId: string;
    projectId: string;
    userId: string;
    actions: MessageAction[];
    skipAssistantMessage?: boolean;
  }
): Promise<CommandResult & { followUpQuestions?: string[] }> {
  const factActions = params.actions.filter(
    (a) => a.intent === "update_existing_fact"
  );
  const constraintActions = params.actions.filter(
    (a) => a.intent === "update_constraint"
  );
  const finishActions = params.actions.filter(
    (a) => a.intent === "update_finish_level"
  );

  if (params.actions.length === 0) {
    return { success: true, message: "No estimate change needed." };
  }

  await ensureQuestionsForProjectScopes(
    supabase,
    params.organisationId,
    params.projectId
  );

  const batchAnswers: {
    scopeQuestionId: string;
    projectScopeId: string;
    answer: string;
  }[] = [];

  const factGroups = groupFactUpdates(factActions);

  for (const payload of factGroups.values()) {
    const allUpdates = [
      {
        factKey: payload.factKey,
        factLabel: payload.factLabel,
        newValue: payload.newValue,
      },
      ...(payload.additionalFacts ?? []),
    ];

    for (const update of allUpdates) {
      const { data: question } = await supabase
        .from("scope_questions")
        .select("id, project_scope_id")
        .eq("project_scope_id", payload.scopeId)
        .eq("organisation_id", params.organisationId)
        .eq("question_key", update.factKey)
        .maybeSingle();

      if (!question) continue;

      batchAnswers.push({
        scopeQuestionId: question.id,
        projectScopeId: question.project_scope_id,
        answer: update.newValue,
      });
    }
  }

  if (batchAnswers.length > 0) {
    const persistError = await persistScopeAnswersBatch(
      supabase,
      params.organisationId,
      batchAnswers
    );

    if (persistError) {
      logSupabaseError("executeBatchMessageActions", persistError);
      return {
        success: false,
        message: "",
        error: "Could not save the updated values.",
      };
    }
  }

  for (const action of finishActions) {
    await saveQualityLevel(supabase, {
      organisationId: params.organisationId,
      projectId: params.projectId,
      userId: params.userId,
      qualityLevel: action.value as QualityLevel,
      skipRecalc: true,
      skipThreadMessage: true,
    });
  }

  for (const action of constraintActions) {
    if (!action.constraintSlug) continue;
    await saveConstraintAnswer(supabase, {
      organisationId: params.organisationId,
      projectId: params.projectId,
      userId: params.userId,
      slug: action.constraintSlug,
      label: action.constraintLabel ?? action.constraintSlug,
      apply: action.value === "true" || Number(action.value) > 0,
      skipRecalc: true,
      skipThreadMessage: true,
    });
  }

  let recalculated = false;
  if (
    batchAnswers.length > 0 ||
    constraintActions.length > 0 ||
    finishActions.length > 0
  ) {
    await recalculateQuickEstimate(
      supabase,
      params.organisationId,
      params.projectId,
      {
        triggerEvent: "answer_changed",
        changeReason: `${params.actions.length} details updated`,
      }
    );
    recalculated = true;
  }

  const message = summarizeAppliedActions(params.actions);

  const followUps: string[] = [];
  for (const payload of factGroups.values()) {
    const scopeDef = getScopeByWorkAreaType(payload.scopeName === "Deck" ? "Deck" : payload.scopeName);
    if (!scopeDef) continue;

    const answers: Record<string, string> = {};
    answers[payload.factKey] = payload.newValue;
    for (const extra of payload.additionalFacts ?? []) {
      answers[extra.factKey] = extra.newValue;
    }

    const knownFacts = getKnownFactsForScope({
      scopeId: payload.scopeId,
      scopeTypeKey: scopeDef.workAreaTypeKey,
      answers,
    });

    for (const fq of getDependentFollowUpQuestions({
      knownFacts,
      changedFactKey: payload.factKey,
    })) {
      followUps.push(fq.questionText);
    }
  }

  if (!params.skipAssistantMessage) {
    let content = message;
    if (followUps.length > 0) {
      content += ` ${followUps.slice(0, 2).join(" ")}`;
    }

    await insertAssistantMessage(supabase, {
      organisationId: params.organisationId,
      projectId: params.projectId,
      userId: params.userId,
      role: "assistant",
      content,
      metadata: {
        messageType: "assistant_text",
        responseType: "action_applied",
        commandIntent: "update_existing_fact",
        batchSize: params.actions.length,
      },
    });
  }

  return {
    success: true,
    message,
    estimateRecalculated: recalculated,
    followUpQuestions: followUps.length > 0 ? followUps : undefined,
  };
}
