import type { QualityLevel } from "@/lib/constants/quality-level";
import type { QuickEstimateConfidenceLevel } from "@/lib/constants/quick-estimate";

export type EstimateQualityTier = "LOW" | "FAIR" | "GOOD" | "READY";

export type EstimateQualityFactor = {
  label: string;
  met: boolean;
};

export type EstimateQualityInput = {
  hasKeyMeasurements: boolean;
  workAreasConfirmed: boolean;
  qualityLevel: QualityLevel;
  siteConstraintsAssessed: boolean;
  materialsKnown?: boolean;
  accessKnown?: boolean;
};

const SITE_QUESTION_KEYS = new Set([
  "access_restrictions",
  "time_constraints",
  "rubbish_removal",
]);

export function isSiteConstraintsAssessed(input: {
  constraintsAssessed?: boolean;
  constraintCount?: number;
  answeredQuestionKeys: Set<string>;
}): boolean {
  if (input.constraintsAssessed) return true;
  if ((input.constraintCount ?? 0) > 0) return true;
  for (const key of SITE_QUESTION_KEYS) {
    if (input.answeredQuestionKeys.has(key)) return true;
  }
  return false;
}

export function buildEstimateQualityFactors(
  input: EstimateQualityInput
): EstimateQualityFactor[] {
  return [
    { label: "Area known", met: input.hasKeyMeasurements },
    { label: "Work area confirmed", met: input.workAreasConfirmed },
    {
      label: "Materials known",
      met: input.materialsKnown ?? false,
    },
    {
      label: "Access known",
      met: input.accessKnown ?? input.siteConstraintsAssessed,
    },
    { label: "Finish level selected", met: input.qualityLevel !== "unknown" },
    { label: "Site constraints assessed", met: input.siteConstraintsAssessed },
  ];
}

/** User-facing estimate quality tier — confidence score stays internal. */
export function resolveEstimateQualityTier(input: {
  confidenceLevel: QuickEstimateConfidenceLevel;
  confidenceScore: number;
  hasKeyMeasurements: boolean;
  workAreasConfirmed: boolean;
  qualityLevel: QualityLevel;
  siteConstraintsAssessed: boolean;
  missingInformationCount: number;
  criticalOrUsefulMissingCount?: number;
  optionalOnlyMissing?: boolean;
}): EstimateQualityTier {
  const {
    confidenceLevel,
    confidenceScore,
    hasKeyMeasurements,
    workAreasConfirmed,
    qualityLevel,
    siteConstraintsAssessed,
    missingInformationCount,
    criticalOrUsefulMissingCount,
    optionalOnlyMissing,
  } = input;

  const blockingMissing =
    criticalOrUsefulMissingCount ?? missingInformationCount;

  if (
    confidenceLevel === "high" &&
    confidenceScore >= 75 &&
    hasKeyMeasurements &&
    workAreasConfirmed &&
    qualityLevel !== "unknown" &&
    siteConstraintsAssessed &&
    (optionalOnlyMissing || blockingMissing <= 1)
  ) {
    return "READY";
  }

  if (
    confidenceScore >= 55 &&
    hasKeyMeasurements &&
    workAreasConfirmed &&
    qualityLevel !== "unknown" &&
    blockingMissing === 0
  ) {
    return "READY";
  }

  if (
    confidenceScore >= 55 &&
    hasKeyMeasurements &&
    workAreasConfirmed &&
    qualityLevel !== "unknown"
  ) {
    return "GOOD";
  }

  if (confidenceScore >= 35 && workAreasConfirmed) {
    return "FAIR";
  }

  return "LOW";
}

export function labelForEstimateQuality(
  level: QuickEstimateConfidenceLevel,
  tier?: EstimateQualityTier
): string {
  if (tier) return tier;
  switch (level) {
    case "high":
      return "GOOD";
    case "medium":
      return "FAIR";
    case "low":
    default:
      return "LOW";
  }
}

export function describeEstimateQualityTier(
  tier: EstimateQualityTier,
  options?: { optionalOnlyMissing?: boolean }
): string {
  switch (tier) {
    case "READY":
      return options?.optionalOnlyMissing
        ? "Quote-ready draft"
        : "Ready to quote against";
    case "GOOD":
      return "Good draft — a few details would sharpen it";
    case "FAIR":
      return "Rough range — answer a few more questions";
    case "LOW":
      return "Early draft — more detail needed";
  }
}
