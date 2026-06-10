import { buildQuickEstimateInput } from "@/lib/cost-engine/build-quick-estimate-input";
import { calculateQuickEstimateV1 } from "@/lib/cost-engine/calculate-quick-estimate-v1";
import { logSupabaseError } from "@/lib/supabase/log-error";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type Supabase = SupabaseClient<Database>;

export async function recalculateQuickEstimate(
  supabase: Supabase,
  organisationId: string,
  projectId: string
): Promise<{ success: boolean; error?: string; message?: string }> {
  const { input, error: buildError } = await buildQuickEstimateInput(
    supabase,
    organisationId,
    projectId
  );

  if (buildError || !input) {
    return { success: false, error: buildError ?? "Could not build estimate input." };
  }

  const result = calculateQuickEstimateV1(input);

  const summaryNote = JSON.stringify({
    workAreasIncluded: input.workAreas.map((w) => w.name),
    questionsAnswered: input.questionsAnswered,
    questionsTotal: input.questionsTotal,
    constraintsIncluded: result.constraintsApplied,
    includedTrades: result.includedTrades,
    inputsUsed: result.inputsUsed,
    allowances: result.allowances,
    assumptions: result.assumptions,
    risks: result.risks,
    missingInformation: result.missingInformation,
    ratesSource: result.ratesSource,
    constraintsApplied: result.constraintsApplied,
    qualityLevel: result.qualityLevel,
    qualityLevelNote: result.qualityLevelNote,
    templatesUsed: result.templatesUsed,
    keyFactsUsed: result.keyFactsUsed,
    confidenceReason: result.confidenceReason,
    rangeQuality: result.rangeQuality,
    rangeQualityLabel: result.rangeQualityLabel,
    rangeQualityReason: result.rangeQualityReason,
    rangeWidthPercent: result.rangeWidthPercent,
    tightenSuggestions: result.tightenSuggestions,
    rangeLowDrivers: result.rangeLowDrivers,
    rangeHighDrivers: result.rangeHighDrivers,
  });

  const updatePayload = result.canCalculate
    ? {
        status: "ready" as const,
        estimated_cost_low: result.estimatedCostLow,
        estimated_cost_high: result.estimatedCostHigh,
        recommended_sell_low: result.recommendedSellLow,
        recommended_sell_high: result.recommendedSellHigh,
        target_margin_percent: result.targetMarginPercent,
        expected_margin_percent: result.expectedMarginPercent,
        confidence_level: result.confidenceLevel,
        budget_fit: result.budgetFit,
        notes: summaryNote,
      }
    : {
        status: "in_progress" as const,
        notes: result.reason ?? summaryNote,
      };

  const { error: updateError } = await supabase
    .from("quick_estimates")
    .update(updatePayload)
    .eq("id", input.quickEstimate.id)
    .eq("organisation_id", organisationId);

  if (updateError) {
    logSupabaseError("recalculateQuickEstimate", updateError);
    return { success: false, error: "Could not save quick estimate." };
  }

  return {
    success: true,
    message: result.canCalculate
      ? "Draft quick estimate updated."
      : (result.reason ?? "Could not generate estimate."),
  };
}
