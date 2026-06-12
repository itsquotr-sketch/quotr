import { recalculateQuickEstimate } from "@/lib/cost-engine/recalculate-quick-estimate";
import { loadSavedProjectConstraints } from "@/lib/project-constraints-load";
import { persistProjectConstraints } from "@/lib/project-constraints-persist";
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
    estimate.id
  );

  const currentSlugs = new Set(saved.slugs);
  const hadSlug = currentSlugs.has(params.slug);

  if (params.apply) {
    currentSlugs.add(params.slug);
  } else {
    currentSlugs.delete(params.slug);
  }

  const changed = params.apply ? !hadSlug : hadSlug;

  if (params.apply && changed) {
    const formData = new FormData();
    for (const slug of currentSlugs) {
      formData.append("constraintSlugs", slug);
      const followUp = saved.followUpValues[slug];
      if (followUp != null) {
        formData.set(`followUp_${slug}`, String(followUp));
      }
    }

    const persistError = await persistProjectConstraints(supabase, {
      organisationId: params.organisationId,
      projectId: params.projectId,
      quickEstimateId: estimate.id,
      userId: params.userId,
      constraintSlugs: [...currentSlugs],
      formData,
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
  } else if (!params.skipThreadMessage && changed) {
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

  if (changed && !params.skipRecalc) {
    await recalculateQuickEstimate(
      supabase,
      params.organisationId,
      params.projectId,
      { triggerEvent: "constraint_changed" }
    );
  }

  return { success: true, changed: changed || !params.apply };
}
