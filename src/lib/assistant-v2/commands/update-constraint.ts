import { saveConstraintAnswer } from "@/lib/assistant-v2/save-constraint-answer";
import type { UpdateConstraintPayload } from "@/lib/assistant-v2/intent/types";
import type { CommandResult } from "@/lib/assistant-v2/commands/update-allowance";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type Supabase = SupabaseClient<Database>;

export async function executeUpdateConstraint(
  supabase: Supabase,
  params: {
    organisationId: string;
    projectId: string;
    userId: string;
    payload: UpdateConstraintPayload;
  }
): Promise<CommandResult> {
  const result = await saveConstraintAnswer(supabase, {
    organisationId: params.organisationId,
    projectId: params.projectId,
    userId: params.userId,
    slug: params.payload.slug,
    label: params.payload.label,
    apply: params.payload.apply,
  });

  if ("error" in result) {
    return { success: false, message: "", error: result.error };
  }

  return {
    success: true,
    message: params.payload.apply
      ? `${params.payload.label} applied to this estimate.`
      : `${params.payload.label} noted — not applied.`,
    estimateRecalculated: result.changed && params.payload.apply,
  };
}
