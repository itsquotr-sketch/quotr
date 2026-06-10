import type { QuickEstimateConfidenceLevel } from "@/lib/constants/quick-estimate";
import type { QualityLevel } from "@/lib/constants/quality-level";

export type ConfidenceInput = {
  hasKeyMeasurements: boolean;
  usedPackageRates: boolean;
  qualityLevel: QualityLevel;
  templatesUsed: string[];
  hasCustomScope: boolean;
  constraintsReviewed: boolean;
};

export function resolveConfidenceLevel(
  input: ConfidenceInput
): QuickEstimateConfidenceLevel {
  const hasTemplate = input.templatesUsed.length > 0 && !input.hasCustomScope;
  const finishKnown = input.qualityLevel !== "unknown";

  if (
    input.hasKeyMeasurements &&
    finishKnown &&
    hasTemplate &&
    input.usedPackageRates &&
    input.constraintsReviewed
  ) {
    return "high";
  }

  if (input.hasKeyMeasurements && hasTemplate && finishKnown) {
    return "medium";
  }

  return "low";
}

export function buildConfidenceReason(
  level: QuickEstimateConfidenceLevel,
  input: ConfidenceInput
): string {
  const hasTemplate = input.templatesUsed.length > 0 && !input.hasCustomScope;
  const templateLabel =
    input.templatesUsed.length > 0
      ? input.templatesUsed.join(", ")
      : "no standard template";

  if (level === "high") {
    return "High confidence — key measurements provided, finish level set, constraints reviewed, and your saved package rates applied.";
  }

  if (level === "medium") {
    const parts: string[] = [];
    if (input.hasKeyMeasurements) {
      parts.push("key measurements provided");
    } else {
      parts.push("partial measurements");
    }
    if (input.usedPackageRates) {
      parts.push("using your saved package rates");
    } else {
      parts.push("using benchmark template rates rather than your saved package rates");
    }
    if (hasTemplate) {
      parts.push(`${templateLabel} template applied`);
    }
    return `Medium confidence — ${parts.join(", ")}.`;
  }

  const gaps: string[] = [];
  if (!input.hasKeyMeasurements) {
    gaps.push("missing required dimensions");
  }
  if (input.qualityLevel === "unknown") {
    gaps.push("finish level unknown");
  }
  if (input.hasCustomScope) {
    gaps.push("custom scope without a standard template");
  }
  if (!input.usedPackageRates) {
    gaps.push("benchmark rates only");
  }

  const gapText =
    gaps.length > 0 ? gaps.join(", ") : "limited information available";
  return `Low confidence — ${gapText} — estimate range kept wider.`;
}
