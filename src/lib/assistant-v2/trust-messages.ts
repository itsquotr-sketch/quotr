/** Unified contractor-facing trust copy (Sprint 13D.2). */

export const TRUST_COPY = {
  ratesSaved: "Using your saved rates",
  ratesBenchmark: "Using Quotr benchmark rates",
  ratesPlaceholder: "Using rough placeholder pricing",
  readyForDraft: "Ready for a draft estimate",
  solidDraft: "Solid draft — a few details would sharpen it",
  roughRange: "Rough range — answer a few more questions",
  notIncludedYet: "Not included in estimate yet",
  emptyNoScopes:
    "Tell Quotr what you're building to start your estimate.",
  emptyNoPricing: "Scope captured, but pricing is not available yet.",
  partialEstimate:
    "Partial estimate — some work areas are not included yet.",
  failedEstimate: "Could not calculate estimate.",
  tracePending:
    "Estimate generated. Breakdown is still being prepared.",
  savingAnswer: "Saving…",
  updatingEstimate: "Updating estimate…",
  savingConstraints: "Saving site conditions…",
  removingWorkArea: "Removing…",
  addingWorkArea: "Including…",
  retryingEstimate: "Retrying estimate…",
  openingInsight: "Opening…",
  applyingMargin: "Applying…",
} as const;

export function formatRateSourceTrustMessage(
  rateSourceLines: { rateSource: string }[]
): string | null {
  if (rateSourceLines.length === 0) return null;

  const hasPlaceholder = rateSourceLines.some(
    (line) => line.rateSource === "placeholder"
  );
  const hasBenchmark = rateSourceLines.some(
    (line) =>
      line.rateSource === "benchmark" ||
      line.rateSource === "template_benchmark"
  );
  const allSaved = rateSourceLines.every(
    (line) =>
      line.rateSource !== "placeholder" &&
      line.rateSource !== "benchmark" &&
      line.rateSource !== "template_benchmark"
  );

  if (hasPlaceholder) return TRUST_COPY.ratesPlaceholder;
  if (allSaved) return TRUST_COPY.ratesSaved;
  if (hasBenchmark) return TRUST_COPY.ratesBenchmark;
  return null;
}
