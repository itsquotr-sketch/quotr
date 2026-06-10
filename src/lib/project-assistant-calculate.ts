import {
  DEFAULT_TARGET_MARGIN_PERCENT,
  PLACEHOLDER_BASE_RANGES,
  type QuickEstimateBudgetFit,
  type QuickEstimateConfidenceLevel,
} from "@/lib/constants/quick-estimate";
import { WORK_AREA_TO_CALC_SLUG } from "@/lib/project-assistant-constraints";
import { getIncludedTradesForWorkAreas } from "@/lib/project-assistant-trades";
import type { PackageRate } from "@/types/database";

export interface WorkAreaAnswersInput {
  scopeId: string;
  name: string;
  workAreaTypeKey: string;
  answers: Record<string, string>;
}

export interface SelectedConstraintInput {
  slug: string;
  label: string;
  metres?: number;
  sqm?: number;
  description?: string;
}

export interface AssistantCalculationInput {
  workAreas: WorkAreaAnswersInput[];
  selectedConstraints: SelectedConstraintInput[];
  packageRates: PackageRate[];
  answeredQuestionCount: number;
  totalQuestionCount: number;
  clientBudget: number | null;
  targetMarginPercent?: number;
}

export interface AssistantCalculationResult {
  canCalculate: boolean;
  reason?: string;
  estimatedCostLow: number | null;
  estimatedCostHigh: number | null;
  recommendedSellLow: number | null;
  recommendedSellHigh: number | null;
  targetMarginPercent: number;
  expectedMarginPercent: number | null;
  confidenceLevel: QuickEstimateConfidenceLevel;
  budgetFit: QuickEstimateBudgetFit;
  includedTrades: string[];
  allowances: string[];
  assumptions: string[];
  risks: string[];
  missingInformation: string[];
  usedPackageRates: boolean;
}

function deriveBudgetFit(
  clientBudget: number | null,
  sellLow: number | null,
  sellHigh: number | null
): QuickEstimateBudgetFit {
  if (clientBudget == null || sellLow == null || sellHigh == null) {
    return "unknown";
  }
  if (clientBudget < sellLow) return "below_budget";
  if (clientBudget <= sellHigh) return "within_budget";
  return "above_budget";
}

function parseNumber(value: string | undefined): number | null {
  if (!value?.trim()) return null;
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? num : null;
}

function isYes(value: string | undefined): boolean {
  return value === "yes";
}

function findPackageRate(
  packageRates: PackageRate[],
  workAreaTypeKey: string
): PackageRate | undefined {
  return packageRates.find(
    (rate) =>
      rate.is_active &&
      rate.work_area_type?.toLowerCase() === workAreaTypeKey.toLowerCase()
  );
}

function areaRatesFromPackage(
  pkg: PackageRate,
  area: number
): { low: number; high: number } {
  const lowPerUnit = Number(
    pkg.low_base_cost ?? pkg.base_cost * 0.75
  );
  const highPerUnit = Number(
    pkg.high_base_cost ?? pkg.base_cost * 1.25
  );
  return {
    low: area * lowPerUnit,
    high: area * highPerUnit,
  };
}

function calcDeck(
  answers: Record<string, string>,
  pkg: PackageRate | undefined
): {
  low: number;
  high: number;
  usedPackage: boolean;
  missing: string[];
  allowances: string[];
} {
  const area = parseNumber(answers.deck_area);
  const missing: string[] = [];
  const allowances: string[] = [];
  let low = 0;
  let high = 0;
  let usedPackage = false;

  if (area) {
    if (pkg) {
      const rates = areaRatesFromPackage(pkg, area);
      low = rates.low;
      high = rates.high;
      usedPackage = true;
      allowances.push(`${area} m² deck at package rate`);
    } else {
      low = area * 450;
      high = area * 900;
      allowances.push(`${area} m² deck at fallback rate ($450–$900/m²)`);
    }
  } else {
    const base = PLACEHOLDER_BASE_RANGES.deck;
    low = base.low;
    high = base.high;
    missing.push("Deck area not provided — using generic deck allowance");
  }

  if (answers.elevated === "elevated") {
    low *= 1.15;
    high *= 1.15;
    allowances.push("Elevated deck uplift (+15%)");
  }

  if (isYes(answers.stairs)) {
    low += 1500;
    high += 4000;
    allowances.push("Stairs allowance");
  }

  if (isYes(answers.balustrade)) {
    const length = area ? 4 * Math.sqrt(area) : 10;
    low += length * 250;
    high += length * 600;
    allowances.push("Balustrade allowance (estimated perimeter)");
  }

  if (isYes(answers.pergola)) {
    low += 3000;
    high += 9000;
    allowances.push("Pergola allowance");
  }

  return { low, high, usedPackage, missing, allowances };
}

function calcRetainingWall(
  answers: Record<string, string>,
  pkg: PackageRate | undefined
): {
  low: number;
  high: number;
  usedPackage: boolean;
  missing: string[];
  allowances: string[];
} {
  const length = parseNumber(answers.wall_length);
  const height = parseNumber(answers.wall_height);
  const wallArea = length && height ? length * height : null;
  const missing: string[] = [];
  const allowances: string[] = [];
  let low = 0;
  let high = 0;
  let usedPackage = false;

  if (wallArea) {
    if (pkg) {
      const rates = areaRatesFromPackage(pkg, wallArea);
      low = rates.low;
      high = rates.high;
      usedPackage = true;
      allowances.push(
        `${wallArea.toFixed(1)} m² wall area at package rate`
      );
    } else {
      low = wallArea * 550;
      high = wallArea * 1300;
      allowances.push(
        `${wallArea.toFixed(1)} m² wall at fallback rate ($550–$1300/m²)`
      );
    }
  } else {
    const base = PLACEHOLDER_BASE_RANGES.other;
    low = base.low;
    high = base.high;
    if (!length) missing.push("Retaining wall length not provided");
    if (!height) missing.push("Retaining wall height not provided");
  }

  if (isYes(answers.drainage)) {
    low += 1000;
    high += 3000;
    allowances.push("Drainage allowance");
  }

  if (isYes(answers.backfill)) {
    low += 1000;
    high += 4000;
    allowances.push("Backfill allowance");
  }

  if (isYes(answers.spoil_removal)) {
    low += 500;
    high += 1500;
    allowances.push("Spoil removal allowance");
  }

  if (answers.machine_access === "no") {
    low *= 1.15;
    high *= 1.15;
    allowances.push("Limited machine access uplift (+15%)");
  }

  const carting = parseNumber(answers.carting_distance);
  if (carting != null) {
    if (carting > 20) {
      low *= 1.1;
      high *= 1.1;
      allowances.push(`Carting distance ${carting}m (+10%)`);
    } else if (carting > 10) {
      low *= 1.05;
      high *= 1.05;
      allowances.push(`Carting distance ${carting}m (+5%)`);
    }
  }

  return { low, high, usedPackage, missing, allowances };
}

function calcBathroom(
  answers: Record<string, string>,
  pkg: PackageRate | undefined
): {
  low: number;
  high: number;
  usedPackage: boolean;
  missing: string[];
  allowances: string[];
} {
  const area = parseNumber(answers.floor_area);
  const missing: string[] = [];
  const allowances: string[] = [];
  let low = 0;
  let high = 0;
  let usedPackage = false;

  if (area) {
    if (pkg) {
      const rates = areaRatesFromPackage(pkg, area);
      low = rates.low;
      high = rates.high;
      usedPackage = true;
      allowances.push(`${area} m² bathroom at package rate`);
    } else {
      low = area * 3500;
      high = area * 7500;
      allowances.push(
        `${area} m² bathroom at fallback rate ($3500–$7500/m²)`
      );
    }
  } else {
    const base = PLACEHOLDER_BASE_RANGES["bathroom-renovation"];
    low = base.low;
    high = base.high;
    missing.push("Bathroom floor area not provided — using generic allowance");
  }

  if (answers.layout_same === "no") {
    low *= 1.2;
    high *= 1.2;
    allowances.push("Layout change uplift (+20%)");
  }

  if (answers.tiling_height === "full") {
    low *= 1.15;
    high *= 1.15;
    allowances.push("Full-height tiling uplift (+15%)");
  }

  if (isYes(answers.waterproofing)) {
    low += 800;
    high += 2000;
    allowances.push("Waterproofing allowance");
  }

  return { low, high, usedPackage, missing, allowances };
}

function calcGenericWorkArea(
  workAreaTypeKey: string,
  name: string
): { low: number; high: number; missing: string[]; allowances: string[] } {
  const slug = WORK_AREA_TO_CALC_SLUG[workAreaTypeKey] ?? "other";
  const base = PLACEHOLDER_BASE_RANGES[slug] ?? PLACEHOLDER_BASE_RANGES.other;
  return {
    low: base.low,
    high: base.high,
    missing: [`${name} — using generic ${workAreaTypeKey} allowance`],
    allowances: [`Generic allowance for ${name}`],
  };
}

const CONSTRAINT_PERCENT: Record<string, number> = {
  "tight-access": 0.1,
  "poor-parking": 0.05,
  "occupied-house": 0.05,
  "restricted-hours": 0.15,
  "urgent-turnaround": 0.1,
  "retaining-machine-access": 0.1,
  "deck-restricted-access": 0.1,
  "bathroom-limited-access": 0.1,
};

const CONSTRAINT_FIXED: Record<string, { low: number; high: number }> = {
  "rubbish-removal-required": { low: 500, high: 1500 },
  "retaining-drainage": { low: 1000, high: 3000 },
  "retaining-backfill": { low: 1000, high: 4000 },
  "retaining-engineering-risk": { low: 1500, high: 5000 },
};

function applyConstraints(
  low: number,
  high: number,
  constraints: SelectedConstraintInput[],
  allowances: string[]
): { low: number; high: number } {
  let multiplier = 1;
  let fixedLow = 0;
  let fixedHigh = 0;

  for (const constraint of constraints) {
    const percent = CONSTRAINT_PERCENT[constraint.slug];
    if (percent) {
      multiplier *= 1 + percent;
      allowances.push(`${constraint.label} (+${Math.round(percent * 100)}%)`);
      continue;
    }

    const fixed = CONSTRAINT_FIXED[constraint.slug];
    if (fixed) {
      fixedLow += fixed.low;
      fixedHigh += fixed.high;
      allowances.push(`${constraint.label} fixed allowance`);
      continue;
    }

    if (constraint.slug === "retaining-carting-distance") {
      const metres = constraint.metres ?? 0;
      if (metres > 20) {
        multiplier *= 1.1;
        allowances.push(`Carting distance ${metres}m (+10%)`);
      } else if (metres > 10) {
        multiplier *= 1.05;
        allowances.push(`Carting distance ${metres}m (+5%)`);
      }
    }
  }

  return {
    low: Math.round(low * multiplier + fixedLow),
    high: Math.round(high * multiplier + fixedHigh),
  };
}

function deriveConfidence(
  workAreas: WorkAreaAnswersInput[],
  answeredCount: number,
  totalQuestions: number,
  usedPackageRates: boolean,
  missingInformation: string[]
): QuickEstimateConfidenceLevel {
  const answerRatio =
    totalQuestions > 0 ? answeredCount / totalQuestions : 0;

  const hasKeyDimensions = workAreas.every((area) => {
    if (area.workAreaTypeKey === "Deck") {
      return Boolean(parseNumber(area.answers.deck_area));
    }
    if (area.workAreaTypeKey === "Retaining Wall") {
      return (
        Boolean(parseNumber(area.answers.wall_length)) &&
        Boolean(parseNumber(area.answers.wall_height))
      );
    }
    if (area.workAreaTypeKey === "Bathroom renovation") {
      return Boolean(parseNumber(area.answers.floor_area));
    }
    return true;
  });

  if (
    workAreas.length === 0 ||
    !hasKeyDimensions ||
    missingInformation.length > 2
  ) {
    return "low";
  }

  if (answerRatio >= 0.6 && usedPackageRates) {
    return "high";
  }

  if (answerRatio >= 0.4) {
    return "medium";
  }

  return "low";
}

export function calculateAssistantQuickEstimate(
  input: AssistantCalculationInput
): AssistantCalculationResult {
  const targetMarginPercent =
    input.targetMarginPercent ?? DEFAULT_TARGET_MARGIN_PERCENT;
  const marginMultiplier = 1 + targetMarginPercent / 100;

  const workAreaTypes = input.workAreas.map((w) => w.workAreaTypeKey);
  const includedTrades = getIncludedTradesForWorkAreas(workAreaTypes);
  const allowances: string[] = [];
  const assumptions: string[] = [];
  const missingInformation: string[] = [];
  let usedPackageRates = false;

  if (input.workAreas.length === 0) {
    return {
      canCalculate: false,
      reason: "Confirm at least one work area to generate a quick estimate.",
      estimatedCostLow: null,
      estimatedCostHigh: null,
      recommendedSellLow: null,
      recommendedSellHigh: null,
      targetMarginPercent,
      expectedMarginPercent: null,
      confidenceLevel: "low",
      budgetFit: "unknown",
      includedTrades,
      allowances,
      assumptions,
      risks: ["Draft estimate only — not quote-ready without detailed take-off"],
      missingInformation: ["No confirmed work areas"],
      usedPackageRates: false,
    };
  }

  let costLow = 0;
  let costHigh = 0;

  for (const area of input.workAreas) {
    const pkg = findPackageRate(input.packageRates, area.workAreaTypeKey);
    let result: {
      low: number;
      high: number;
      usedPackage: boolean;
      missing: string[];
      allowances: string[];
    };

    switch (area.workAreaTypeKey) {
      case "Deck":
        result = calcDeck(area.answers, pkg);
        break;
      case "Retaining Wall":
        result = calcRetainingWall(area.answers, pkg);
        break;
      case "Bathroom renovation":
        result = calcBathroom(area.answers, pkg);
        break;
      default: {
        const generic = calcGenericWorkArea(area.workAreaTypeKey, area.name);
        result = {
          ...generic,
          usedPackage: false,
        };
      }
    }

    costLow += result.low;
    costHigh += result.high;
    if (result.usedPackage) usedPackageRates = true;
    allowances.push(...result.allowances);
    missingInformation.push(...result.missing);
    assumptions.push(
      `${area.name} scoped as ${area.workAreaTypeKey} — subject to site check`
    );
  }

  const constrained = applyConstraints(
    costLow,
    costHigh,
    input.selectedConstraints,
    allowances
  );

  const estimatedCostLow = constrained.low;
  const estimatedCostHigh = constrained.high;
  const recommendedSellLow = Math.round(estimatedCostLow * marginMultiplier);
  const recommendedSellHigh = Math.round(estimatedCostHigh * marginMultiplier);

  const risks: string[] = [
    "Draft estimate only — not quote-ready without detailed take-off",
  ];
  if (input.selectedConstraints.some((c) => c.slug.includes("tight-access"))) {
    risks.push("Tight access may affect programme and cost");
  }
  if (input.selectedConstraints.some((c) => c.slug.includes("urgent"))) {
    risks.push("Urgent programme may require premium labour rates");
  }
  if (missingInformation.length > 0) {
    risks.push("Missing key dimensions — estimate may change significantly");
  }

  const confidenceLevel = deriveConfidence(
    input.workAreas,
    input.answeredQuestionCount,
    input.totalQuestionCount,
    usedPackageRates,
    missingInformation
  );

  return {
    canCalculate: true,
    estimatedCostLow,
    estimatedCostHigh,
    recommendedSellLow,
    recommendedSellHigh,
    targetMarginPercent,
    expectedMarginPercent: targetMarginPercent,
    confidenceLevel,
    budgetFit: deriveBudgetFit(
      input.clientBudget,
      recommendedSellLow,
      recommendedSellHigh
    ),
    includedTrades,
    allowances,
    assumptions,
    risks,
    missingInformation,
    usedPackageRates,
  };
}

export {
  formatCurrency,
  formatCurrencyRange,
} from "@/lib/quick-estimate-calculate";
