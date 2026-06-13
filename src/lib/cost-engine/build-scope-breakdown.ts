import type { CurrentMissingItem } from "@/lib/assistant-v2/missing/get-current-missing-items";
import { contractorRateSourceLabel } from "@/lib/cost-engine/contractor-rate-source-label";
import type { WorkAreaRateSourceLine } from "@/lib/cost-engine/estimate-trace";
import type { WorkAreaEstimateTrace } from "@/lib/cost-engine/estimate-trace";
import { buildRange } from "@/lib/cost-engine/range-builder";

export type ScopeBreakdownItem = {
  scopeName: string;
  workAreaTypeKey: string;
  costLow: number;
  costHigh: number;
  sellLow: number;
  sellHigh: number;
  quantityLabel: string | null;
  rateSourceLabel: string;
  includes: string[];
  missing: string[];
  assumptions: string[];
};

function formatQuantity(quantity: number, unit: string): string | null {
  if (quantity <= 0) return null;
  if (unit === "m²" || unit === "m2") {
    return `${quantity}${unit}`;
  }
  if (unit === "m" && quantity > 0) {
    return `${quantity}${unit}`;
  }
  if (unit === "lm") {
    return `${quantity}m`;
  }
  return `${quantity} ${unit}`;
}

export function buildScopeBreakdown(input: {
  workAreaTraces: WorkAreaEstimateTrace[];
  rateSourceLines: WorkAreaRateSourceLine[];
  confidenceScore: number;
  targetMarginPercent: number;
  contingencyPercent: number;
  missingItems?: CurrentMissingItem[];
  globalAllowances?: string[];
  globalConstraints?: string[];
}): ScopeBreakdownItem[] {
  const sellMultiplier =
    (1 + input.contingencyPercent / 100) *
    (1 + input.targetMarginPercent / 100);

  return input.workAreaTraces.map((trace) => {
    const rateLine = input.rateSourceLines.find(
      (line) => line.workAreaName === trace.workAreaName
    );
    const [costLow, costHigh] = buildRange(
      trace.centralEstimate,
      input.confidenceScore
    );

    const scopeMissing = (input.missingItems ?? [])
      .filter(
        (item) =>
          item.status === "missing" &&
          (item.scopeLabel === trace.workAreaName ||
            item.scopeId != null)
      )
      .filter((item) => item.scopeLabel === trace.workAreaName)
      .map((item) =>
        item.label.replace(`${trace.workAreaName}: `, "Missing: ")
      );

    const includes: string[] = [];
    for (const assumption of trace.assumptions.slice(0, 4)) {
      if (assumption && !assumption.toLowerCase().includes("assumed")) {
        includes.push(assumption);
      } else if (assumption) {
        includes.push(assumption);
      }
    }

    for (const constraint of input.globalConstraints ?? []) {
      if (
        constraint.toLowerCase().includes(trace.workAreaName.toLowerCase()) ||
        trace.workAreaTypeKey === "Retaining Wall" &&
          /engineering|rubbish|access/i.test(constraint)
      ) {
        includes.push(constraint);
      }
    }

    for (const allowance of input.globalAllowances ?? []) {
      if (
        allowance.toLowerCase().includes(trace.workAreaName.toLowerCase()) ||
        /rubbish|engineering|spoil|skip/i.test(allowance)
      ) {
        includes.push(allowance);
      }
    }

    return {
      scopeName: trace.workAreaName,
      workAreaTypeKey: trace.workAreaTypeKey,
      costLow,
      costHigh,
      sellLow: Math.round(costLow * sellMultiplier),
      sellHigh: Math.round(costHigh * sellMultiplier),
      quantityLabel: formatQuantity(trace.quantity, trace.unit),
      rateSourceLabel: contractorRateSourceLabel(trace.rateSource, {
        scopeLabel: rateLine?.label ?? trace.workAreaName,
      }),
      includes: [...new Set(includes)].slice(0, 5),
      missing: scopeMissing.slice(0, 4),
      assumptions: trace.assumptions.slice(0, 3),
    };
  });
}
