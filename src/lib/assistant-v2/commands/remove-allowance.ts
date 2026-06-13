import { insertAssistantMessage } from "@/lib/assistant-v2/assistant-messages-data";
import { labelForAllowanceKey } from "@/lib/assistant-v2/intent/allowance-keys";
import type { RemoveAllowancePayload } from "@/lib/assistant-v2/intent/types";
import type { CommandResult } from "@/lib/assistant-v2/commands/update-allowance";
import {
  deactivateProjectAllowance,
  findProjectAllowance,
} from "@/lib/assistant-v2/project-allowances-data";
import { recalculateQuickEstimate } from "@/lib/cost-engine/recalculate-quick-estimate";
import { getProjectById } from "@/lib/projects-data";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type Supabase = SupabaseClient<Database>;

export async function executeRemoveAllowance(
  supabase: Supabase,
  params: {
    organisationId: string;
    projectId: string;
    userId: string;
    payload: RemoveAllowancePayload;
    skipThreadMessages?: boolean;
  }
): Promise<CommandResult> {
  const { data: project, error: projectError } = await getProjectById(
    supabase,
    params.projectId,
    params.organisationId
  );

  if (projectError || !project) {
    return { success: false, message: "", error: "Project not found." };
  }

  const label =
    params.payload.label ||
    labelForAllowanceKey(params.payload.allowanceKey);

  const existing = await findProjectAllowance(
    supabase,
    params.organisationId,
    params.projectId,
    params.payload.allowanceKey
  );

  if (!existing) {
    return {
      success: false,
      message: "",
      error: `No active ${label.toLowerCase()} allowance found to remove.`,
    };
  }

  const { error } = await deactivateProjectAllowance(
    supabase,
    params.organisationId,
    existing.id
  );

  if (error) {
    return { success: false, message: "", error };
  }

  await recalculateQuickEstimate(
    supabase,
    params.organisationId,
    params.projectId,
    {
      triggerEvent: "allowance_changed",
      changeReason: `${label} allowance removed`,
    }
  );

  const assistantMessage = `Removed ${label.toLowerCase()} from this estimate.`;

  if (!params.skipThreadMessages) {
    await insertAssistantMessage(supabase, {
      organisationId: params.organisationId,
      projectId: params.projectId,
      userId: params.userId,
      role: "assistant",
      content: assistantMessage,
      metadata: {
        messageType: "assistant_text",
        commandIntent: "remove_allowance",
        allowanceKey: params.payload.allowanceKey,
      },
    });
  }

  return {
    success: true,
    message: assistantMessage,
    estimateRecalculated: true,
  };
}
