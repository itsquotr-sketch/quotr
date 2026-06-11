export type ConfidenceLevelLabel = "high" | "medium" | "low" | "very_low";

export function resolveConfidenceLevel(score: number): ConfidenceLevelLabel {
  if (score >= 75) return "high";
  if (score >= 50) return "medium";
  if (score >= 25) return "low";
  return "very_low";
}

export function confidenceLevelLabel(level: ConfidenceLevelLabel): string {
  switch (level) {
    case "high":
      return "High";
    case "medium":
      return "Medium";
    case "low":
      return "Low";
    case "very_low":
      return "Very Low";
  }
}

/** Maps numeric score to legacy quick_estimates.confidence_level column. */
export function toLegacyConfidenceLevel(
  score: number
): "high" | "medium" | "low" {
  if (score >= 75) return "high";
  if (score >= 50) return "medium";
  return "low";
}
