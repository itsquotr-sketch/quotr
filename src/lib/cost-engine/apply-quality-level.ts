import type { QualityLevel } from "@/lib/constants/quality-level";

export type QualityLevelAdjustment = {
  centralEstimate: number;
  assumptions: string[];
  missingInformation: string[];
  qualityNote: string | null;
};

/** Adjusts central estimate for finish level — does not widen range. */
export function applyQualityLevelToCentral(
  centralEstimate: number,
  qualityLevel: QualityLevel
): QualityLevelAdjustment {
  const assumptions: string[] = [];
  const missingInformation: string[] = [];
  let qualityNote: string | null = null;
  let central = centralEstimate;

  switch (qualityLevel) {
    case "budget": {
      central = Math.round(central * 0.85);
      assumptions.push(
        "Budget / basic finish — lower specification materials and allowances assumed."
      );
      qualityNote = "Budget / basic finish selected.";
      break;
    }
    case "standard": {
      assumptions.push("Standard / mid-range finish assumed.");
      qualityNote = "Standard / mid-range finish selected.";
      break;
    }
    case "premium": {
      central = Math.round(central * 1.2);
      assumptions.push(
        "Premium / high-end finish — higher specification materials assumed."
      );
      qualityNote = "Premium finish selected.";
      break;
    }
    case "unknown":
    default: {
      qualityNote = "Finish level unknown — answer finish to tighten range.";
      break;
    }
  }

  return {
    centralEstimate: Math.max(0, central),
    assumptions,
    missingInformation,
    qualityNote,
  };
}

/** @deprecated Use applyQualityLevelToCentral */
export function applyQualityLevelToBand(
  band: { low: number; typical: number; high: number },
  qualityLevel: QualityLevel
): QualityLevelAdjustment & {
  band: { low: number; typical: number; high: number };
} {
  const result = applyQualityLevelToCentral(band.typical, qualityLevel);
  return {
    ...result,
    band: {
      low: result.centralEstimate,
      typical: result.centralEstimate,
      high: result.centralEstimate,
    },
  };
}

export function adjustConfidenceForQualityLevel(
  confidence: "low" | "medium" | "high",
  qualityLevel: QualityLevel,
  hasKeyMeasurements: boolean
): "low" | "medium" | "high" {
  if (qualityLevel === "unknown") {
    return "low";
  }

  if (qualityLevel === "budget" && hasKeyMeasurements && confidence === "low") {
    return "medium";
  }

  return confidence;
}
