import {
  mapEstimateFailureUserMessage,
  TRACE_STORAGE_WARNING,
} from "@/lib/cost-engine/estimate-result";
import { TRUST_COPY } from "@/lib/assistant-v2/trust-messages";
import { parseQuickEstimateSummary } from "@/lib/project-assistant-summary";
import type { QuickEstimate } from "@/types/database";

export type EstimatePanelState =
  | { kind: "empty"; title: string; detail: string; canRetry: boolean }
  | { kind: "failed"; title: string; reason: string; canRetry: boolean }
  | {
      kind: "partial";
      title: string;
      unpricedAreas: string[];
      warning?: string;
      canRetry: boolean;
    }
  | { kind: "ready"; warning?: string; canRetry: boolean };

function canRetryEstimate(quickEstimate: QuickEstimate | null): boolean {
  return quickEstimate != null;
}

export function resolveEstimatePanelState(
  quickEstimate: QuickEstimate | null,
  summary = parseQuickEstimateSummary(quickEstimate?.notes ?? null)
): EstimatePanelState | null {
  if (!quickEstimate) {
    return {
      kind: "empty",
      title: TRUST_COPY.emptyNoScopes,
      detail: "Describe the job in the chat or confirm detected work areas.",
      canRetry: false,
    };
  }

  const hasResults =
    quickEstimate.estimated_cost_low != null &&
    quickEstimate.estimated_cost_high != null;

  const estimateStatus =
    quickEstimate.estimate_status ??
    summary?.estimateStatus ??
    (hasResults ? "ready" : "draft");

  const failureReason = mapEstimateFailureUserMessage(
    quickEstimate.failure_reason ??
      summary?.failureReason ??
      (typeof quickEstimate.notes === "string" &&
      !quickEstimate.notes.trim().startsWith("{")
        ? quickEstimate.notes
        : null)
  );

  const retryAllowed = canRetryEstimate(quickEstimate);

  if (estimateStatus === "failed" || (!hasResults && failureReason)) {
    return {
      kind: "failed",
      title: TRUST_COPY.failedEstimate,
      reason:
        failureReason ??
        "Something went wrong while calculating. Retry using the latest project details.",
      canRetry: retryAllowed,
    };
  }

  if (hasResults && estimateStatus === "partial") {
    const unpricedAreas =
      summary?.unpricedWorkAreas?.map((area) => area.name) ??
      summary?.workAreasExcluded?.filter((name) =>
        /not priced/i.test(name)
      ) ??
      [];

    return {
      kind: "partial",
      title: TRUST_COPY.partialEstimate,
      unpricedAreas,
      warning: summary?.traceWarning ?? undefined,
      canRetry: retryAllowed,
    };
  }

  if (hasResults) {
    const traceWarning = summary?.traceWarning;
    if (traceWarning) {
      const userWarning =
        traceWarning === TRACE_STORAGE_WARNING
          ? TRUST_COPY.tracePending
          : traceWarning;
      return { kind: "ready", warning: userWarning, canRetry: retryAllowed };
    }
    return null;
  }

  if (estimateStatus === "draft") {
    return {
      kind: "empty",
      title: TRUST_COPY.emptyNoPricing,
      detail: "Add a rate or use a supported scope to generate an estimate.",
      canRetry: retryAllowed,
    };
  }

  return {
    kind: "empty",
    title: TRUST_COPY.emptyNoScopes,
    detail: "Describe the job in the chat or confirm detected work areas.",
    canRetry: retryAllowed,
  };
}
