import { insertAssistantMessage } from "@/lib/assistant-v2/assistant-messages-data";
import {
  buildAutopilotInputFromAssistantData,
  getNextRequiredAssistantStep,
  type GetNextRequiredAssistantStepResult,
} from "@/lib/assistant-v2/autopilot/get-next-required-assistant-step";
import { formatConstraintBatchContent } from "@/lib/assistant-v2/format-question-batch";
import { formatScopeBatchContent } from "@/lib/assistant-v2/format-question-batch";
import { questionBatchFingerprint } from "@/lib/assistant-v2/format-question-batch";
import { collectAnsweredQuestionKeys } from "@/lib/assistant-v2/get-next-assistant-turn";
import { loadProjectAssistantData } from "@/lib/assistant-v2/load-assistant-data";
import { buildMergedAnswersForScope } from "@/lib/assistant-v2/build-merged-answers";
import { recalculateQuickEstimate } from "@/lib/cost-engine/recalculate-quick-estimate";
import type { ScopeGroupInput } from "@/lib/assistant-v2/get-next-pricing-question";
import { normaliseQualityLevel } from "@/lib/constants/quality-level";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type Supabase = SupabaseClient<Database>;

const QUALITY_FINGERPRINT = "quality:spec_level";

async function messageAlreadyPersisted(
  supabase: Supabase,
  organisationId: string,
  projectId: string,
  fingerprint: string
): Promise<boolean> {
  const { data: existing } = await supabase
    .from("assistant_messages")
    .select("id, metadata")
    .eq("organisation_id", organisationId)
    .eq("project_id", projectId)
    .eq("role", "assistant")
    .order("created_at", { ascending: false })
    .limit(30);

  return (existing ?? []).some((row) => {
    const meta = row.metadata as Record<string, unknown> | null;
    return meta?.batchFingerprint === fingerprint;
  });
}

async function appendAutopilotTurn(
  supabase: Supabase,
  params: {
    organisationId: string;
    projectId: string;
    userId: string;
    turn: GetNextRequiredAssistantStepResult;
  }
): Promise<boolean> {
  const { turn } = params;

  if (!turn.shouldContinue) {
    return false;
  }

  if (turn.step === "ask_quality") {
    if (
      await messageAlreadyPersisted(
        supabase,
        params.organisationId,
        params.projectId,
        QUALITY_FINGERPRINT
      )
    ) {
      return false;
    }

    await insertAssistantMessage(supabase, {
      organisationId: params.organisationId,
      projectId: params.projectId,
      userId: params.userId,
      role: "assistant",
      content: turn.message,
      metadata: {
        messageType: "quality_question",
        batchFingerprint: QUALITY_FINGERPRINT,
      },
    });
    return true;
  }

  if (
    turn.step === "ask_required_scope_questions" ||
    turn.step === "ask_useful_refinement"
  ) {
    if (turn.questions.length === 0) return false;

    const fingerprint = questionBatchFingerprint(
      turn.step === "ask_required_scope_questions" ? "scope" : "optional",
      turn.questions.map((q) => q.questionId)
    );

    if (
      await messageAlreadyPersisted(
        supabase,
        params.organisationId,
        params.projectId,
        fingerprint
      )
    ) {
      return false;
    }

    const content = formatScopeBatchContent(turn.message, turn.questions);
    await insertAssistantMessage(supabase, {
      organisationId: params.organisationId,
      projectId: params.projectId,
      userId: params.userId,
      role: "assistant",
      content,
      metadata: {
        messageType: "question_batch",
        batchFingerprint: fingerprint,
        kind:
          turn.step === "ask_required_scope_questions"
            ? "scope_batch"
            : "optional_batch",
        questionIds: turn.questions.map((q) => q.questionId),
        hasRequired: turn.step === "ask_required_scope_questions",
      },
    });
    return true;
  }

  if (turn.step === "ask_site_conditions" && turn.constraints?.length) {
    const fingerprint = questionBatchFingerprint(
      "constraint",
      turn.constraints.map((c) => c.slug)
    );

    if (
      await messageAlreadyPersisted(
        supabase,
        params.organisationId,
        params.projectId,
        fingerprint
      )
    ) {
      return false;
    }

    const content = formatConstraintBatchContent(turn.constraints);
    await insertAssistantMessage(supabase, {
      organisationId: params.organisationId,
      projectId: params.projectId,
      userId: params.userId,
      role: "assistant",
      content,
      metadata: {
        messageType: "question_batch",
        batchFingerprint: fingerprint,
        kind: "constraint_batch",
        constraintSlugs: turn.constraints.map((c) => c.slug),
      },
    });
    return true;
  }

  if (turn.step === "ask_pricing_source" && turn.pricingAlert) {
    const fingerprint = `pricing:${turn.targetScopeIds.join(",")}`;
    if (
      await messageAlreadyPersisted(
        supabase,
        params.organisationId,
        params.projectId,
        fingerprint
      )
    ) {
      return false;
    }

    await insertAssistantMessage(supabase, {
      organisationId: params.organisationId,
      projectId: params.projectId,
      userId: params.userId,
      role: "assistant",
      content: turn.message,
      metadata: {
        messageType: "pricing_source",
        batchFingerprint: fingerprint,
        options: turn.pricingAlert.options,
      },
    });
    return true;
  }

  return false;
}

function buildScopeGroups(
  data: NonNullable<Awaited<ReturnType<typeof loadProjectAssistantData>>["data"]>
): ScopeGroupInput[] {
  return data.confirmedScopes
    .filter((s) => s.include_in_quick_estimate !== false)
    .map((scope) => ({
      scopeId: scope.id,
      scopeName: scope.name,
      scopeTypeName: scope.scope_types?.name ?? null,
      questions: data.scopeQuestions.filter(
        (q) => q.project_scope_id === scope.id
      ),
      answers: buildMergedAnswersForScope(
        scope.id,
        scope.name,
        scope.scope_types?.name ?? null,
        data.scopeQuestions,
        data.discovery
      ),
    }));
}

export async function runAssistantAutopilot(
  supabase: Supabase,
  params: {
    organisationId: string;
    projectId: string;
    userId: string;
    pendingSuggestionCount?: number;
    allowEstimateGeneration?: boolean;
    maxDepth?: number;
  }
): Promise<{ appended: boolean; step?: string; estimateGenerated?: boolean }> {
  const maxDepth = params.maxDepth ?? 2;
  if (maxDepth <= 0) {
    return { appended: false };
  }

  const { data, error } = await loadProjectAssistantData(
    supabase,
    params.organisationId,
    params.projectId,
    params.userId
  );

  if (error || !data) {
    return { appended: false };
  }

  const scopeGroups = buildScopeGroups(data);
  const answeredKeys = collectAnsweredQuestionKeys(data.scopeQuestions);
  const pendingCount =
    params.pendingSuggestionCount ??
    data.suggestions.filter((s) => s.status === "pending").length;

  const autopilotInput = buildAutopilotInputFromAssistantData({
    confirmedScopes: data.confirmedScopes,
    scopeGroups,
    scopeQuestions: data.scopeQuestions,
    discovery: data.discovery,
    qualityLevel: normaliseQualityLevel(
      data.quickEstimate?.quality_level ?? "unknown"
    ),
    sourceNotes: data.quickEstimate?.source_notes ?? undefined,
    selectedConstraintSlugs: data.selectedConstraintSlugs,
    declinedConstraintSlugs: data.declinedConstraintSlugs,
    answeredQuestionKeys: answeredKeys,
    pendingSuggestionCount: pendingCount,
    quickEstimate: data.quickEstimate,
  });

  const turn = getNextRequiredAssistantStep(autopilotInput);

  if (turn.step === "generate_estimate" && params.allowEstimateGeneration !== false) {
    const result = await recalculateQuickEstimate(
      supabase,
      params.organisationId,
      params.projectId,
      { triggerEvent: "autopilot_generate" }
    );

    if (result.success) {
      const followUp = await runAssistantAutopilot(supabase, {
        ...params,
        allowEstimateGeneration: false,
        maxDepth: maxDepth - 1,
      });
      return {
        appended: followUp.appended,
        step: turn.step,
        estimateGenerated: true,
      };
    }

    return { appended: false, step: turn.step, estimateGenerated: false };
  }

  const appended = await appendAutopilotTurn(supabase, {
    organisationId: params.organisationId,
    projectId: params.projectId,
    userId: params.userId,
    turn,
  });

  return { appended, step: turn.step };
}
