import type { StructuredScopeBreakdown } from "@/lib/cost-engine/build-structured-estimate-breakdown";
import type { CostBreakdown } from "@/lib/cost-engine/build-cost-breakdown";
import {
  buildScopeAssumptions,
  buildScopeCostDrivers,
  buildScopeMissingLabels,
  formatExclusionLabel,
} from "@/lib/cost-engine/contractor-estimate-labels";
import type { EstimateTrace } from "@/lib/cost-engine/estimate-trace";
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
  costDrivers: string[];
  missing: string[];
  assumptions: string[];
  exclusions: string[];
  allocations: {
    labour: number;
    materials: number;
    subcontractors: number;
    allowances: number;
    contingency: number;
  } | null;
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

function scopeFromStructured(
  scope: StructuredScopeBreakdown,
  globalAllowances: string[],
  globalConstraints: string[]
): ScopeBreakdownItem {
  const quantityLabel =
    scope.quantity > 0
      ? scope.unit === "m²" || scope.unit === "m2"
        ? `${scope.quantity}${scope.unit}`
        : `${scope.quantity} ${scope.unit}`
      : null;

  const scopeAllowances = globalAllowances.filter((a) =>
    a.toLowerCase().includes(scope.label.toLowerCase())
  );

  return {
    scopeName: scope.label,
    workAreaTypeKey: scope.scopeTypeKey,
    costLow: scope.costLow,
    costHigh: scope.costHigh,
    sellLow: scope.sellLow,
    sellHigh: scope.sellHigh,
    quantityLabel,
    rateSourceLabel: scope.rateLabel,
    costDrivers: buildScopeCostDrivers({
      allowances: scopeAllowances.length > 0 ? scopeAllowances : globalAllowances,
      constraints: globalConstraints,
      scopeName: scope.label,
    }),
    missing: buildScopeMissingLabels(scope.missing, scope.label),
    assumptions: buildScopeAssumptions(scope.assumptions),
    exclusions: scope.exclusions.map(formatExclusionLabel).slice(0, 5),
    allocations: scope.allocations,
  };
}

function buildFallbackScopeBreakdown(input: {
  rateSourceLines: WorkAreaRateSourceLine[];
  costBreakdown?: CostBreakdown | null;
  confidenceScore: number;
  targetMarginPercent: number;
  contingencyPercent: number;
  missingItems?: import("@/lib/assistant-v2/missing/get-current-missing-items").CurrentMissingItem[];
  globalAllowances?: string[];
  globalConstraints?: string[];
}): ScopeBreakdownItem[] {
  const sellMultiplier =
    (1 + input.contingencyPercent / 100) *
    (1 + input.targetMarginPercent / 100);

  const areas = input.costBreakdown?.byWorkArea?.filter(
    (area) => area.workAreaTypeKey !== "allowance"
  );

  if (areas?.length) {
    return areas.map((area) => {
      const rateLine = input.rateSourceLines.find(
        (line) => line.workAreaName === area.name
      );
      const [costLow, costHigh] = buildRange(area.total, input.confidenceScore);
      const scopeMissing = buildScopeMissingLabels(
        (input.missingItems ?? [])
          .filter(
            (item) =>
              item.status === "missing" && item.scopeLabel === area.name
          )
          .map((item) => item.label),
        area.name
      );

      return {
        scopeName: area.name,
        workAreaTypeKey: area.workAreaTypeKey,
        costLow,
        costHigh,
        sellLow: Math.round(costLow * sellMultiplier),
        sellHigh: Math.round(costHigh * sellMultiplier),
        quantityLabel: null,
        rateSourceLabel: rateLine?.rateSourceLabel ??
          contractorRateSourceLabel(
            rateLine?.rateSource ?? "placeholder",
            { scopeLabel: area.name }
          ),
        costDrivers: buildScopeCostDrivers({
          allowances: input.globalAllowances ?? [],
          constraints: input.globalConstraints ?? [],
          scopeName: area.name,
        }),
        missing: scopeMissing,
        assumptions: [],
        exclusions: [],
        allocations: {
          labour: area.labour,
          materials: area.materials,
          subcontractors: area.subcontractors,
          allowances: area.allowances,
          contingency: area.contingency,
        },
      };
    });
  }

  if (input.rateSourceLines.length > 0) {
    return input.rateSourceLines.map((line) => ({
      scopeName: line.workAreaName,
      workAreaTypeKey: line.workAreaTypeKey,
      costLow: 0,
      costHigh: 0,
      sellLow: 0,
      sellHigh: 0,
      quantityLabel: null,
      rateSourceLabel: line.rateSourceLabel,
      costDrivers: [],
      missing: [],
      assumptions: [],
      exclusions: [],
      allocations: null,
    }));
  }

  return [];
}

export function buildScopeBreakdown(input: {
  structuredBreakdown?: EstimateTrace["structuredBreakdown"];
  workAreaTraces: WorkAreaEstimateTrace[];
  rateSourceLines: WorkAreaRateSourceLine[];
  confidenceScore: number;
  targetMarginPercent: number;
  contingencyPercent: number;
  costBreakdown?: CostBreakdown | null;
  missingItems?: import("@/lib/assistant-v2/missing/get-current-missing-items").CurrentMissingItem[];
  globalAllowances?: string[];
  globalConstraints?: string[];
}): ScopeBreakdownItem[] {
  if (input.structuredBreakdown?.scopes.length) {
    return input.structuredBreakdown.scopes.map((scope) =>
      scopeFromStructured(
        scope,
        input.globalAllowances ?? [],
        input.globalConstraints ?? []
      )
    );
  }

  const sellMultiplier =
    (1 + input.contingencyPercent / 100) *
    (1 + input.targetMarginPercent / 100);

  if (input.workAreaTraces.length === 0) {
    return buildFallbackScopeBreakdown(input);
  }

  return input.workAreaTraces.map((trace) => {
    const rateLine = input.rateSourceLines.find(
      (line) => line.workAreaName === trace.workAreaName
    );
    const [costLow, costHigh] = buildRange(
      trace.centralEstimate,
      input.confidenceScore
    );

    const scopeMissing = buildScopeMissingLabels(
      (input.missingItems ?? [])
        .filter(
          (item) =>
            item.status === "missing" && item.scopeLabel === trace.workAreaName
        )
        .map((item) => item.label),
      trace.workAreaName
    );

    const scopeAllowances = (input.globalAllowances ?? []).filter(
      (allowance) =>
        allowance.toLowerCase().includes(trace.workAreaName.toLowerCase()) ||
        /rubbish|engineering|spoil|skip|stairs|pergola|balustrade|drainage|backfill|demolition|waterproof|plumbing|electrical/i.test(
          allowance
        )
    );

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
      costDrivers: buildScopeCostDrivers({
        allowances:
          scopeAllowances.length > 0
            ? scopeAllowances
            : (input.globalAllowances ?? []),
        constraints: input.globalConstraints ?? [],
        scopeName: trace.workAreaName,
      }),
      missing: scopeMissing,
      assumptions: buildScopeAssumptions(trace.assumptions),
      exclusions: [],
      allocations: null,
    };
  });
}
