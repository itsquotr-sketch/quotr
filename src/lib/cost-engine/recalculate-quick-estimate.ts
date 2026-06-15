import { buildQuickEstimateInput } from "@/lib/cost-engine/build-quick-estimate-input";
import { calculateQuickEstimateV1 } from "@/lib/cost-engine/calculate-quick-estimate-v1";
import {
  buildEstimateActionFailure,
  buildEstimateActionSuccess,
  isMissingTraceColumnError,
  mapEstimateFailureUserMessage,
  stripSnapshotTraceFields,
  stripTraceAndStatusFields,
  TRACE_STORAGE_WARNING,
  mentionsTraceColumn,
  type EstimateActionResult,
  type EstimateStatus,
} from "@/lib/cost-engine/estimate-result";
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

export type RecalculateQuickEstimateResult = EstimateActionResult;

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

type QuickEstimateUpdate = Database["public"]["Tables"]["quick_estimates"]["Update"];

async function saveQuickEstimateUpdate(
  supabase: Supabase,
  params: {
    organisationId: string;
    quickEstimateId: string;
    payload: QuickEstimateUpdate;
  }
): Promise<{ ok: true; traceWarning?: string } | { ok: false; error: string }> {
  const { error: updateError } = await supabase
    .from("quick_estimates")
    .update(params.payload)
    .eq("id", params.quickEstimateId)
    .eq("organisation_id", params.organisationId);

  if (!updateError) {
    return { ok: true };
  }

  if (isMissingTraceColumnError(updateError)) {
    console.warn(
      "[recalculateQuickEstimate] Trace/status columns unavailable — saving estimate numbers without trace.",
      updateError.message
    );

    const fallbackPayload = stripTraceAndStatusFields(
      params.payload as Record<string, unknown>
    ) as QuickEstimateUpdate;
    const { error: retryError } = await supabase
      .from("quick_estimates")
      .update(fallbackPayload)
      .eq("id", params.quickEstimateId)
      .eq("organisation_id", params.organisationId);

    if (!retryError) {
      return { ok: true, traceWarning: TRACE_STORAGE_WARNING };
    }

    logSupabaseError("recalculateQuickEstimate.retry", retryError);
    return {
      ok: false,
      error: retryError.message ?? "Could not save quick estimate.",
    };
  }

  logSupabaseError("recalculateQuickEstimate", updateError);
  return {
    ok: false,
    error: updateError.message ?? "Could not save quick estimate.",
  };
}

async function persistFailedEstimateState(
  supabase: Supabase,
  params: {
    organisationId: string;
    quickEstimateId: string;
    failureReason: string;
    notes?: string;
  }
): Promise<void> {
  const payload: QuickEstimateUpdate = {
    status: "in_progress",
    estimate_status: "failed",
    failure_reason: params.failureReason,
    notes: params.notes ?? params.failureReason,
  };

  const saveResult = await saveQuickEstimateUpdate(supabase, {
    organisationId: params.organisationId,
    quickEstimateId: params.quickEstimateId,
    payload,
  });

  if (!saveResult.ok) {
    console.warn(
      "[recalculateQuickEstimate] Could not persist failed estimate state:",
      saveResult.error
    );
  }
}

export async function recalculateQuickEstimate(
  supabase: Supabase,
  organisationId: string,
  projectId: string,
  options?: { triggerEvent?: string; changeReason?: string | null }
): Promise<RecalculateQuickEstimateResult> {
  const { input, error: buildError } = await buildQuickEstimateInput(
    supabase,
    organisationId,
    projectId
  );

  if (buildError || !input) {
    const userMessage = mapEstimateFailureUserMessage(
      buildError ?? "Could not build estimate input."
    );
    const technicalMessage = buildError ?? "Could not build estimate input.";

    const { data: existingEstimate } = await supabase
      .from("quick_estimates")
      .select("id")
      .eq("project_id", projectId)
      .eq("organisation_id", organisationId)
      .maybeSingle();

    if (existingEstimate?.id) {
      await persistFailedEstimateState(supabase, {
        organisationId,
        quickEstimateId: existingEstimate.id,
        failureReason: userMessage,
        notes: technicalMessage,
      });
    }

    return buildEstimateActionFailure(
      "BUILD_INPUT_FAILED",
      userMessage,
      technicalMessage
    );
  }

  const { data: previousEstimate } = await supabase
    .from("quick_estimates")
    .select("estimated_cost_low, estimated_cost_high")
    .eq("id", input.quickEstimate.id)
    .eq("organisation_id", organisationId)
    .maybeSingle();

  const result = calculateQuickEstimateV1(input);
  const now = new Date().toISOString();

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

  const estimateStatus: EstimateStatus = result.canCalculate
    ? (result.estimateStatus ?? "ready")
    : "failed";

  const failureReason = result.canCalculate
    ? null
    : mapEstimateFailureUserMessage(result.reason);

  const summaryNote = JSON.stringify({
    workAreasIncluded: input.workAreas
      .filter((area) =>
        !(result.unpricedWorkAreas ?? []).some(
          (unpriced) => unpriced.name === area.name
        )
      )
      .map((w) => w.name),
    workAreasExcluded: [
      ...(input.excludedWorkAreaNames ?? []),
      ...(result.unpricedWorkAreas ?? []).map(
        (area) => `${area.name} (not priced yet)`
      ),
    ],
    unpricedWorkAreas: result.unpricedWorkAreas ?? [],
    estimateStatus,
    failureReason,
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
    confidenceEvaluation: result.confidenceEvaluation,
    estimateTrace: result.estimateTrace,
    calculationTrace: result.calculationTrace,
    rangeChangedMessage: result.rangeChangedMessage,
    lastEstimateChange: estimateChangeEvent,
    scopeEstimateCache: result.scopeEstimateCache,
  });

  const updatePayload = result.canCalculate
    ? {
        status: "ready" as const,
        estimate_status: estimateStatus,
        failure_reason: null,
        last_calculated_at: now,
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
        estimate_status: "failed" as const,
        failure_reason: failureReason,
        last_calculated_at: null,
        notes: summaryNote,
      };

  const saveResult = await saveQuickEstimateUpdate(supabase, {
    organisationId,
    quickEstimateId: input.quickEstimate.id,
    payload: updatePayload,
  });

  if (!saveResult.ok) {
    const userMessage = mentionsTraceColumn(saveResult.error)
      ? "Database schema missing trace column."
      : "Could not save quick estimate.";

    return buildEstimateActionFailure(
      "SAVE_FAILED",
      userMessage,
      saveResult.error
    );
  }

  let traceWarning = saveResult.traceWarning;

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

      const snapshotPayload = {
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
        trace_version: result.calculationTrace.traceVersion,
      };

      const { error: snapshotError } = await supabase
        .from("quick_estimate_snapshots")
        .insert(snapshotPayload);

      if (snapshotError) {
        if (isMissingTraceColumnError(snapshotError)) {
          console.warn(
            "[recalculateQuickEstimate.snapshot] Trace columns unavailable — saving snapshot without trace.",
            snapshotError.message
          );

          const { error: retrySnapshotError } = await supabase
            .from("quick_estimate_snapshots")
            .insert(
              stripSnapshotTraceFields(snapshotPayload) as Database["public"]["Tables"]["quick_estimate_snapshots"]["Insert"]
            );

          if (retrySnapshotError) {
            logSupabaseError(
              "recalculateQuickEstimate.snapshot.retry",
              retrySnapshotError
            );
          } else if (!traceWarning) {
            traceWarning = TRACE_STORAGE_WARNING;
          }
        } else {
          logSupabaseError("recalculateQuickEstimate.snapshot", snapshotError);
        }
      }
    }
  }

  if (!result.canCalculate) {
    return buildEstimateActionFailure(
      "ESTIMATE_NOT_CALCULABLE",
      failureReason ?? "Could not generate estimate.",
      result.reason ?? "Estimate calculation returned canCalculate=false."
    );
  }

  const messages = [
    estimateStatus === "partial"
      ? "Partial estimate updated."
      : "Draft quick estimate updated.",
  ];
  if (rangeChangedMessage) {
    messages.push(rangeChangedMessage);
  }
  if (traceWarning) {
    messages.push(traceWarning);
  }

  return buildEstimateActionSuccess(messages.join(" "), {
    warning: traceWarning,
    estimateChange: estimateChangeEvent,
  });
}
