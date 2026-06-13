import { insertAssistantMessage } from "@/lib/assistant-v2/assistant-messages-data";
import type { UpdateMarginPayload } from "@/lib/assistant-v2/intent/types";
import type { CommandResult } from "@/lib/assistant-v2/commands/update-allowance";
import { recalculateQuickEstimate } from "@/lib/cost-engine/recalculate-quick-estimate";
import { getQuickEstimateForProject } from "@/lib/quick-estimate-data";
import { logSupabaseError } from "@/lib/supabase/log-error";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type Supabase = SupabaseClient<Database>;

export async function executeUpdateMargin(
  supabase: Supabase,
  params: {
    organisationId: string;
    projectId: string;
    userId: string;
    payload: UpdateMarginPayload;
  }
): Promise<CommandResult> {
  const { data: quickEstimate } = await getQuickEstimateForProject(
    supabase,
    params.organisationId,
    params.projectId
  );

  if (!quickEstimate) {
    return { success: false, message: "", error: "Quick estimate not found." };
  }

  const currentMargin = Number(quickEstimate.target_margin_percent ?? 0);
  if (currentMargin === params.payload.targetMarginPercent) {
    const message = `Sell margin is already set to ${params.payload.targetMarginPercent}%.`;
    await insertAssistantMessage(supabase, {
      organisationId: params.organisationId,
      projectId: params.projectId,
      userId: params.userId,
      role: "assistant",
      content: message,
      metadata: {
        messageType: "assistant_text",
        responseType: "action_applied",
        commandIntent: "update_margin",
      },
    });
    return { success: true, message, estimateRecalculated: false };
  }

  const { error: updateError } = await supabase
    .from("quick_estimates")
    .update({ target_margin_percent: params.payload.targetMarginPercent })
    .eq("id", quickEstimate.id)
    .eq("organisation_id", params.organisationId);

  if (updateError) {
    logSupabaseError("executeUpdateMargin", updateError);
    return { success: false, message: "", error: "Could not save target margin." };
  }

  await recalculateQuickEstimate(
    supabase,
    params.organisationId,
    params.projectId,
    { triggerEvent: "margin_changed" }
  );

  const message = `Sell margin updated to ${params.payload.targetMarginPercent}%. Estimate updated.`;

  await insertAssistantMessage(supabase, {
    organisationId: params.organisationId,
    projectId: params.projectId,
    userId: params.userId,
    role: "assistant",
    content: message,
    metadata: {
      messageType: "assistant_text",
      responseType: "action_applied",
      commandIntent: "update_margin",
      targetMarginPercent: params.payload.targetMarginPercent,
    },
  });

  return {
    success: true,
    message,
    estimateRecalculated: true,
  };
}
