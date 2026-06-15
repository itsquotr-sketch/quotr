import type { QualityLevel } from "@/lib/constants/quality-level";
import type { RangeQuality } from "@/lib/cost-engine/range-quality";
import type { RateSource } from "@/lib/cost-engine/rates/get-base-rate-for-scope";
import { contractorRateSourceLabel } from "@/lib/cost-engine/contractor-rate-source-label";
import { buildRange } from "@/lib/cost-engine/range-builder";
import type { CostBreakdown } from "@/lib/cost-engine/build-cost-breakdown";
import type { WorkAreaEstimateTrace } from "@/lib/cost-engine/estimate-trace";
import type { EstimateComponent } from "@/lib/cost-engine/estimate-components";
import { estimateComponentsToStructured } from "@/lib/cost-engine/estimate-components/map-components-to-trace";
import {
  resolveScopeComponents,
  buildScopeExclusionsFromComponents,
  type ResolvedScopeComponent,
} from "@/lib/scopes/templates/build-scope-components";
import {
  getCanonicalScopeTemplate,
  getCanonicalScopeTemplateByWorkAreaType,
} from "@/lib/scopes/templates";
import type { QuickEstimateWorkAreaInput } from "@/lib/cost-engine/quick-estimate-input";
import { getMissingFactsForWorkArea } from "@/lib/scopes/missing-facts";

export type StructuredEstimateComponent = {
  key: string;
  label: string;
  category: string;
  amount: number | null;
  source: "allowance" | "allocation" | "benchmark" | "none";
  included: boolean;
  assumption: string | null;
};

export type StructuredScopeBreakdown = {
  scopeId: string;
  scopeTypeKey: string;
  label: string;
  included: boolean;
  quantity: number;
  unit: string;
  rateSource: RateSource | string;
  rateLabel: string;
  rateUsed: number;
  qualityLevel: QualityLevel;
  costLow: number;
  costHigh: number;
  costCentral: number;
  sellLow: number;
  sellHigh: number;
  sellCentral: number;
  allocations: {
    labour: number;
    materials: number;
    subcontractors: number;
    allowances: number;
    contingency: number;
  };
  components: StructuredEstimateComponent[];
  assumptions: string[];
  exclusions: string[];
  missing: string[];
};

export type StructuredEstimateBreakdown = {
  total: {
    costLow: number;
    costHigh: number;
    costCentral: number;
    sellLow: number;
    sellHigh: number;
    sellCentral: number;
    marginPercent: number;
    rangeQuality: RangeQuality | string;
  };
  scopes: StructuredScopeBreakdown[];
};

function allocationAmounts(
  central: number,
  percents: {
    labour: number;
    materials: number;
    subcontractors: number;
    allowances: number;
    contingency: number;
  }
) {
  const scale = central / 100;
  return {
    labour: Math.round(percents.labour * scale),
    materials: Math.round(percents.materials * scale),
    subcontractors: Math.round(percents.subcontractors * scale),
    allowances: Math.round(percents.allowances * scale),
    contingency: Math.round(percents.contingency * scale),
  };
}

function resolveAllocationsForScope(
  workAreaTypeKey: string,
  scopeTypeKey: string,
  central: number,
  costBreakdown: CostBreakdown | undefined,
  workAreaName: string
): StructuredScopeBreakdown["allocations"] {
  const areaRow = costBreakdown?.byWorkArea.find((a) => a.name === workAreaName);
  if (areaRow && areaRow.total > 0) {
    return {
      labour: areaRow.labour,
      materials: areaRow.materials,
      subcontractors: areaRow.subcontractors,
      allowances: areaRow.allowances,
      contingency: areaRow.contingency,
    };
  }

  const template =
    getCanonicalScopeTemplate(scopeTypeKey) ??
    getCanonicalScopeTemplateByWorkAreaType(workAreaTypeKey);
  if (template) {
    return allocationAmounts(central, template.pricing.defaultAllocations);
  }

  return allocationAmounts(central, {
    labour: 40,
    materials: 40,
    subcontractors: 10,
    allowances: 5,
    contingency: 5,
  });
}

function mergePricedComponentsWithInclusion(
  priced: EstimateComponent[],
  resolved: ResolvedScopeComponent[]
): ResolvedScopeComponent[] {
  const amountByKey = new Map(
    priced.map((component) => [component.component_type, component.estimated_cost])
  );
  const sourceByKey = new Map(
    priced.map((component) => [component.component_type, component.source])
  );

  const merged = resolved.map((component) => {
    const amount = amountByKey.get(component.key);
    if (amount == null) return component;
    return {
      ...component,
      amount: amount > 0 ? amount : null,
      source:
        sourceByKey.get(component.key) === "contractor_component_rate" ||
        sourceByKey.get(component.key) === "contractor_scope_rate"
          ? ("allocation" as const)
          : ("benchmark" as const),
    };
  });

  for (const component of priced) {
    if (!merged.some((row) => row.key === component.component_type)) {
      const structured = estimateComponentsToStructured([component])[0];
      if (structured) merged.push(structured);
    }
  }

  return merged;
}

export function buildStructuredEstimateBreakdown(input: {
  workAreas: QuickEstimateWorkAreaInput[];
  workAreaTraces: WorkAreaEstimateTrace[];
  confidenceScore: number;
  contingencyPercent: number;
  marginPercent: number;
  costLow: number;
  costHigh: number;
  costCentral: number;
  sellLow: number;
  sellHigh: number;
  finishLevel: QualityLevel;
  rangeQuality: RangeQuality | string;
  costBreakdown?: CostBreakdown;
  scopeAllowances?: Record<string, string[]>;
  scopeAssumptions?: Record<string, string[]>;
  scopeEstimateComponents?: Record<string, EstimateComponent[]>;
}): StructuredEstimateBreakdown {
  const sellMultiplier =
    (1 + input.contingencyPercent / 100) * (1 + input.marginPercent / 100);
  const sellCentral = Math.round(input.costCentral * sellMultiplier);

  const scopes: StructuredScopeBreakdown[] = input.workAreas.map((area, index) => {
    const trace = input.workAreaTraces[index];
    const scopeTypeKey = trace?.scopeTypeKey ?? "generic";
    const template =
      getCanonicalScopeTemplate(scopeTypeKey) ??
      getCanonicalScopeTemplateByWorkAreaType(area.workAreaTypeKey);
    const central = trace?.centralEstimate ?? 0;
    const [costLow, costHigh] = buildRange(central, input.confidenceScore);

    const allowances = input.scopeAllowances?.[area.name] ?? [];
    const assumptions = [
      ...(input.scopeAssumptions?.[area.name] ?? []),
      ...(trace?.assumptions ?? []),
      ...(template?.assumptions.default ?? []),
    ];

    const pricedComponents = input.scopeEstimateComponents?.[area.name];
    const resolvedInclusion = resolveScopeComponents({
      scopeTypeKey,
      answers: area.answers,
      centralEstimate: central,
      allowances,
      rateSource: trace?.rateSource ?? "placeholder",
    });

    const components = pricedComponents?.length
      ? mergePricedComponentsWithInclusion(pricedComponents, resolvedInclusion)
      : resolvedInclusion;

    const exclusions = buildScopeExclusionsFromComponents(
      components,
      template?.exclusions.default ?? []
    );

    const missing = getMissingFactsForWorkArea(area.workAreaTypeKey, area.answers)
      .slice(0, 5)
      .map((f) => f.label);

    const scopeLabel = template?.label ?? area.name;
    const rateLabel = contractorRateSourceLabel(
      (trace?.rateSource ?? "placeholder") as RateSource,
      { scopeLabel }
    );

    return {
      scopeId: area.scopeId,
      scopeTypeKey,
      label: scopeLabel,
      included: true,
      quantity: trace?.quantity ?? 0,
      unit: trace?.unit ?? template?.quantity.primaryUnit ?? "each",
      rateSource: trace?.rateSource ?? "placeholder",
      rateLabel,
      rateUsed: trace?.rate ?? 0,
      qualityLevel: input.finishLevel,
      costLow,
      costHigh,
      costCentral: central,
      sellLow: Math.round(costLow * sellMultiplier),
      sellHigh: Math.round(costHigh * sellMultiplier),
      sellCentral: Math.round(central * sellMultiplier),
      allocations: resolveAllocationsForScope(
        area.workAreaTypeKey,
        scopeTypeKey,
        central,
        input.costBreakdown,
        area.name
      ),
      components: components.map((c) => ({
        key: c.key,
        label: c.label,
        category: c.category,
        amount: c.amount,
        source: c.source,
        included: c.included,
        assumption: c.assumption,
      })),
      assumptions: [...new Set(assumptions)].slice(0, 6),
      exclusions,
      missing,
    };
  });

  return {
    total: {
      costLow: input.costLow,
      costHigh: input.costHigh,
      costCentral: input.costCentral,
      sellLow: input.sellLow,
      sellHigh: input.sellHigh,
      sellCentral,
      marginPercent: input.marginPercent,
      rangeQuality: input.rangeQuality,
    },
    scopes,
  };
}
