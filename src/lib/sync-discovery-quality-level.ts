import type { DiscoveryQualityLevel } from "@/lib/ai/discovery/types";
import { normaliseQualityLevel } from "@/lib/constants/quality-level";
import { logSupabaseError } from "@/lib/supabase/log-error";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type Supabase = SupabaseClient<Database>;

/**
 * Seeds quality_level from discovery when the builder has not set it yet.
 * Builder overrides in Step 4 always take priority.
 */
export async function syncQualityLevelFromDiscovery(
  supabase: Supabase,
  organisationId: string,
  quickEstimateId: string,
  qualityLevel: DiscoveryQualityLevel | undefined
): Promise<void> {
  if (!qualityLevel || qualityLevel.confidence < 0.6) {
    return;
  }

  const { data: estimate, error: loadError } = await supabase
    .from("quick_estimates")
    .select("quality_level")
    .eq("id", quickEstimateId)
    .eq("organisation_id", organisationId)
    .maybeSingle();

  if (loadError) {
    logSupabaseError("syncQualityLevelFromDiscovery.load", loadError);
    return;
  }

  const current = normaliseQualityLevel(estimate?.quality_level);
  if (current !== "unknown") {
    return;
  }

  const { error: updateError } = await supabase
    .from("quick_estimates")
    .update({ quality_level: qualityLevel.value })
    .eq("id", quickEstimateId)
    .eq("organisation_id", organisationId)
    .eq("quality_level", "unknown");

  if (updateError) {
    logSupabaseError("syncQualityLevelFromDiscovery.update", updateError);
  }
}
