import type { QuickEstimateConstraintInput } from "@/lib/cost-engine/quick-estimate-input";
import { getAnswerValue } from "@/lib/question-keys";
import {
  formatConstraintSummaryLine,
  type SavedProjectConstraint,
} from "@/lib/project-constraints-load";

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
  central: number,
  constraint: QuickEstimateConstraintInput,
  answers: Record<string, string>,
  constraintsApplied: string[]
): number {
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

  if (percent <= 0) return central;

  const modifier = formatPercentModifier(percent);
  const label =
    metres != null
      ? `${constraint.label} ${metres}m ${modifier}`
      : `${constraint.label} ${modifier}`;

  constraintsApplied.push(label);
  return Math.round(central * (1 + percent));
}

/** Applies constraint adjustments to a single central estimate (not a range). */
export function applyConstraintsToCentral(
  centralEstimate: number,
  constraints: QuickEstimateConstraintInput[],
  answers: Record<string, string>
): { centralEstimate: number; constraintsApplied: string[] } {
  let current = centralEstimate;
  const constraintsApplied: string[] = [];

  for (const constraint of constraints) {
    const percent = CONSTRAINT_PERCENT[constraint.slug];
    if (percent) {
      current = Math.round(current * (1 + percent));
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
      current += allowance;
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
      current += allowance;
      constraintsApplied.push(
        formatConstraintSummaryLine(
          { ...constraint, severity },
          `+${formatCurrency(allowance)}`
        )
      );
    }
  }

  return { centralEstimate: current, constraintsApplied };
}

/** @deprecated Use applyConstraintsToCentral — kept for legacy imports */
export function applyConstraintsToBand(
  band: { low: number; typical: number; high: number },
  constraints: QuickEstimateConstraintInput[],
  answers: Record<string, string>
): { band: { low: number; typical: number; high: number }; constraintsApplied: string[] } {
  const { centralEstimate, constraintsApplied } = applyConstraintsToCentral(
    band.typical,
    constraints,
    answers
  );
  return {
    band: { low: centralEstimate, typical: centralEstimate, high: centralEstimate },
    constraintsApplied,
  };
}

function formatCurrency(amount: number): string {
  return `$${amount.toLocaleString("en-NZ")}`;
}
