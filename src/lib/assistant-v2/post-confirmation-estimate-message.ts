/**
 * User-facing copy when work areas saved successfully but estimate recalc failed or
 * cannot run yet. Must not imply scope confirmation failed.
 */
export function mapPostConfirmationEstimateMessage(params: {
  userMessage?: string | null;
  technicalMessage?: string | null;
  unpricedScopeNames?: string[];
}): string {
  const reason = `${params.userMessage ?? ""} ${params.technicalMessage ?? ""}`.toLowerCase();

  if (
    reason.includes("could not save") ||
    reason.includes("database schema") ||
    reason.includes("pgrst204") ||
    reason.includes("something went wrong while calculating") ||
    reason.includes("could not build estimate") ||
    reason.includes("unable to calculate")
  ) {
    return "I've saved the work areas, but estimate refresh failed. You can retry once the details are complete.";
  }

  if (
    reason.includes("not priced") ||
    reason.includes("not supported") ||
    reason.includes("needs pricing") ||
    reason.includes("custom scope") ||
    reason.includes("add a rate") ||
    (params.unpricedScopeNames?.length ?? 0) > 0
  ) {
    const names = params.unpricedScopeNames ?? [];
    if (names.length === 1) {
      return `I've saved those work areas. ${names[0]} needs pricing support or a rough allowance before it can be included.`;
    }
    if (names.length > 1) {
      return `I've saved those work areas. ${names.join(", ")} need pricing support or allowances before they can be included.`;
    }
    return "I've saved those work areas. Some scopes need pricing support or a rough allowance before they can be included.";
  }

  return "I've saved those work areas. I need a few details before I can price them properly.";
}
