import { ensureQuickEstimateForProject } from "@/lib/quick-estimate-data";
import { recalculateQuickEstimate } from "@/lib/cost-engine/recalculate-quick-estimate";
import { logSupabaseError } from "@/lib/supabase/log-error";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type Supabase = SupabaseClient<Database>;

/** Clears saved site constraint answers so the user can re-answer them. */
export async function clearSiteConditionsForEdit(
  supabase: Supabase,
  organisationId: string,
  projectId: string,
  userId: string
): Promise<{ error: string | null }> {
  const estimate = await ensureQuickEstimateForProject(
    supabase,
    organisationId,
    projectId,
    userId
  );

  if (!estimate) {
    return { error: "Could not load estimate." };
  }

  const { error: selectionsError } = await supabase
    .from("project_constraint_selections")
    .delete()
    .eq("project_id", projectId)
    .eq("organisation_id", organisationId);

  if (selectionsError) {
    logSupabaseError("clearSiteConditions.selections", selectionsError);
    return { error: "Could not clear site conditions." };
  }

  const { error: driversError } = await supabase
    .from("project_estimate_drivers")
    .delete()
    .eq("quick_estimate_id", estimate.id)
    .eq("organisation_id", organisationId);

  if (driversError) {
    logSupabaseError("clearSiteConditions.drivers", driversError);
    return { error: "Could not clear site allowances." };
  }

  const { data: constraintMessages, error: messagesError } = await supabase
    .from("assistant_messages")
    .select("id, metadata")
    .eq("organisation_id", organisationId)
    .eq("project_id", projectId)
    .in("role", ["user", "assistant"]);

  if (messagesError) {
    logSupabaseError("clearSiteConditions.messages", messagesError);
    return { error: "Could not load chat history." };
  }

  const idsToDelete = (constraintMessages ?? [])
    .filter((row) => {
      const meta = row.metadata as Record<string, unknown> | null;
      return (
        meta?.messageType === "constraint_answer" ||
        meta?.messageType === "constraint_declined"
      );
    })
    .map((row) => row.id);

  if (idsToDelete.length > 0) {
    const { error: deleteError } = await supabase
      .from("assistant_messages")
      .delete()
      .in("id", idsToDelete)
      .eq("organisation_id", organisationId);

    if (deleteError) {
      logSupabaseError("clearSiteConditions.deleteMessages", deleteError);
      return { error: "Could not clear constraint messages." };
    }
  }

  await recalculateQuickEstimate(supabase, organisationId, projectId, {
    triggerEvent: "constraint_changed",
    changeReason: "site conditions reset",
  });

  return { error: null };
}
