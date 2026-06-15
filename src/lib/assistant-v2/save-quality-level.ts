import { runAssistantAutopilot } from "@/lib/assistant-v2/autopilot/run-assistant-autopilot";
import { labelForQualityLevel, type QualityLevel } from "@/lib/constants/quality-level";
import { recalculateQuickEstimate } from "@/lib/cost-engine/recalculate-quick-estimate";
import { insertAssistantMessage } from "@/lib/assistant-v2/assistant-messages-data";
import { getProjectById } from "@/lib/projects-data";
import { ensureQuickEstimateForProject } from "@/lib/quick-estimate-data";
import { resolveWorkAreaTypeKey } from "@/lib/project-assistant-questions";
import { normalizeQuestionKey } from "@/lib/question-keys";
import { getAllFactsForScope, getScopeByWorkAreaType } from "@/lib/scopes";
import { persistScopeAnswer } from "@/lib/scope-answers-persist";
import { ensureQuestionsForProjectScopes } from "@/lib/scope-questions-seed";
import { logSupabaseError } from "@/lib/supabase/log-error";
import { qualityLevelSchema } from "@/lib/constants/quality-level";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type Supabase = SupabaseClient<Database>;

export type SaveQualityLevelResult =
  | { success: true; changed: boolean; label: string }
  | { error: string };

async function propagateGlobalFinishToScopes(
  supabase: Supabase,
  params: {
    organisationId: string;
    projectId: string;
    qualityLevel: QualityLevel;
  }
): Promise<void> {
  if (params.qualityLevel === "unknown") return;

  await ensureQuestionsForProjectScopes(
    supabase,
    params.organisationId,
    params.projectId
  );

  const { data: scopes } = await supabase
    .from("project_scopes")
    .select("id, name, scope_types(name), include_in_quick_estimate")
    .eq("project_id", params.projectId)
    .eq("organisation_id", params.organisationId);

  if (!scopes?.length) return;

  const scopeIds = scopes.map((s) => s.id);
  const { data: questions } = await supabase
    .from("scope_questions")
    .select("id, project_scope_id, question_key")
    .in("project_scope_id", scopeIds);

  const questionIds = questions?.map((q) => q.id) ?? [];
  const { data: answers } = questionIds.length
    ? await supabase
        .from("scope_answers")
        .select("scope_question_id, answer, source")
        .in("scope_question_id", questionIds)
    : { data: [] as { scope_question_id: string; answer: string; source: string }[] };

  const answersByQuestionId = new Map(
    (answers ?? []).map((row) => [row.scope_question_id, row])
  );

  for (const scope of scopes) {
    if (scope.include_in_quick_estimate === false) continue;

    const typeKey = resolveWorkAreaTypeKey(
      (scope.scope_types as { name: string } | null)?.name ?? null,
      scope.name
    );
    const scopeDef = getScopeByWorkAreaType(typeKey);
    if (!scopeDef) continue;

    for (const fact of getAllFactsForScope(scopeDef)) {
      if (!fact.key.includes("finish_level")) continue;

      const question = questions?.find(
        (q) =>
          q.project_scope_id === scope.id &&
          normalizeQuestionKey(q.question_key) === fact.key
      );
      if (!question) continue;

      const existing = answersByQuestionId.get(question.id);
      const existingSource = existing?.source ?? "";
      if (existingSource === "user" && existing?.answer) {
        continue;
      }

      await persistScopeAnswer(supabase, {
        organisationId: params.organisationId,
        scopeQuestionId: question.id,
        projectScopeId: scope.id,
        answer: params.qualityLevel,
        source: "discovery",
      });
    }
  }
}

export async function saveQualityLevel(
  supabase: Supabase,
  params: {
    organisationId: string;
    projectId: string;
    userId: string;
    qualityLevel: QualityLevel;
    skipRecalc?: boolean;
    skipThreadMessage?: boolean;
  }
): Promise<SaveQualityLevelResult> {
  const parsed = qualityLevelSchema.safeParse(params.qualityLevel);
  if (!parsed.success) {
    return { error: "Invalid finish level." };
  }

  const { data: project, error: projectError } = await getProjectById(
    supabase,
    params.projectId,
    params.organisationId
  );

  if (projectError || !project) {
    return { error: "Project not found." };
  }

  const estimate = await ensureQuickEstimateForProject(
    supabase,
    params.organisationId,
    params.projectId,
    params.userId
  );

  if (!estimate) {
    return { error: "Could not load estimate." };
  }

  const current = estimate.quality_level ?? "unknown";
  if (current === parsed.data) {
    return { success: true, changed: false, label: labelForQualityLevel(parsed.data) };
  }

  const { error: updateError } = await supabase
    .from("quick_estimates")
    .update({ quality_level: parsed.data })
    .eq("id", estimate.id)
    .eq("organisation_id", params.organisationId);

  if (updateError) {
    logSupabaseError("saveQualityLevel", updateError);
    return { error: "Could not save finish level." };
  }

  await propagateGlobalFinishToScopes(supabase, {
    organisationId: params.organisationId,
    projectId: params.projectId,
    qualityLevel: parsed.data,
  });

  const label = labelForQualityLevel(parsed.data);

  if (!params.skipThreadMessage) {
    await insertAssistantMessage(supabase, {
      organisationId: params.organisationId,
      projectId: params.projectId,
      userId: params.userId,
      role: "user",
      content: `Set finish level to ${label}.`,
      metadata: {
        messageType: "quality_change",
        qualityLevel: parsed.data,
      },
    });

    await insertAssistantMessage(supabase, {
      organisationId: params.organisationId,
      projectId: params.projectId,
      userId: params.userId,
      role: "assistant",
      content: `Finish level updated to ${label}. Recalculating your estimate.`,
      metadata: { messageType: "assistant_text" },
    });
  }

  if (!params.skipRecalc) {
    await recalculateQuickEstimate(
      supabase,
      params.organisationId,
      params.projectId,
      { triggerEvent: "quality_changed" }
    );
  }

  await runAssistantAutopilot(supabase, {
    organisationId: params.organisationId,
    projectId: params.projectId,
    userId: params.userId,
    allowEstimateGeneration: false,
  });

  return { success: true, changed: true, label };
}
