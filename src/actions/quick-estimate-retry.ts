"use server";

import { revalidateEstimateOnly } from "@/lib/assistant-v2/revalidate";
import { requireOrganisation } from "@/lib/auth";
import { recalculateQuickEstimate } from "@/lib/cost-engine/recalculate-quick-estimate";
import { getProjectById } from "@/lib/projects-data";
import { getQuickEstimateForProject } from "@/lib/quick-estimate-data";
import { createClient } from "@/lib/supabase/server";
import type { QuickEstimate } from "@/types/database";

export type RetryQuickEstimateResult = {
  success: boolean;
  estimate?: QuickEstimate | null;
  userMessage?: string;
  errorCode?: string;
  warning?: string;
};

export async function retryQuickEstimateAction(
  projectId: string
): Promise<RetryQuickEstimateResult> {
  const { organisationId } = await requireOrganisation();
  const supabase = await createClient();

  const { data: project, error: projectError } = await getProjectById(
    supabase,
    projectId,
    organisationId
  );

  if (projectError || !project) {
    return {
      success: false,
      userMessage: "Project not found.",
      errorCode: "PROJECT_NOT_FOUND",
    };
  }

  const result = await recalculateQuickEstimate(
    supabase,
    organisationId,
    projectId,
    { triggerEvent: "manual_retry" }
  );

  revalidateEstimateOnly(projectId);

  const { data: estimate } = await getQuickEstimateForProject(
    supabase,
    organisationId,
    projectId
  );

  if (!result.success) {
    console.error(
      "[retryQuickEstimateAction]",
      result.technicalMessage ?? result.error
    );
    return {
      success: false,
      estimate: estimate ?? null,
      userMessage:
        result.userMessage ??
        result.error ??
        "Something went wrong while calculating. Retry using the latest project details.",
      errorCode: result.errorCode,
    };
  }

  return {
    success: true,
    estimate: estimate ?? null,
    userMessage: result.warning
      ? `${result.message ?? "Estimate updated."} ${result.warning}`
      : result.message ?? "Estimate updated.",
    warning: result.warning,
  };
}
