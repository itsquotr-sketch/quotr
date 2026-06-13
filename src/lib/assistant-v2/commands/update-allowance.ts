import { insertAssistantMessage } from "@/lib/assistant-v2/assistant-messages-data";
import { labelForAllowanceKey } from "@/lib/assistant-v2/intent/allowance-keys";
import type { UpdateAllowancePayload } from "@/lib/assistant-v2/intent/types";
import {
  findProjectAllowance,
  upsertProjectAllowance,
} from "@/lib/assistant-v2/project-allowances-data";
import { recalculateQuickEstimate } from "@/lib/cost-engine/recalculate-quick-estimate";
import { getProjectById } from "@/lib/projects-data";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type Supabase = SupabaseClient<Database>;

export type CommandResult = {
  success: boolean;
  message: string;
  error?: string;
  estimateRecalculated?: boolean;
};

export async function executeUpdateAllowance(
  supabase: Supabase,
  params: {
    organisationId: string;
    projectId: string;
    userId: string;
    payload: UpdateAllowancePayload;
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

  if (!params.payload.amount || params.payload.amount <= 0) {
    return {
      success: false,
      message: "",
      error: "Please specify a valid allowance amount.",
    };
  }

  const label =
    params.payload.label || labelForAllowanceKey(params.payload.allowanceKey);

  const { error } = await upsertProjectAllowance(supabase, {
    organisationId: params.organisationId,
    projectId: params.projectId,
    allowanceKey: params.payload.allowanceKey,
    label,
    amount: params.payload.amount,
    source: "user",
  });

  if (error) {
    return { success: false, message: "", error };
  }

  await recalculateQuickEstimate(
    supabase,
    params.organisationId,
    params.projectId,
    {
      triggerEvent: "allowance_changed",
      changeReason: `${label} allowance updated`,
    }
  );

  const formatted = `$${params.payload.amount.toLocaleString("en-NZ")}`;
  const assistantMessage = `Updated ${label.toLowerCase()} allowance to ${formatted}.`;

  if (!params.skipThreadMessages) {
    await insertAssistantMessage(supabase, {
      organisationId: params.organisationId,
      projectId: params.projectId,
      userId: params.userId,
      role: "assistant",
      content: assistantMessage,
      metadata: {
        messageType: "assistant_text",
        commandIntent: "update_allowance",
        allowanceKey: params.payload.allowanceKey,
        amount: params.payload.amount,
      },
    });
  }

  return {
    success: true,
    message: assistantMessage,
    estimateRecalculated: true,
  };
}

export async function checkExistingAllowance(
  supabase: Supabase,
  organisationId: string,
  projectId: string,
  allowanceKey: string
): Promise<boolean> {
  const existing = await findProjectAllowance(
    supabase,
    organisationId,
    projectId,
    allowanceKey
  );
  return existing != null;
}
