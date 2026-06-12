import { resolveConfidenceLevel, type ConfidenceLevelLabel } from "@/lib/cost-engine/confidence/level";
import type { RateSource } from "@/lib/cost-engine/rates/get-base-rate-for-scope";
import type { QualityLevel } from "@/lib/constants/quality-level";
import { getScopeByWorkAreaType } from "@/lib/scopes";
import { getMissingRequiredFacts } from "@/lib/scopes/missing-facts";
import type { QuickEstimateWorkAreaInput } from "@/lib/cost-engine/quick-estimate-input";
import { isSiteConstraintsAssessed } from "@/lib/cost-engine/estimate-quality";

export type ConfidenceSignal =
  | "SCOPE_IDENTIFIED"
  | "AREA_OR_QUANTITY_MEASURED"
  | "MATERIAL_SPECIFIED"
  | "FINISH_LEVEL_KNOWN"
  | "ACCESS_KNOWN"
  | "CLIENT_BUDGET_KNOWN"
  | "SITE_CONDITIONS_KNOWN"
  | "COMPLEXITY_ASSESSED"
  | "PROGRAMME_KNOWN"
  | "EXISTING_STRUCTURE_KNOWN"
  | "SCOPE_RATE_AVAILABLE"
  | "ORG_RATE_AVAILABLE"
  | "PACKAGE_RATE_AVAILABLE"
  | "MISSING_CRITICAL_FACT"
  | "MULTIPLE_UNKNOWN_TRADES"
  | "CONTRADICTORY_SIGNALS"
  | "NOTES_TOO_VAGUE"
  | "PLACEHOLDER_RATE_USED";

const SIGNAL_WEIGHTS: Record<ConfidenceSignal, number> = {
  SCOPE_IDENTIFIED: 15,
  AREA_OR_QUANTITY_MEASURED: 15,
  MATERIAL_SPECIFIED: 10,
  FINISH_LEVEL_KNOWN: 10,
  ACCESS_KNOWN: 10,
  CLIENT_BUDGET_KNOWN: 5,
  SITE_CONDITIONS_KNOWN: 5,
  COMPLEXITY_ASSESSED: 5,
  PROGRAMME_KNOWN: 5,
  EXISTING_STRUCTURE_KNOWN: 5,
  SCOPE_RATE_AVAILABLE: 12,
  ORG_RATE_AVAILABLE: 10,
  PACKAGE_RATE_AVAILABLE: 5,
  MISSING_CRITICAL_FACT: -20,
  MULTIPLE_UNKNOWN_TRADES: -10,
  CONTRADICTORY_SIGNALS: -15,
  NOTES_TOO_VAGUE: -10,
  PLACEHOLDER_RATE_USED: -10,
};

export type ConfidenceScoreResult = {
  score: number;
  level: ConfidenceLevelLabel;
  positiveSignals: ConfidenceSignal[];
  negativeSignals: ConfidenceSignal[];
  reasons: string[];
  questionsToHigh: number;
};

const SIGNAL_LABELS: Partial<Record<ConfidenceSignal, string>> = {
  SCOPE_IDENTIFIED: "Work area identified",
  AREA_OR_QUANTITY_MEASURED: "Key measurements provided",
  MATERIAL_SPECIFIED: "Material specified",
  FINISH_LEVEL_KNOWN: "Finish level known",
  ACCESS_KNOWN: "Access conditions known",
  CLIENT_BUDGET_KNOWN: "Client budget known",
  SITE_CONDITIONS_KNOWN: "Site conditions assessed",
  SCOPE_RATE_AVAILABLE: "Your saved scope rate used",
  ORG_RATE_AVAILABLE: "Your trade/material rates used",
  PACKAGE_RATE_AVAILABLE: "Your package rate used",
  MISSING_CRITICAL_FACT: "Missing critical facts",
  PLACEHOLDER_RATE_USED: "No rate match — placeholder pricing",
  NOTES_TOO_VAGUE: "Notes too vague for precise pricing",
};

function clampScore(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function computeConfidenceScore(input: {
  workAreas: QuickEstimateWorkAreaInput[];
  qualityLevel: QualityLevel;
  rateSources: RateSource[];
  clientBudget: number | null;
  constraintsAssessed: boolean;
  discoveryNotesLength?: number;
  hasCustomScope: boolean;
}): ConfidenceScoreResult {
  const positive: ConfidenceSignal[] = [];
  const negative: ConfidenceSignal[] = [];
  let score = 35;

  if (input.workAreas.length > 0) {
    score += SIGNAL_WEIGHTS.SCOPE_IDENTIFIED;
    positive.push("SCOPE_IDENTIFIED");
  }

  const measuredAreas = input.workAreas.filter((area) => {
    const scope = getScopeByWorkAreaType(area.workAreaTypeKey);
    if (!scope) return false;
    return (
      getMissingRequiredFacts(area.workAreaTypeKey, area.answers).length === 0
    );
  });

  if (input.workAreas.length > 0) {
    const measuredFraction = measuredAreas.length / input.workAreas.length;

    if (measuredFraction >= 1) {
      score += SIGNAL_WEIGHTS.AREA_OR_QUANTITY_MEASURED;
      positive.push("AREA_OR_QUANTITY_MEASURED");
    } else if (measuredFraction > 0) {
      score += Math.round(
        SIGNAL_WEIGHTS.AREA_OR_QUANTITY_MEASURED * measuredFraction
      );
      positive.push("AREA_OR_QUANTITY_MEASURED");
    }

    const missingFraction = 1 - measuredFraction;
    if (missingFraction > 0) {
      score += Math.round(
        SIGNAL_WEIGHTS.MISSING_CRITICAL_FACT * missingFraction
      );
      negative.push("MISSING_CRITICAL_FACT");
    }
  }

  const materialKnown = input.workAreas.some((area) =>
    Object.entries(area.answers).some(
      ([key, val]) => key.includes("material") && val && val !== "unknown"
    )
  );
  if (materialKnown) {
    score += SIGNAL_WEIGHTS.MATERIAL_SPECIFIED;
    positive.push("MATERIAL_SPECIFIED");
  }

  if (input.qualityLevel !== "unknown") {
    score += SIGNAL_WEIGHTS.FINISH_LEVEL_KNOWN;
    positive.push("FINISH_LEVEL_KNOWN");
  }

  const accessKnown = input.workAreas.some((area) =>
    Object.entries(area.answers).some(
      ([key, val]) =>
        (key.includes("access") || key.includes("level_type")) &&
        val &&
        val !== "unknown"
    )
  );
  if (accessKnown || input.constraintsAssessed) {
    score += SIGNAL_WEIGHTS.ACCESS_KNOWN;
    positive.push("ACCESS_KNOWN");
  }

  if (input.clientBudget != null && input.clientBudget > 0) {
    score += SIGNAL_WEIGHTS.CLIENT_BUDGET_KNOWN;
    positive.push("CLIENT_BUDGET_KNOWN");
  }

  if (input.constraintsAssessed) {
    score += SIGNAL_WEIGHTS.SITE_CONDITIONS_KNOWN;
    positive.push("SITE_CONDITIONS_KNOWN");
    score += SIGNAL_WEIGHTS.COMPLEXITY_ASSESSED;
    positive.push("COMPLEXITY_ASSESSED");
  }

  if (input.rateSources.some((s) => s === "scope_rate")) {
    score += SIGNAL_WEIGHTS.SCOPE_RATE_AVAILABLE;
    positive.push("SCOPE_RATE_AVAILABLE");
  } else if (input.rateSources.some((s) => s === "org_rate")) {
    score += SIGNAL_WEIGHTS.ORG_RATE_AVAILABLE;
    positive.push("ORG_RATE_AVAILABLE");
  } else if (input.rateSources.some((s) => s === "package_rate")) {
    score += SIGNAL_WEIGHTS.PACKAGE_RATE_AVAILABLE;
    positive.push("PACKAGE_RATE_AVAILABLE");
  }

  if (input.rateSources.some((s) => s === "placeholder")) {
    score += SIGNAL_WEIGHTS.PLACEHOLDER_RATE_USED;
    negative.push("PLACEHOLDER_RATE_USED");
  }

  if (
    input.discoveryNotesLength != null &&
    input.discoveryNotesLength > 0 &&
    input.discoveryNotesLength < 40
  ) {
    score += SIGNAL_WEIGHTS.NOTES_TOO_VAGUE;
    negative.push("NOTES_TOO_VAGUE");
  }

  if (input.hasCustomScope) {
    score += SIGNAL_WEIGHTS.MULTIPLE_UNKNOWN_TRADES;
    negative.push("MULTIPLE_UNKNOWN_TRADES");
  }

  const finalScore = clampScore(score);
  const level = resolveConfidenceLevel(finalScore);

  const reasons = [
    ...positive
      .filter((s) => SIGNAL_LABELS[s])
      .map((s) => SIGNAL_LABELS[s] as string),
    ...negative
      .filter((s) => SIGNAL_LABELS[s])
      .map((s) => `⚠ ${SIGNAL_LABELS[s]}`),
  ];

  const questionsToHigh = Math.max(0, Math.ceil((75 - finalScore) / 15));

  return {
    score: finalScore,
    level,
    positiveSignals: positive,
    negativeSignals: negative,
    reasons,
    questionsToHigh,
  };
}

export function isSiteConstraintsAssessedForConfidence(input: {
  constraintCount: number;
  answeredQuestionKeys: Set<string>;
}): boolean {
  return isSiteConstraintsAssessed(input);
}
