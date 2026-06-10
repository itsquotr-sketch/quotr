import type { QualityLevel } from "@/lib/constants/quality-level";
import type { QuickEstimateConfidenceLevel } from "@/lib/constants/quick-estimate";

export type EstimateQualityFactor = {
  label: string;
  met: boolean;
};

export type EstimateQualityInput = {
  hasKeyMeasurements: boolean;
  workAreasConfirmed: boolean;
  qualityLevel: QualityLevel;
  siteConstraintsAssessed: boolean;
};

const SITE_QUESTION_KEYS = new Set([
  "access_restrictions",
  "time_constraints",
  "rubbish_removal",
]);

export function isSiteConstraintsAssessed(input: {
  constraintCount: number;
  answeredQuestionKeys: Set<string>;
}): boolean {
  if (input.constraintCount > 0) return true;
  for (const key of SITE_QUESTION_KEYS) {
    if (input.answeredQuestionKeys.has(key)) return true;
  }
  return false;
}

export function buildEstimateQualityFactors(
  input: EstimateQualityInput
): EstimateQualityFactor[] {
  return [
    { label: "Measurements provided", met: input.hasKeyMeasurements },
    { label: "Work area confirmed", met: input.workAreasConfirmed },
    { label: "Finish level selected", met: input.qualityLevel !== "unknown" },
    { label: "Site constraints assessed", met: input.siteConstraintsAssessed },
  ];
}

export function labelForEstimateQuality(
  level: QuickEstimateConfidenceLevel
): string {
  return level.toUpperCase();
}
