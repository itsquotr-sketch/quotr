/**
 * Builds a cost range from a central estimate and confidence score.
 * High confidence → ~15% total width; very low → up to 60%.
 */
export function getRangeFactor(confidenceScore: number, isAdvisoryOnly = false): number {
  if (isAdvisoryOnly && confidenceScore < 25) return 0.3;
  if (confidenceScore >= 75) return 0.075;
  if (confidenceScore >= 50) return 0.125;
  if (confidenceScore >= 25) return 0.2;
  return 0.3;
}

export function buildRange(
  centralEstimate: number,
  confidenceScore: number,
  options?: { isAdvisoryOnly?: boolean }
): [number, number] {
  if (centralEstimate <= 0) return [0, 0];

  const factor = getRangeFactor(confidenceScore, options?.isAdvisoryOnly);

  return [
    Math.round((centralEstimate * (1 - factor)) / 500) * 500,
    Math.round((centralEstimate * (1 + factor)) / 500) * 500,
  ];
}
