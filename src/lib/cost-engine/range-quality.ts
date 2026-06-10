import type { QuickEstimateConfidenceLevel } from "@/lib/constants/quick-estimate";
import type { QualityLevel } from "@/lib/constants/quality-level";

export type RangeQuality = "rough" | "moderate" | "strong";

export type RangeQualityResult = {
  level: RangeQuality;
  label: string;
  reason: string;
};

export function computeRangeWidthPercent(
  low: number,
  high: number,
  typical: number
): number | null {
  if (typical <= 0 || high < low) return null;
  return Math.round(((high - low) / typical) * 100);
}

export function resolveRangeQuality(input: {
  confidenceLevel: QuickEstimateConfidenceLevel;
  hasKeyMeasurements: boolean;
  qualityLevel: QualityLevel;
  usedPackageRates: boolean;
  constraintsReviewed: boolean;
  rangeWidthPercent: number | null;
}): RangeQualityResult {
  const {
    hasKeyMeasurements,
    qualityLevel,
    usedPackageRates,
    constraintsReviewed,
    rangeWidthPercent,
  } = input;

  const finishKnown = qualityLevel !== "unknown";

  if (
    hasKeyMeasurements &&
    finishKnown &&
    constraintsReviewed &&
    usedPackageRates
  ) {
    return {
      level: "strong",
      label: "Strong",
      reason: "Key measurements answered, finish level set, and your saved package rates applied.",
    };
  }

  if (hasKeyMeasurements && finishKnown) {
    const rateNote = usedPackageRates
      ? "your saved package rates"
      : "benchmark template rates";
    const widthNote =
      rangeWidthPercent != null
        ? ` Range width ~${rangeWidthPercent}%.`
        : "";
    return {
      level: "moderate",
      label: "Moderate",
      reason: `Key measurements provided, using ${rateNote}.${widthNote}`,
    };
  }

  const gaps: string[] = [];
  if (!hasKeyMeasurements) gaps.push("missing key measurements");
  if (!finishKnown) gaps.push("finish level unknown");

  return {
    level: "rough",
    label: "Rough",
    reason: `${gaps.join(" and ") || "Limited information"} — range kept wider${
      rangeWidthPercent != null ? ` (~${rangeWidthPercent}% width)` : ""
    }.`,
  };
}
