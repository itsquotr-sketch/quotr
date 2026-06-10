import type { QuickEstimateConstraintInput } from "@/lib/cost-engine/quick-estimate-input";
import { getAnswerValue } from "@/lib/question-keys";
import {
  formatConstraintSummaryLine,
  type SavedProjectConstraint,
} from "@/lib/project-constraints-load";

type CostBand = { low: number; typical: number; high: number };

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

const ENGINEERING_ALLOWANCE: Record<"low" | "typical" | "high", number> = {
  low: 1500,
  typical: 3000,
  high: 6000,
};

const RUBBISH_ALLOWANCE: Record<"low" | "typical" | "high", number> = {
  low: 500,
  typical: 1000,
  high: 1500,
};

function parseNumber(value: string | undefined): number | null {
  if (!value?.trim()) return null;
  const num = Number(value);
  return Number.isFinite(num) && num >= 0 ? num : null;
}

function resolveSeverity(
  constraint: QuickEstimateConstraintInput
): "low" | "typical" | "high" {
  return constraint.severity ?? "typical";
}

function formatPercentModifier(percent: number): string {
  return `+${Math.round(percent * 100)}%`;
}

function applyCartingDistance(
  band: CostBand,
  constraint: QuickEstimateConstraintInput,
  answers: Record<string, string>,
  constraintsApplied: string[]
): CostBand {
  const metres =
    constraint.metres ??
    parseNumber(getAnswerValue(answers, "retaining_wall.carting_distance_m")) ??
    null;

  let percent = 0;
  if (metres == null) {
    percent = 0.05;
  } else if (metres > 20) {
    percent = 0.1;
  } else if (metres > 10) {
    percent = 0.05;
  }

  if (percent <= 0) {
    return band;
  }

  const modifier = formatPercentModifier(percent);
  const label =
    metres != null
      ? `${constraint.label} ${metres}m ${modifier}`
      : `${constraint.label} ${modifier}`;

  constraintsApplied.push(label);

  const multiplier = 1 + percent;
  return {
    low: Math.round(band.low * multiplier),
    typical: Math.round(band.typical * multiplier),
    high: Math.round(band.high * multiplier),
  };
}

export function applyConstraintsToBand(
  band: CostBand,
  constraints: QuickEstimateConstraintInput[],
  answers: Record<string, string>
): { band: CostBand; constraintsApplied: string[] } {
  let current = { ...band };
  const constraintsApplied: string[] = [];

  for (const constraint of constraints) {
    const percent = CONSTRAINT_PERCENT[constraint.slug];
    if (percent) {
      const multiplier = 1 + percent;
      current = {
        low: Math.round(current.low * multiplier),
        typical: Math.round(current.typical * multiplier),
        high: Math.round(current.high * multiplier),
      };
      constraintsApplied.push(
        formatConstraintSummaryLine(
          constraint as SavedProjectConstraint,
          formatPercentModifier(percent)
        )
      );
      continue;
    }

    if (
      constraint.slug === "carting-distance" ||
      constraint.slug === "retaining-carting-distance"
    ) {
      current = applyCartingDistance(
        current,
        constraint,
        answers,
        constraintsApplied
      );
      continue;
    }

    if (constraint.slug === "retaining-engineering-risk") {
      const severity = resolveSeverity(constraint);
      const allowance = ENGINEERING_ALLOWANCE[severity];
      current = {
        low: current.low + allowance,
        typical: current.typical + allowance,
        high: current.high + allowance,
      };
      constraintsApplied.push(
        formatConstraintSummaryLine(
          { ...constraint, severity },
          `+${formatCurrency(allowance)}`
        )
      );
      continue;
    }

    if (constraint.slug === "rubbish-removal-required") {
      const severity = resolveSeverity(constraint);
      const allowance = RUBBISH_ALLOWANCE[severity];
      current = {
        low: current.low + allowance,
        typical: current.typical + allowance,
        high: current.high + allowance,
      };
      constraintsApplied.push(
        formatConstraintSummaryLine(
          { ...constraint, severity },
          `+${formatCurrency(allowance)}`
        )
      );
    }
  }

  return { band: current, constraintsApplied };
}

function formatCurrency(amount: number): string {
  return `$${amount.toLocaleString("en-NZ")}`;
}
