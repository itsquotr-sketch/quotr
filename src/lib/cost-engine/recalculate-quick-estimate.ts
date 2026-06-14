import { buildQuickEstimateInput } from "@/lib/cost-engine/build-quick-estimate-input";
import { calculateQuickEstimateV1 } from "@/lib/cost-engine/calculate-quick-estimate-v1";
import { formatCurrencyRange } from "@/lib/format-currency";
import { logSupabaseError } from "@/lib/supabase/log-error";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/types/database";

type Supabase = SupabaseClient<Database>;

export type EstimateChangeEvent = {
  kind: "increased" | "decreased" | "narrowed" | "widened" | "unchanged";
  previousLow: number;
  previousHigh: number;
  newLow: number;
  newHigh: number;
  reason: string | null;
  at: string;
};

function buildEstimateChangeEvent(
  prevLow: number | null,
  prevHigh: number | null,
  newLow: number | null,
  newHigh: number | null,
  reason?: string | null
): EstimateChangeEvent | null {
  if (
    prevLow == null ||
    prevHigh == null ||
    newLow == null ||
    newHigh == null
  ) {
    return null;
  }
  if (prevLow === newLow && prevHigh === newHigh) return null;

  const prevMid = (prevLow + prevHigh) / 2;
  const newMid = (newLow + newHigh) / 2;
  const prevWidth = prevHigh - prevLow;
  const newWidth = newHigh - newLow;

  let kind: EstimateChangeEvent["kind"] = "unchanged";
  if (newWidth < prevWidth * 0.85) {
    kind = "narrowed";
  } else if (newWidth > prevWidth * 1.15) {
    kind = "widened";
  } else if (newMid > prevMid * 1.03) {
    kind = "increased";
  } else if (newMid < prevMid * 0.97) {
    kind = "decreased";
  }

  return {
    kind,
    previousLow: prevLow,
    previousHigh: prevHigh,
    newLow,
    newHigh,
    reason: reason ?? null,
    at: new Date().toISOString(),
  };
}

const SNAPSHOT_ALWAYS_TRIGGERS = new Set([
  "manual_recalculate",
  "lock",
  "generate",
  "margin_changed",
  "quality_changed",
  "constraint_changed",
  "allowance_changed",
]);

const SNAPSHOT_STALE_MS = 24 * 60 * 60 * 1000;

async function getPreviousConfidenceLabel(
  supabase: Supabase,
  organisationId: string,
  quickEstimateId: string
): Promise<string | null> {
  const { data } = await supabase
    .from("quick_estimates")
    .select("notes")
    .eq("id", quickEstimateId)
    .eq("organisation_id", organisationId)
    .maybeSingle();

  if (!data?.notes) return null;
  try {
    const parsed = JSON.parse(data.notes) as { confidenceLevelLabel?: string };
    return parsed.confidenceLevelLabel ?? null;
  } catch {
    return null;
  }
}

async function shouldInsertEstimateSnapshot(
  supabase: Supabase,
  params: {
    organisationId: string;
    quickEstimateId: string;
    triggerEvent?: string;
    previousConfidenceLevel: string | null;
    newConfidenceLevel: string;
    newMarginPercent: number;
    previousMarginPercent: number | null;
  }
): Promise<boolean> {
  const trigger = params.triggerEvent ?? "recalculate";
  if (SNAPSHOT_ALWAYS_TRIGGERS.has(trigger)) {
    return true;
  }

  if (
    params.previousConfidenceLevel != null &&
    params.previousConfidenceLevel !== params.newConfidenceLevel
  ) {
    return true;
  }

  if (
    params.previousMarginPercent != null &&
    params.previousMarginPercent !== params.newMarginPercent
  ) {
    return true;
  }

  const { data: lastSnapshot } = await supabase
    .from("quick_estimate_snapshots")
    .select("created_at")
    .eq("quick_estimate_id", params.quickEstimateId)
    .eq("organisation_id", params.organisationId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!lastSnapshot?.created_at) {
    return true;
  }

  const ageMs = Date.now() - new Date(lastSnapshot.created_at).getTime();
  return ageMs >= SNAPSHOT_STALE_MS;
}

function formatRangeChangedMessage(event: EstimateChangeEvent): string {
  const from = formatCurrencyRange(event.previousLow, event.previousHigh);
  const to = formatCurrencyRange(event.newLow, event.newHigh);
  const verb =
    event.kind === "narrowed"
      ? "Estimate narrowed"
      : event.kind === "widened"
        ? "Estimate widened"
        : event.kind === "increased"
          ? "Estimate increased"
          : event.kind === "decreased"
            ? "Estimate decreased"
            : "Estimate updated";
  const reason = event.reason ? ` — ${event.reason}` : "";
  return `${verb}: ${from} → ${to}${reason}`;
}

export async function recalculateQuickEstimate(
  supabase: Supabase,
  organisationId: string,
  projectId: string,
  options?: { triggerEvent?: string; changeReason?: string | null }
): Promise<{
  success: boolean;
  error?: string;
  message?: string;
  estimateChange?: EstimateChangeEvent | null;
}> {
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

  const estimateChangeEvent = result.canCalculate
    ? buildEstimateChangeEvent(
        previousEstimate?.estimated_cost_low != null
          ? Number(previousEstimate.estimated_cost_low)
          : null,
        previousEstimate?.estimated_cost_high != null
          ? Number(previousEstimate.estimated_cost_high)
          : null,
        result.estimatedCostLow,
        result.estimatedCostHigh,
        options?.changeReason ?? null
      )
    : null;

  const rangeChangedMessage = estimateChangeEvent
    ? formatRangeChangedMessage(estimateChangeEvent)
    : null;

  if (rangeChangedMessage) {
    result.rangeChangedMessage = rangeChangedMessage;
  }

  const summaryNote = JSON.stringify({
    workAreasIncluded: input.workAreas.map((w) => w.name),
    workAreasExcluded: input.excludedWorkAreaNames ?? [],
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
    stagedRateLevel: result.stagedRateLevel,
    stagedRatePrompt: result.stagedRatePrompt,
    rateSourceLines: result.rateSourceLines,
    benchmarkScopesForOnboarding: result.benchmarkScopesForOnboarding,
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
    calculationTrace: result.calculationTrace,
    rangeChangedMessage: result.rangeChangedMessage,
    lastEstimateChange: estimateChangeEvent,
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
        trace: JSON.parse(
          JSON.stringify(result.calculationTrace)
        ) as Json,
        trace_version: result.calculationTrace.traceVersion,
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
    const shouldSnapshot = await shouldInsertEstimateSnapshot(supabase, {
      organisationId,
      quickEstimateId: input.quickEstimate.id,
      triggerEvent: options?.triggerEvent,
      previousConfidenceLevel: previousEstimate
        ? await getPreviousConfidenceLabel(
            supabase,
            organisationId,
            input.quickEstimate.id
          )
        : null,
      newConfidenceLevel: result.confidenceLevelLabel,
      newMarginPercent: result.targetMarginPercent,
      previousMarginPercent:
        input.targetMarginPercent != null
          ? Number(input.targetMarginPercent)
          : null,
    });

    if (shouldSnapshot) {
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
            JSON.stringify(result.calculationTrace)
          ) as Json,
        });

      if (snapshotError) {
        logSupabaseError("recalculateQuickEstimate.snapshot", snapshotError);
      }
    }
  }

  const messages = [result.canCalculate ? "Draft quick estimate updated." : (result.reason ?? "Could not generate estimate.")];
  if (rangeChangedMessage) {
    messages.push(rangeChangedMessage);
  }

  return {
    success: true,
    message: messages.join(" "),
    estimateChange: estimateChangeEvent,
  };
}
