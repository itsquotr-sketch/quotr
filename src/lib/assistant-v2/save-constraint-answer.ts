import { recalculateQuickEstimate } from "@/lib/cost-engine/recalculate-quick-estimate";
import { loadSavedProjectConstraints } from "@/lib/project-constraints-load";
import { upsertConstraintAssessment } from "@/lib/project-constraints-persist";
import { getProjectById } from "@/lib/projects-data";
import { ensureQuickEstimateForProject } from "@/lib/quick-estimate-data";
import { insertAssistantMessage } from "@/lib/assistant-v2/assistant-messages-data";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type Supabase = SupabaseClient<Database>;

export type SaveConstraintAnswerResult =
  | { success: true; changed: boolean }
  | { error: string };

export async function saveConstraintAnswer(
  supabase: Supabase,
  params: {
    organisationId: string;
    projectId: string;
    userId: string;
    slug: string;
    label: string;
    apply: boolean;
    skipRecalc?: boolean;
    skipThreadMessage?: boolean;
  }
): Promise<SaveConstraintAnswerResult> {
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

  const saved = await loadSavedProjectConstraints(
    supabase,
    params.organisationId,
    params.projectId,
    estimate.id
  );

  const wasApplied = saved.slugs.includes(params.slug);
  const wasDeclined = saved.declinedSlugs.includes(params.slug);
  const changed =
    params.apply ? !wasApplied : !wasDeclined;

  if (changed) {
    const persistError = await upsertConstraintAssessment(supabase, {
      organisationId: params.organisationId,
      projectId: params.projectId,
      quickEstimateId: estimate.id,
      userId: params.userId,
      slug: params.slug,
      apply: params.apply,
      followUp: saved.followUpValues[params.slug],
    });

    if (persistError) {
      return { error: "Could not save constraint." };
    }
  }

  if (!params.skipThreadMessage && !params.apply) {
    await insertAssistantMessage(supabase, {
      organisationId: params.organisationId,
      projectId: params.projectId,
      userId: params.userId,
      role: "user",
      content: `No — ${params.label.toLowerCase()}.`,
      metadata: {
        messageType: "constraint_declined",
        constraintSlug: params.slug,
      },
    });
    await insertAssistantMessage(supabase, {
      organisationId: params.organisationId,
      projectId: params.projectId,
      userId: params.userId,
      role: "assistant",
      content: "Got it — noted.",
      metadata: { messageType: "assistant_text", constraintSlug: params.slug },
    });
  } else if (!params.skipThreadMessage && params.apply && changed) {
    await insertAssistantMessage(supabase, {
      organisationId: params.organisationId,
      projectId: params.projectId,
      userId: params.userId,
      role: "user",
      content: `Yes — ${params.label.toLowerCase()}.`,
      metadata: {
        messageType: "constraint_answer",
        constraintSlug: params.slug,
        answerValue: "yes",
      },
    });
    await insertAssistantMessage(supabase, {
      organisationId: params.organisationId,
      projectId: params.projectId,
      userId: params.userId,
      role: "assistant",
      content: `${params.label} — allowance included.`,
      metadata: {
        messageType: "assistant_text",
        constraintSlug: params.slug,
      },
    });
  }

  if (changed && params.apply && !params.skipRecalc) {
    await recalculateQuickEstimate(
      supabase,
      params.organisationId,
      params.projectId,
      { triggerEvent: "constraint_changed" }
    );
  }

  return { success: true, changed };
}
