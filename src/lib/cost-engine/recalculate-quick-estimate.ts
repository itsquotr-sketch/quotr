import { buildQuickEstimateInput } from "@/lib/cost-engine/build-quick-estimate-input";
import { calculateQuickEstimateV1 } from "@/lib/cost-engine/calculate-quick-estimate-v1";
import { formatCurrencyRange } from "@/lib/project-assistant-calculate";
import { logSupabaseError } from "@/lib/supabase/log-error";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/types/database";

type Supabase = SupabaseClient<Database>;

function formatRangeChangedMessage(
  prevLow: number | null,
  prevHigh: number | null,
  newLow: number | null,
  newHigh: number | null
): string | null {
  if (
    prevLow == null ||
    prevHigh == null ||
    newLow == null ||
    newHigh == null
  ) {
    return null;
  }
  if (prevLow === newLow && prevHigh === newHigh) return null;
  return `Your estimate changed from ${formatCurrencyRange(prevLow, prevHigh)} to ${formatCurrencyRange(newLow, newHigh)}.`;
}

export async function recalculateQuickEstimate(
  supabase: Supabase,
  organisationId: string,
  projectId: string,
  options?: { triggerEvent?: string }
): Promise<{ success: boolean; error?: string; message?: string }> {
  const { input, error: buildError } = await buildQuickEstimateInput(
    supabase,
    organisationId,
    projectId
  );

  if (buildError || !input) {
    return { success: false, error: buildError ?? "Could not build estimate input." };
  }

  const { data: previousEstimate } = await supabase
    .from("quick_estimates")
    .select("estimated_cost_low, estimated_cost_high")
    .eq("id", input.quickEstimate.id)
    .eq("organisation_id", organisationId)
    .maybeSingle();

  const result = calculateQuickEstimateV1(input);

  const rangeChangedMessage = result.canCalculate
    ? formatRangeChangedMessage(
        previousEstimate?.estimated_cost_low != null
          ? Number(previousEstimate.estimated_cost_low)
          : null,
        previousEstimate?.estimated_cost_high != null
          ? Number(previousEstimate.estimated_cost_high)
          : null,
        result.estimatedCostLow,
        result.estimatedCostHigh
      )
    : null;

  if (rangeChangedMessage) {
    result.rangeChangedMessage = rangeChangedMessage;
  }

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
    rateSourceDetail: result.rateSourceDetail,
    constraintsApplied: result.constraintsApplied,
    qualityLevel: result.qualityLevel,
    qualityLevelNote: result.qualityLevelNote,
    templatesUsed: result.templatesUsed,
    keyFactsUsed: result.keyFactsUsed,
    confidenceReason: result.confidenceReason,
    confidenceScore: result.confidenceScore,
    confidenceLevelLabel: result.confidenceLevelLabel,
    confidenceReasons: result.confidenceReasons,
    questionsToHigh: result.questionsToHigh,
    centralEstimate: result.centralEstimate,
    contingencyPercent: result.contingencyPercent,
    rangeQuality: result.rangeQuality,
    rangeQualityLabel: result.rangeQualityLabel,
    rangeQualityReason: result.rangeQualityReason,
    rangeWidthPercent: result.rangeWidthPercent,
    rangeFactor: result.rangeFactor,
    tightenSuggestions: result.tightenSuggestions,
    rangeLowDrivers: result.rangeLowDrivers,
    rangeHighDrivers: result.rangeHighDrivers,
    qualityFactors: result.qualityFactors,
    estimateTrace: result.estimateTrace,
    rangeChangedMessage: result.rangeChangedMessage,
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

  if (result.canCalculate) {
    const rateSourceKey =
      typeof result.estimateTrace.rateSource === "string"
        ? result.estimateTrace.rateSource
        : "placeholder";

    const { error: snapshotError } = await supabase
      .from("quick_estimate_snapshots")
      .insert({
        organisation_id: organisationId,
        project_id: projectId,
        quick_estimate_id: input.quickEstimate.id,
        confidence_score: result.confidenceScore,
        confidence_level: result.confidenceLevelLabel,
        estimated_cost_low: result.estimatedCostLow,
        estimated_cost_high: result.estimatedCostHigh,
        sell_low: result.recommendedSellLow,
        sell_high: result.recommendedSellHigh,
        central_estimate: result.centralEstimate,
        target_margin_percent: result.targetMarginPercent,
        contingency_percent: result.contingencyPercent,
        rate_source: rateSourceKey,
        trigger_event: options?.triggerEvent ?? "recalculate",
        calculation_trace: JSON.parse(
          JSON.stringify(result.estimateTrace)
        ) as Json,
      });

    if (snapshotError) {
      logSupabaseError("recalculateQuickEstimate.snapshot", snapshotError);
    }
  }

  const messages = [result.canCalculate ? "Draft quick estimate updated." : (result.reason ?? "Could not generate estimate.")];
  if (rangeChangedMessage) {
    messages.push(rangeChangedMessage);
  }

  return {
    success: true,
    message: messages.join(" "),
  };
}
