import {
  mapEstimateFailureUserMessage,
  TRACE_STORAGE_WARNING,
} from "@/lib/cost-engine/estimate-result";
import { TRUST_COPY } from "@/lib/assistant-v2/trust-messages";
import { parseQuickEstimateSummary } from "@/lib/project-assistant-summary";
import type { ExclusionReasonCode } from "@/lib/scopes/pricing-state";
import type { QuickEstimate } from "@/types/database";

export type ExcludedWorkAreaDetail = {
  name: string;
  reason: string;
  reasonCode?: ExclusionReasonCode;
};

export type EstimatePanelState =
  | { kind: "empty"; title: string; detail: string; canRetry: boolean }
  | { kind: "failed"; title: string; reason: string; canRetry: boolean }
  | {
      kind: "partial";
      title: string;
      unpricedAreas: ExcludedWorkAreaDetail[];
      warning?: string;
      canRetry: boolean;
    }
  | { kind: "ready"; warning?: string; canRetry: boolean };

function canRetryEstimate(quickEstimate: QuickEstimate | null): boolean {
  return quickEstimate != null;
}

function normalizeExcludedWorkAreaDetail(
  value: unknown
): ExcludedWorkAreaDetail | null {
  if (typeof value === "string") {
    const name = value.replace(/\s*\(not priced yet\)\s*$/i, "").trim();
    if (!name) return null;
    return {
      name,
      reason: "Pricing source or required details missing.",
      reasonCode: "no_pricing_source",
    };
  }

  if (!value || typeof value !== "object") return null;

  const row = value as {
    name?: unknown;
    reason?: unknown;
    reasonCode?: unknown;
  };

  if (typeof row.name !== "string" || !row.name.trim()) return null;

  return {
    name: row.name.trim(),
    reason:
      typeof row.reason === "string" && row.reason.trim()
        ? row.reason.trim()
        : "Pricing source or required details missing.",
    reasonCode:
      typeof row.reasonCode === "string"
        ? (row.reasonCode as ExclusionReasonCode)
        : undefined,
  };
}

export function buildExcludedWorkAreasFromSummary(
  summary: ReturnType<typeof parseQuickEstimateSummary>
): ExcludedWorkAreaDetail[] {
  const structured = [
    ...(summary?.unpricedWorkAreas ?? []),
    ...(summary?.workAreasExcludedDetails ?? []),
  ]
    .map(normalizeExcludedWorkAreaDetail)
    .filter((area): area is ExcludedWorkAreaDetail => area != null);

  if (structured.length > 0) {
    const seen = new Set<string>();
    return structured.filter((area) => {
      const key = area.name.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  return (summary?.workAreasExcluded ?? [])
    .map(normalizeExcludedWorkAreaDetail)
    .filter((area): area is ExcludedWorkAreaDetail => area != null);
}

export function formatPartialExclusionLine(
  detail: ExcludedWorkAreaDetail
): string {
  return `${detail.name} — not included: ${formatExclusionReasonText(detail)}`;
}

function formatExclusionReasonText(detail: ExcludedWorkAreaDetail): string {
  switch (detail.reasonCode) {
    case "no_pricing_source":
      return "no pricing source configured.";
    case "missing_required_quantity": {
      const lower = detail.reason.toLowerCase();
      if (lower.includes("height") && lower.includes("type")) {
        return "missing height/type.";
      }
      if (lower.includes("height")) {
        return "missing height.";
      }
      if (lower.includes("type")) {
        return "missing type.";
      }
      const simplified = simplifyReasonMessage(detail.reason);
      return simplified ?? "missing required details.";
    }
    case "unsupported_scope":
      return "unsupported scope.";
    case "excluded_by_user":
      return "excluded manually.";
    case "calculation_failed":
      return "calculation failed.";
    default: {
      const simplified = simplifyReasonMessage(detail.reason);
      return simplified ?? "pricing source or required details missing.";
    }
  }
}

function simplifyReasonMessage(reason: string): string | null {
  const trimmed = reason.trim().replace(/\.$/, "");
  if (!trimmed) return null;

  const withoutPrefix = trimmed.replace(/^[^:]+:\s*/, "").trim();
  const message = withoutPrefix || trimmed;
  if (message.length === 0 || message.length > 120) return null;
  return message.endsWith(".") ? message : `${message}.`;
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
    const unpricedAreas = buildExcludedWorkAreasFromSummary(summary);

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
