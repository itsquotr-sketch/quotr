import type { QuickEstimateConfidenceLevel } from "@/lib/constants/quick-estimate";

type CostBand = { low: number; typical: number; high: number };

/** Max total range width by confidence: Low ≤40%, Medium ≤25%, High ≤15%. */
const MAX_RANGE_WIDTH_PERCENT: Record<
  QuickEstimateConfidenceLevel,
  number
> = {
  high: 15,
  medium: 25,
  low: 40,
};

/** Target half-widths from typical (lowPct + highPct ≤ MAX_RANGE_WIDTH). */
const QUALITY_RANGE_WIDTH: Record<
  QuickEstimateConfidenceLevel,
  { lowPct: number; highPct: number }
> = {
  high: { lowPct: 0.075, highPct: 0.075 },
  medium: { lowPct: 0.125, highPct: 0.125 },
  low: { lowPct: 0.2, highPct: 0.2 },
};

export type QualityBandAdjustment = {
  band: CostBand;
  rangeQualityReason: string | null;
  rangeWidthPercent: number;
};

export function applyEstimateQualityToBand(
  band: CostBand,
  qualityLevel: QuickEstimateConfidenceLevel,
  requiredFactsComplete: boolean
): QualityBandAdjustment {
  const { typical } = band;
  if (typical <= 0) {
    return { band, rangeQualityReason: null, rangeWidthPercent: 0 };
  }

  let { lowPct, highPct } = QUALITY_RANGE_WIDTH[qualityLevel];

  if (!requiredFactsComplete && qualityLevel !== "low") {
    lowPct = Math.min(lowPct + 0.05, 0.2);
    highPct = Math.min(highPct + 0.05, 0.2);
  }

  const low = Math.round(typical * (1 - lowPct));
  const high = Math.round(typical * (1 + highPct));
  let rangeWidthPercent = Math.round(((high - low) / typical) * 100);

  const maxWidth = MAX_RANGE_WIDTH_PERCENT[qualityLevel];
  let adjustedLow = Math.max(0, low);
  let adjustedHigh = Math.max(low, high);

  if (rangeWidthPercent > maxWidth) {
    const halfWidth = maxWidth / 200;
    adjustedLow = Math.round(typical * (1 - halfWidth));
    adjustedHigh = Math.round(typical * (1 + halfWidth));
    rangeWidthPercent = maxWidth;
  }

  const reason =
    qualityLevel === "high"
      ? `Tight range (~${rangeWidthPercent}% width) — required facts complete.`
      : qualityLevel === "medium"
        ? `Moderate range (~${rangeWidthPercent}% width) — benchmark rates or optional gaps remain.`
        : `Wide range (~${rangeWidthPercent}% width) — missing measurements or unsupported scope.`;

  return {
    band: { low: adjustedLow, typical, high: adjustedHigh },
    rangeQualityReason: reason,
    rangeWidthPercent,
  };
}
