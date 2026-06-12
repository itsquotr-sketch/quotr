import { labelForQualityLevel, type QualityLevel } from "@/lib/constants/quality-level";
import { recalculateQuickEstimate } from "@/lib/cost-engine/recalculate-quick-estimate";
import { insertAssistantMessage } from "@/lib/assistant-v2/assistant-messages-data";
import { getProjectById } from "@/lib/projects-data";
import { ensureQuickEstimateForProject } from "@/lib/quick-estimate-data";
import { logSupabaseError } from "@/lib/supabase/log-error";
import { qualityLevelSchema } from "@/lib/constants/quality-level";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type Supabase = SupabaseClient<Database>;

export type SaveQualityLevelResult =
  | { success: true; changed: boolean; label: string }
  | { error: string };

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

  return { success: true, changed: true, label };
}
