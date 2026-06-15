import type { CurrentMissingItem } from "@/lib/assistant-v2/missing/get-current-missing-items";
import type { CostBreakdown } from "@/lib/cost-engine/build-cost-breakdown";
import type { StructuredEstimateBreakdown } from "@/lib/cost-engine/build-structured-estimate-breakdown";
import type { ScopeBreakdownItem } from "@/lib/cost-engine/build-scope-breakdown";
import {
  allocateScopeComponents,
  groupAllocatedComponents,
  mergeAllocatedComponents,
  type PricedComponentHint,
} from "@/lib/cost-engine/component-allocation/allocate-scope-components";
import {
  buildScopeAssumptions,
  formatAssumptionLabel,
} from "@/lib/cost-engine/contractor-estimate-labels";
import {
  confidenceStatusToTier,
  type ConfidenceEvaluationResult,
} from "@/lib/assistant-v2/confidence/evaluate-confidence";
import {
  confidenceLevelLabel,
  resolveConfidenceLevel,
} from "@/lib/cost-engine/confidence/level";
import type { EstimateTrace as CalculationTrace } from "@/lib/cost-engine/trace/types";

export type CostAllocationRow = {
  key: "labour" | "materials" | "subcontractors" | "allowances" | "contingency";
  label: string;
  amount: number;
  percent: number;
};

export type AllocatedComponentItem = {
  key: string;
  label: string;
  amount: number;
};

export type ComponentGroup = {
  key: "labour" | "materials" | "subcontractors" | "allowances";
  label: string;
  totalAmount: number;
  components: AllocatedComponentItem[];
};

export type CostDriverInsight = {
  label: string;
  explanation: string;
};

export type MissingDetailGroup = {
  scopeName: string;
  items: CurrentMissingItem[];
};

export type WorkAreaInsightContext = {
  scopeName: string;
  workAreaTypeKey: string;
  scopeTypeKey?: string;
  answers?: Record<string, string>;
};

export type EstimateInsightData = {
  workAreasIncluded: string[];
  costLow: number;
  costHigh: number;
  sellLow: number | null;
  sellHigh: number | null;
  confidenceLabel: string;
  confidenceTier?: string;
  confidenceScore?: number;
  confidenceWhy?: string[];
  confidenceImprove?: string[];
  rateSourceSummary: string;
  costAllocation: CostAllocationRow[];
  componentGroups: ComponentGroup[];
  costDrivers: CostDriverInsight[];
  assumptions: string[];
  missingDetailGroups: MissingDetailGroup[];
};

const ALLOCATION_LABELS: Record<CostAllocationRow["key"], string> = {
  labour: "Labour",
  materials: "Materials",
  subcontractors: "Subcontractors",
  allowances: "Allowances",
  contingency: "Contingency",
};

function buildCostAllocation(
  totals: {
    labour: number;
    materials: number;
    subcontractors: number;
    allowances: number;
    contingency: number;
  } | null
): CostAllocationRow[] {
  if (!totals) return [];

  const entries = (
    Object.entries(totals) as [CostAllocationRow["key"], number][]
  ).filter(([, amount]) => amount > 0);

  const sum = entries.reduce((acc, [, amount]) => acc + amount, 0);
  if (sum <= 0) return [];

  return entries.map(([key, amount]) => ({
    key,
    label: ALLOCATION_LABELS[key],
    amount,
    percent: Math.round((amount / sum) * 100),
  }));
}

function resolveScopeCentral(scope: ScopeBreakdownItem): number {
  if (scope.allocations) {
    const total = Object.values(scope.allocations).reduce(
      (sum, amount) => sum + amount,
      0
    );
    if (total > 0) return total;
  }
  return Math.round((scope.costLow + scope.costHigh) / 2);
}

function resolveScopeAllocationPercents(scope: ScopeBreakdownItem) {
  if (!scope.allocations) return null;
  const central = resolveScopeCentral(scope);
  if (central <= 0) return null;

  return {
    labour: Math.round((scope.allocations.labour / central) * 100),
    materials: Math.round((scope.allocations.materials / central) * 100),
    subcontractors: Math.round((scope.allocations.subcontractors / central) * 100),
    allowances: Math.round((scope.allocations.allowances / central) * 100),
    contingency: Math.round((scope.allocations.contingency / central) * 100),
  };
}

function pricedComponentsForScope(
  scopeName: string,
  structuredBreakdown?: StructuredEstimateBreakdown,
  calculationTrace?: CalculationTrace | null
): PricedComponentHint[] {
  const structuredScope = structuredBreakdown?.scopes.find(
    (scope) => scope.label === scopeName
  );
  if (structuredScope?.components.length) {
    return structuredScope.components
      .filter((component) => component.included && (component.amount ?? 0) > 0)
      .map((component) => ({
        key: component.key,
        label: component.label,
        amount: component.amount ?? 0,
        category: component.category,
      }));
  }

  const traceScope = calculationTrace?.scopes.find(
    (scope) => scope.label === scopeName
  );
  if (traceScope?.components.length) {
    return traceScope.components
      .filter((component) => component.included && component.amount > 0)
      .map((component) => ({
        key: component.key,
        label: component.label,
        amount: component.amount,
        category: component.category,
      }));
  }

  return [];
}

function buildComponentGroups(input: {
  scopeBreakdownItems: ScopeBreakdownItem[];
  workAreaContexts?: WorkAreaInsightContext[];
  globalAllowances?: string[];
  structuredBreakdown?: StructuredEstimateBreakdown;
  calculationTrace?: CalculationTrace | null;
}): ComponentGroup[] {
  const contextByName = new Map(
    (input.workAreaContexts ?? []).map((context) => [context.scopeName, context])
  );

  const perScope = input.scopeBreakdownItems.flatMap((scope) => {
    const context = contextByName.get(scope.scopeName);
    const scopeCentral = resolveScopeCentral(scope);

    return allocateScopeComponents({
      scopeTypeKey: context?.scopeTypeKey ?? scope.workAreaTypeKey,
      workAreaTypeKey: scope.workAreaTypeKey,
      answers: context?.answers ?? {},
      scopeCentral,
      allocations: resolveScopeAllocationPercents(scope),
      projectAllowances: input.globalAllowances ?? [],
      pricedComponents: pricedComponentsForScope(
        scope.scopeName,
        input.structuredBreakdown,
        input.calculationTrace
      ),
    });
  });

  return groupAllocatedComponents(mergeAllocatedComponents(perScope));
}

function explainCostDriver(label: string): string {
  const lower = label.toLowerCase();
  if (/tiling|tile/i.test(lower)) {
    return "Tile coverage and labour drive a large share of bathroom and wet-area cost.";
  }
  if (/waterproof/i.test(lower)) {
    return "Licensed waterproofing and associated prep add fixed trade cost to wet areas.";
  }
  if (/demolition|demo/i.test(lower)) {
    return "Strip-out labour and disposal affect early-phase cost before new work starts.";
  }
  if (/carting|rubbish|spoil|skip/i.test(lower)) {
    return "Waste removal and carting distance add labour and disposal charges.";
  }
  if (/access|stairs|occupied|parking/i.test(lower)) {
    return "Site access constraints typically increase labour time and programme risk.";
  }
  if (/balustrade|pergola|engineering/i.test(lower)) {
    return "Structural or specialist elements carry higher material and trade allowances.";
  }
  if (/plumb/i.test(lower)) {
    return "Plumbing scope — especially relocation — materially shifts trade allowance.";
  }
  if (/electrical/i.test(lower)) {
    return "Electrical fit-off and compliance work adds subcontractor allowance.";
  }
  return "This item is a meaningful contributor to the scoped work area cost.";
}

function buildCostDrivers(input: {
  calculationTrace?: CalculationTrace | null;
  scopeBreakdownItems: ScopeBreakdownItem[];
  componentGroups: ComponentGroup[];
}): CostDriverInsight[] {
  const drivers: CostDriverInsight[] = [];
  const seen = new Set<string>();

  const componentDrivers = input.componentGroups
    .flatMap((group) => group.components)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 4)
    .map((component) => ({
      label: component.label,
      explanation: explainCostDriver(component.label),
      impact: component.amount,
    }));

  for (const driver of componentDrivers) {
    const key = driver.label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    drivers.push({ label: driver.label, explanation: driver.explanation });
  }

  if (drivers.length >= 4) return drivers;

  if (input.calculationTrace?.scopes.length) {
    const ranked = input.calculationTrace.scopes
      .flatMap((scope) =>
        scope.drivers.map((driver) => ({
          label: driver.label,
          explanation: driver.explanation,
          impact: Math.abs(driver.amountImpact ?? 0),
        }))
      )
      .filter((driver) => driver.label.trim().length > 0)
      .sort((a, b) => b.impact - a.impact);

    for (const driver of ranked) {
      const key = driver.label.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      drivers.push({
        label: driver.label,
        explanation: driver.explanation || explainCostDriver(driver.label),
      });
      if (drivers.length >= 6) break;
    }
  }

  if (drivers.length === 0) {
    for (const scope of input.scopeBreakdownItems) {
      for (const label of scope.costDrivers) {
        const key = label.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        drivers.push({
          label,
          explanation: explainCostDriver(label),
        });
        if (drivers.length >= 6) break;
      }
      if (drivers.length >= 6) break;
    }
  }

  return drivers;
}

function buildAssumptions(input: {
  calculationTrace?: CalculationTrace | null;
  scopeBreakdownItems: ScopeBreakdownItem[];
}): string[] {
  const seen = new Set<string>();
  const assumptions: string[] = [];

  for (const item of input.calculationTrace?.globalAssumptions ?? []) {
    const label = formatAssumptionLabel(item);
    const key = label.toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    assumptions.push(label);
  }

  for (const scope of input.calculationTrace?.scopes ?? []) {
    for (const item of buildScopeAssumptions(scope.assumptions)) {
      const key = item.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      assumptions.push(item);
    }
  }

  for (const scope of input.scopeBreakdownItems) {
    for (const item of scope.assumptions) {
      const key = item.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      assumptions.push(item);
    }
  }

  return assumptions.slice(0, 8);
}

function buildMissingDetailGroups(
  actionableMissingItems: CurrentMissingItem[]
): MissingDetailGroup[] {
  const byScope = new Map<string, CurrentMissingItem[]>();

  for (const item of actionableMissingItems) {
    if (item.status !== "missing") continue;
    if (item.importance !== "critical" && item.importance !== "useful") continue;
    const scopeName = item.scopeLabel || "Project";
    const existing = byScope.get(scopeName) ?? [];
    existing.push(item);
    byScope.set(scopeName, existing);
  }

  return [...byScope.entries()].map(([scopeName, items]) => ({
    scopeName,
    items: items.slice(0, 6),
  }));
}

function buildRateSourceSummary(scopeBreakdownItems: ScopeBreakdownItem[]): string {
  if (scopeBreakdownItems.length === 0) return "Benchmark rates";
  if (scopeBreakdownItems.length === 1) {
    return scopeBreakdownItems[0]!.rateSourceLabel;
  }
  return scopeBreakdownItems
    .map((scope) => `${scope.scopeName}: ${scope.rateSourceLabel}`)
    .join(" · ");
}

export function buildEstimateInsight(input: {
  scopeBreakdownItems: ScopeBreakdownItem[];
  costBreakdown?: CostBreakdown | null;
  structuredBreakdown?: StructuredEstimateBreakdown;
  calculationTrace?: CalculationTrace | null;
  confidenceScore: number;
  costLow: number;
  costHigh: number;
  sellLow?: number | null;
  sellHigh?: number | null;
  actionableMissingItems?: CurrentMissingItem[];
  totalAllocations?: {
    labour: number;
    materials: number;
    subcontractors: number;
    allowances: number;
    contingency: number;
  } | null;
  workAreaContexts?: WorkAreaInsightContext[];
  globalAllowances?: string[];
  confidenceEvaluation?: ConfidenceEvaluationResult | null;
}): EstimateInsightData {
  const workAreasIncluded = input.scopeBreakdownItems.map((scope) => scope.scopeName);

  const componentGroups = buildComponentGroups({
    scopeBreakdownItems: input.scopeBreakdownItems,
    workAreaContexts: input.workAreaContexts,
    globalAllowances: input.globalAllowances,
    structuredBreakdown: input.structuredBreakdown,
    calculationTrace: input.calculationTrace,
  });

  const evaluation = input.confidenceEvaluation;
  const confidenceTier = evaluation
    ? confidenceStatusToTier(evaluation.overallStatus)
    : confidenceLevelLabel(resolveConfidenceLevel(input.confidenceScore));
  const confidenceWhy = evaluation
    ? evaluation.scopes.flatMap((s) => s.confirmed).slice(0, 6)
    : [];
  const confidenceImprove = evaluation
    ? evaluation.scopes
        .flatMap((s) => [...s.missingCritical, ...s.missingUseful])
        .slice(0, 6)
    : [];

  return {
    workAreasIncluded,
    costLow: input.costLow,
    costHigh: input.costHigh,
    sellLow: input.sellLow ?? null,
    sellHigh: input.sellHigh ?? null,
    confidenceLabel: evaluation
      ? `${confidenceTier} — ${evaluation.overallScore}%`
      : confidenceLevelLabel(resolveConfidenceLevel(input.confidenceScore)),
    confidenceTier: evaluation ? confidenceTier : undefined,
    confidenceScore: evaluation?.overallScore ?? input.confidenceScore,
    confidenceWhy,
    confidenceImprove,
    rateSourceSummary: buildRateSourceSummary(input.scopeBreakdownItems),
    costAllocation: buildCostAllocation(input.totalAllocations ?? null),
    componentGroups,
    costDrivers: buildCostDrivers({
      calculationTrace: input.calculationTrace,
      scopeBreakdownItems: input.scopeBreakdownItems,
      componentGroups,
    }),
    assumptions: buildAssumptions({
      calculationTrace: input.calculationTrace,
      scopeBreakdownItems: input.scopeBreakdownItems,
    }),
    missingDetailGroups: buildMissingDetailGroups(input.actionableMissingItems ?? []),
  };
}

export function formatEstimateInsightForExport(
  projectTitle: string,
  insight: EstimateInsightData
): string {
  const lines: string[] = [
    "ESTIMATE SUMMARY — INTERNAL REVIEW",
    "Not a client quote. Indicative quick estimate for contractor review.",
    "",
    `Project: ${projectTitle}`,
    "",
    "WORK AREAS INCLUDED",
    ...insight.workAreasIncluded.map((area) => `- ${area}`),
    "",
    `Estimated cost: $${insight.costLow.toLocaleString("en-NZ")} – $${insight.costHigh.toLocaleString("en-NZ")}`,
  ];

  if (insight.sellLow != null && insight.sellHigh != null) {
    lines.push(
      `Estimated sell: $${insight.sellLow.toLocaleString("en-NZ")} – $${insight.sellHigh.toLocaleString("en-NZ")}`
    );
  }

  lines.push(
    `Confidence: ${insight.confidenceLabel}`,
    `Rate source: ${insight.rateSourceSummary}`,
    "",
    "COST ALLOCATION"
  );

  for (const row of insight.costAllocation) {
    lines.push(`- ${row.label}: $${row.amount.toLocaleString("en-NZ")} (${row.percent}%)`);
  }

  if (insight.componentGroups.length > 0) {
    lines.push("", "COMPONENT BREAKDOWN");
    for (const group of insight.componentGroups) {
      lines.push(
        `${group.label}: $${group.totalAmount.toLocaleString("en-NZ")}`
      );
      for (const component of group.components) {
        lines.push(
          `  - ${component.label}: $${component.amount.toLocaleString("en-NZ")}`
        );
      }
    }
  }

  if (insight.costDrivers.length > 0) {
    lines.push("", "BIGGEST COST DRIVERS");
    for (const driver of insight.costDrivers) {
      lines.push(`- ${driver.label}: ${driver.explanation}`);
    }
  }

  if (insight.assumptions.length > 0) {
    lines.push("", "ASSUMPTIONS USED");
    for (const assumption of insight.assumptions) {
      lines.push(`- ${assumption}`);
    }
  }

  if (insight.missingDetailGroups.length > 0) {
    lines.push("", "INFORMATION THAT WOULD IMPROVE ACCURACY");
    for (const group of insight.missingDetailGroups) {
      lines.push(`${group.scopeName}:`);
      for (const item of group.items) {
        lines.push(`  - ${item.label.replace(/^[^:]+:\s*/i, "")}`);
      }
    }
  }

  return lines.join("\n");
}
