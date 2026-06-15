import type { PostgrestError } from "@supabase/supabase-js";

export function logSupabaseError(
  context: string,
  error: PostgrestError | null | undefined
) {
  if (!error) {
    return;
  }

  console.error(`[${context}] Supabase error:`, {
    code: error.code,
    message: error.message,
    details: error.details,
    hint: error.hint,
  });
}

function isMissingTableError(
  error: PostgrestError,
  tableName: string
): boolean {
  const message = error.message.toLowerCase();
  const table = tableName.toLowerCase();
  return (
    message.includes(table) &&
    (error.code === "42P01" ||
      error.code === "PGRST205" ||
      error.code === "PGRST204" ||
      message.includes("does not exist") ||
      message.includes("could not find") ||
      message.includes("schema cache"))
  );
}

export function isMissingSuggestionsTableError(error: PostgrestError): boolean {
  return isMissingTableError(error, "project_scope_suggestions");
}

export function isMissingDriverValuesTableError(error: PostgrestError): boolean {
  return (
    isMissingTableError(error, "project_estimate_driver_values") ||
    isMissingTableError(error, "project_constraint_selections")
  );
}

export function isMissingProjectEstimateDriversTableError(
  error: PostgrestError
): boolean {
  return isMissingTableError(error, "project_estimate_drivers");
}

export function isMissingQuickEstimateTraceColumnError(
  error: PostgrestError
): boolean {
  const message = error.message.toLowerCase();
  return (
    error.code === "PGRST204" &&
    (message.includes("trace") ||
      message.includes("estimate_status") ||
      message.includes("failure_reason") ||
      message.includes("last_calculated_at"))
  );
}

export function userFacingSupabaseError(
  error: PostgrestError,
  fallback: string
): string {
  if (isMissingSuggestionsTableError(error)) {
    return "Scope suggestions are not set up yet. Apply migration 007 (or 008) in Supabase, then try again.";
  }

  if (
    isMissingDriverValuesTableError(error) ||
    isMissingProjectEstimateDriversTableError(error)
  ) {
    return "Constraint storage is not set up yet. Apply migration 014 or 024_ensure_project_estimate_driver_values.sql in Supabase SQL Editor, then try again.";
  }

  if (process.env.NODE_ENV === "development" && error.message) {
    const detail = [error.code, error.message].filter(Boolean).join(": ");
    return detail ? `${fallback} (${detail})` : fallback;
  }

  return fallback;
}

/** Map a plain error message from constraint persistence to a user-facing string. */
export function userFacingConstraintPersistError(message: string): string {
  const lower = message.toLowerCase();
  if (
    (lower.includes("project_estimate_driver_values") ||
      lower.includes("project_constraint_selections")) &&
    (lower.includes("could not find") ||
      lower.includes("does not exist") ||
      lower.includes("schema cache"))
  ) {
    return "Constraint storage is not set up yet. Apply migration 030_project_constraint_selections.sql in Supabase SQL Editor, then try again.";
  }

  if (
    lower.includes("project_estimate_drivers") &&
    (lower.includes("could not find") ||
      lower.includes("does not exist") ||
      lower.includes("schema cache"))
  ) {
    return "Constraint storage is not set up yet. Apply migration 013 or 024_ensure_project_estimate_driver_values.sql in Supabase SQL Editor, then try again.";
  }

  if (process.env.NODE_ENV === "development") {
    return `Could not save constraints. (${message})`;
  }

  return "Could not save constraints. Please try again.";
}
