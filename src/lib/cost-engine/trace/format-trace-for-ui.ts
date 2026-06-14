import { formatCurrencyRange } from "@/lib/format-currency";
import type {
  EstimateTrace,
  EstimateTraceDriver,
  EstimateTraceScope,
} from "@/lib/cost-engine/trace/types";

export type FormattedScopeTrace = {
  scopeName: string;
  costRange: string;
  sellRange: string;
  quantity: string | null;
  rateSource: string;
  topDrivers: string[];
  missingKey: string | null;
  assumptions: string[];
  exclusions: string[];
  allocations: {
    labour: number;
    materials: number;
    subcontractors: number;
    allowances: number;
    contingency: number;
  };
};

export type FormattedEstimateTrace = {
  summaryLine: string;
  mainCostDrivers: string[];
  scopes: FormattedScopeTrace[];
  assumptions: string[];
  exclusions: string[];
  rateSourceSummary: string[];
  totalAllocations: {
    labour: number;
    materials: number;
    subcontractors: number;
    allowances: number;
    contingency: number;
  };
};

function formatQuantity(scope: EstimateTraceScope): string | null {
  if (scope.quantity.value == null || scope.quantity.value <= 0) {
    return null;
  }
  const unit = scope.quantity.unit ?? "";
  if (unit === "m²" || unit === "m2") {
    return `${scope.quantity.value}${unit}`;
  }
  return `${scope.quantity.value} ${unit}`.trim();
}

function driverLabel(driver: EstimateTraceDriver): string {
  if (driver.amountImpact != null && driver.amountImpact !== 0) {
    const sign = driver.amountImpact > 0 ? "+" : "";
    const formatted = Math.abs(driver.amountImpact).toLocaleString("en-NZ", {
      style: "currency",
      currency: "NZD",
      maximumFractionDigits: 0,
    });
    return `${driver.label} (${sign}${formatted})`;
  }
  return driver.label;
}

function topDriversForScope(scope: EstimateTraceScope, limit = 2): string[] {
  const withImpact = scope.drivers
    .filter((d) => d.type !== "base_rate" && d.type !== "range")
    .sort((a, b) => Math.abs(b.amountImpact ?? 0) - Math.abs(a.amountImpact ?? 0));

  if (withImpact.length > 0) {
    return withImpact.slice(0, limit).map((d) => driverLabel(d));
  }

  const fallback: string[] = [];
  const qty = formatQuantity(scope);
  if (qty) fallback.push(`${qty} ${scope.label.toLowerCase()} area`);
  if (scope.qualityLevel !== "unknown") {
    fallback.push(`${scope.qualityLevel} finish`);
  }
  if (scope.rate.label) fallback.push(scope.rate.label);
  return fallback.slice(0, limit);
}

function topGlobalDrivers(trace: EstimateTrace, limit = 3): string[] {
  const allDrivers = trace.scopes.flatMap((scope) =>
    scope.drivers.map((driver) => ({
      ...driver,
      scopeLabel: scope.label,
    }))
  );

  const ranked = allDrivers
    .filter((d) => d.type !== "base_rate" && d.type !== "confidence")
    .sort((a, b) => Math.abs(b.amountImpact ?? 0) - Math.abs(a.amountImpact ?? 0));

  if (ranked.length > 0) {
    return ranked.slice(0, limit).map((d) => driverLabel(d));
  }

  const fallback: string[] = [];
  const topScope = [...trace.scopes].sort(
    (a, b) => b.cost.central - a.cost.central
  )[0];
  if (topScope) {
    const qty = formatQuantity(topScope);
    if (qty) fallback.push(`${qty} ${topScope.label.toLowerCase()} area`);
    fallback.push(...topDriversForScope(topScope, 2));
  }
  return [...new Set(fallback)].slice(0, limit);
}

function buildSummaryLine(trace: EstimateTrace): string {
  if (trace.scopes.length === 0) {
    return "Confirm work areas to see what drives this estimate.";
  }

  const topScope = [...trace.scopes].sort(
    (a, b) => b.cost.central - a.cost.central
  )[0];
  const drivers = topGlobalDrivers(trace, 2);
  const scopePart = topScope
    ? `${topScope.label} is the main cost driver`
    : "Work area costs drive this estimate";

  if (drivers.length === 0) {
    return `${scopePart}.`;
  }

  const driverPart = drivers.slice(0, 2).join(" and ").toLowerCase();
  return `${scopePart}. ${driverPart.charAt(0).toUpperCase()}${driverPart.slice(1)} increase the estimate.`;
}

export function formatTraceForUi(trace: EstimateTrace): FormattedEstimateTrace {
  const scopes: FormattedScopeTrace[] = trace.scopes.map((scope) => {
    const criticalMissing = scope.missing.find((m) => m.importance === "critical");
    return {
      scopeName: scope.label,
      costRange: formatCurrencyRange(scope.cost.low, scope.cost.high),
      sellRange: formatCurrencyRange(scope.sell.low, scope.sell.high),
      quantity: formatQuantity(scope),
      rateSource: scope.rate.label,
      topDrivers: topDriversForScope(scope, 2),
      missingKey: criticalMissing?.label ?? scope.missing[0]?.label ?? null,
      assumptions: scope.assumptions.slice(0, 4),
      exclusions: scope.exclusions.slice(0, 4),
      allocations: scope.allocations,
    };
  });

  const totalAllocations = trace.scopes.reduce(
    (acc, scope) => ({
      labour: acc.labour + scope.allocations.labour,
      materials: acc.materials + scope.allocations.materials,
      subcontractors: acc.subcontractors + scope.allocations.subcontractors,
      allowances: acc.allowances + scope.allocations.allowances,
      contingency: acc.contingency + scope.allocations.contingency,
    }),
    { labour: 0, materials: 0, subcontractors: 0, allowances: 0, contingency: 0 }
  );

  return {
    summaryLine: buildSummaryLine(trace),
    mainCostDrivers: topGlobalDrivers(trace, 3),
    scopes,
    assumptions: trace.globalAssumptions.slice(0, 6),
    exclusions: trace.globalExclusions.slice(0, 6),
    rateSourceSummary: trace.scopes.map(
      (s) => `${s.label}: ${s.rate.label}`
    ),
    totalAllocations,
  };
}

export function buildExplainEstimateResponse(trace: EstimateTrace): string {
  if (trace.scopes.length === 0) {
    return "I don't have enough detail to explain this estimate yet. Confirm at least one work area first.";
  }

  const formatted = formatTraceForUi(trace);
  const topScope = [...trace.scopes].sort(
    (a, b) => b.cost.central - a.cost.central
  )[0];
  const lines: string[] = [];

  if (topScope) {
    const qty = formatQuantity(topScope);
    if (qty) {
      lines.push(
        `The biggest driver is the ${topScope.label.toLowerCase()} area at ${qty}.`
      );
    } else {
      lines.push(`The biggest driver is ${topScope.label}.`);
    }
  }

  if (formatted.mainCostDrivers.length > 0) {
    const driverText = formatted.mainCostDrivers
      .slice(0, 3)
      .map((d) => d.replace(/\s*\([+-]?\$[\d,]+\)/, ""))
      .join(", ");
    lines.push(`The estimate also includes ${driverText.toLowerCase()}.`);
  }

  const benchmarkScopes = trace.scopes.filter(
    (s) =>
      s.rate.source === "template_benchmark" ||
      s.rate.source === "regional_benchmark" ||
      s.rate.source === "placeholder"
  );
  if (benchmarkScopes.length > 0) {
    const names = benchmarkScopes.map((s) => s.label).join(", ");
    lines.push(
      `Because no saved ${names} rate exists, I'm using Quotr benchmark rates.`
    );
  } else {
    lines.push("This estimate uses your saved rates where available.");
  }

  if (trace.globalExclusions.length > 0) {
    lines.push(
      `Not included: ${trace.globalExclusions.slice(0, 3).join(", ").toLowerCase()}.`
    );
  }

  return lines.join(" ");
}
