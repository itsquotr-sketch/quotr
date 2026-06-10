import type { QualityLevel } from "@/lib/constants/quality-level";

type CostBand = { low: number; typical: number; high: number };

export type QualityLevelAdjustment = {
  band: CostBand;
  assumptions: string[];
  missingInformation: string[];
  qualityNote: string | null;
};

export function applyQualityLevelToBand(
  band: CostBand,
  qualityLevel: QualityLevel
): QualityLevelAdjustment {
  const assumptions: string[] = [];
  const missingInformation: string[] = [];
  let qualityNote: string | null = null;

  let { low, typical, high } = band;

  switch (qualityLevel) {
    case "budget": {
      typical = Math.round(low + (typical - low) * 0.55);
      high = Math.round(typical * 1.15);
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
      typical = Math.round(typical * 1.2);
      high = Math.round(high * 1.3);
      assumptions.push(
        "Premium / high-end finish — higher specification materials and subcontractor allowances assumed."
      );
      qualityNote =
        "Premium finish selected — range increased for higher specification materials/subcontractor allowances.";
      break;
    }
    case "unknown":
    default: {
      low = Math.round(low * 0.9);
      high = Math.round(high * 1.25);
      missingInformation.push("Finish level unknown.");
      qualityNote = "Finish level unknown — estimate range kept wider.";
      break;
    }
  }

  return {
    band: {
      low: Math.max(0, low),
      typical: Math.max(0, typical),
      high: Math.max(typical, high),
    },
    assumptions,
    missingInformation,
    qualityNote,
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
