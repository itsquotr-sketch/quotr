import type { PostgrestError } from "@supabase/supabase-js";

export type EstimateChangeEvent = {
  kind: "increased" | "decreased" | "narrowed" | "widened" | "unchanged";
  previousLow: number;
  previousHigh: number;
  newLow: number;
  newHigh: number;
  reason: string | null;
  at: string;
};

export type EstimateStatus = "draft" | "ready" | "failed" | "partial";

export type EstimateActionResult = {
  success: boolean;
  error?: string;
  errorCode?: string;
  userMessage?: string;
  technicalMessage?: string;
  warning?: string;
  message?: string;
  estimateChange?: EstimateChangeEvent | null;
};

const TRACE_COLUMN_PATTERN =
  /trace|trace_version|estimate_status|failure_reason|last_calculated_at|calculation_trace/i;

export function isMissingTraceColumnError(
  error: PostgrestError | null | undefined
): boolean {
  if (!error) return false;
  const message = error.message.toLowerCase();
  return (
    error.code === "PGRST204" &&
    (message.includes("trace") ||
      message.includes("estimate_status") ||
      message.includes("failure_reason") ||
      message.includes("last_calculated_at"))
  );
}

export function stripTraceAndStatusFields<T extends Record<string, unknown>>(
  payload: T
): Record<string, unknown> {
  const rest = { ...payload };
  delete rest.trace;
  delete rest.trace_version;
  delete rest.estimate_status;
  delete rest.failure_reason;
  delete rest.last_calculated_at;
  return rest;
}

export function stripSnapshotTraceFields<T extends Record<string, unknown>>(
  payload: T
): Record<string, unknown> {
  const rest = { ...payload };
  delete rest.calculation_trace;
  delete rest.trace_version;
  return rest;
}

export function mentionsTraceColumn(message: string): boolean {
  return TRACE_COLUMN_PATTERN.test(message);
}

export function mapEstimateFailureUserMessage(reason?: string | null): string {
  if (!reason) {
    return "Something went wrong while calculating. Retry using the latest project details.";
  }

  const lower = reason.toLowerCase();

  if (
    lower.includes("trace") &&
    (lower.includes("schema") ||
      lower.includes("column") ||
      lower.includes("pgrst204") ||
      lower.includes("missing a required field"))
  ) {
    return "Estimate could not be saved because the database is missing a required field. Retry after the update has been applied.";
  }

  if (
    lower.includes("database schema missing") ||
    lower.includes("could not save quick estimate")
  ) {
    return "Estimate could not be saved because the database is missing a required field. Retry after the update has been applied.";
  }

  if (
    lower.includes("no priced work") ||
    lower.includes("no confirmed work areas") ||
    lower.includes("no work areas are currently included") ||
    lower.includes("confirm at least one work area")
  ) {
    return "I need at least one priced work area with enough quantity to calculate an estimate.";
  }

  if (
    lower.includes("not supported") ||
    lower.includes("not included") ||
    lower.includes("needs pricing") ||
    lower.includes("custom scope") ||
    lower.includes("not priced yet")
  ) {
    return "This work area is not priced yet. Add a rate or include a supported work area.";
  }

  if (
    lower.includes("missing") &&
    (lower.includes("quantity") ||
      lower.includes("measurement") ||
      lower.includes("dimension") ||
      lower.includes("floor area"))
  ) {
    return "I need at least one priced work area with enough quantity to calculate an estimate.";
  }

  if (
    lower.includes("could not build estimate") ||
    lower.includes("could not generate") ||
    lower.includes("could not update estimate") ||
    lower.includes("unable to calculate")
  ) {
    return "Something went wrong while calculating. Retry using the latest project details.";
  }

  return reason;
}

export function isEstimateFailureMessage(
  content: string,
  error?: string | null
): boolean {
  const text = `${content} ${error ?? ""}`.toLowerCase();
  return (
    text.includes("could not update estimate") ||
    text.includes("could not generate estimate") ||
    text.includes("could not recalculate") ||
    text.includes("could not save quick estimate") ||
    text.includes("unable to calculate") ||
    text.includes("something went wrong while calculating")
  );
}

export function buildEstimateActionFailure(
  errorCode: string,
  userMessage: string,
  technicalMessage: string
): EstimateActionResult {
  return {
    success: false,
    error: userMessage,
    errorCode,
    userMessage,
    technicalMessage,
  };
}

export function buildEstimateActionSuccess(
  message: string,
  options?: {
    warning?: string;
    estimateChange?: EstimateChangeEvent | null;
  }
): EstimateActionResult {
  return {
    success: true,
    message,
    warning: options?.warning,
    estimateChange: options?.estimateChange ?? null,
  };
}

export const TRACE_STORAGE_WARNING =
  "Estimate generated. Breakdown is still being prepared.";
