import { saveQualityLevel } from "@/lib/assistant-v2/save-quality-level";
import type { UpdateFinishLevelPayload } from "@/lib/assistant-v2/intent/types";
import type { CommandResult } from "@/lib/assistant-v2/commands/update-allowance";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type Supabase = SupabaseClient<Database>;

export async function executeUpdateFinishLevel(
  supabase: Supabase,
  params: {
    organisationId: string;
    projectId: string;
    userId: string;
    payload: UpdateFinishLevelPayload;
  }
): Promise<CommandResult> {
  const result = await saveQualityLevel(supabase, {
    organisationId: params.organisationId,
    projectId: params.projectId,
    userId: params.userId,
    qualityLevel: params.payload.qualityLevel,
  });

  if ("error" in result) {
    return { success: false, message: "", error: result.error };
  }

  if (!result.changed) {
    return {
      success: true,
      message: `Finish level is already set to ${result.label}.`,
      estimateRecalculated: false,
    };
  }

  return {
    success: true,
    message: `Finish level updated to ${result.label}.`,
    estimateRecalculated: true,
  };
}
