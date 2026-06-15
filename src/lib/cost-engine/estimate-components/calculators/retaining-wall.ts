import { getAnswerValue } from "@/lib/question-keys";
import { resolveMaterialCategory } from "@/lib/scopes/material-categories";
import { retainingWallScopeTemplate } from "@/lib/scopes/templates/retaining-wall";
import { RETAINING_WALL_COMPONENT_BENCHMARKS } from "@/lib/cost-engine/estimate-components/benchmark-rates";
import {
  isComponentIncluded,
  isYes,
  parsePositiveNumber,
} from "@/lib/cost-engine/estimate-components/component-utils";
import { resolveComponentRate } from "@/lib/cost-engine/estimate-components/resolve-component-rate";
import type {
  EstimateComponent,
  ScopeComponentCalcInput,
} from "@/lib/cost-engine/estimate-components/types";
import type { EstimateTraceDriver } from "@/lib/cost-engine/trace/types";
import { getBaseRateForScope, type RateSource } from "@/lib/cost-engine/rates/get-base-rate-for-scope";

const WALL_AREA_WEIGHTS: Record<string, number> = {
  excavation: 0.18,
  wall_materials: 0.52,
  machine_labour: 0.12,
};

function makeComponent(
  scopeType: string,
  componentType: string,
  quantity: number,
  unit: string,
  rate: number,
  source: EstimateComponent["source"]
): EstimateComponent {
  return {
    id: `${scopeType}:${componentType}`,
    scope_type: scopeType,
    component_type: componentType,
    quantity,
    unit,
    source,
    estimated_cost: Math.round(quantity * rate),
    confidence:
      source === "contractor_component_rate"
        ? 85
        : source === "contractor_scope_rate"
          ? 75
          : source === "benchmark_component_rate"
            ? 55
            : source === "benchmark_scope_rate"
              ? 45
              : 25,
  };
}

export function calculateRetainingWallComponents(input: ScopeComponentCalcInput) {
  const length = parsePositiveNumber(
    getAnswerValue(input.answers, "retaining_wall.length_m")
  );
  const height = parsePositiveNumber(
    getAnswerValue(input.answers, "retaining_wall.height_m")
  );
  const wallArea = length && height ? length * height : null;
  const scopeUnit = "m²";
  const traceDrivers: EstimateTraceDriver[] = [];
  const inputs: string[] = [];
  const allowances: string[] = [];
  const assumptions: string[] = [];
  const components: EstimateComponent[] = [];

  if (!wallArea) {
    return {
      components: [],
      centralEstimate: 0,
      quantity: 0,
      unit: scopeUnit,
      baseRate: 0,
      rateSource: "placeholder" as RateSource,
      finishEncodedInRate: false,
      inputs: [],
      allowances: [],
      assumptions: [],
      traceDrivers: [],
    };
  }

  const scopeBase = getBaseRateForScope(
    "retaining_wall",
    input.workAreaTypeKey,
    scopeUnit,
    input.orgRates,
    input.finishLevel
  );

  let effectiveRate = scopeBase.rate;
  const resolved = resolveMaterialCategory({
    scopeTypeKey: "retaining_wall",
    answers: input.answers,
  });
  if (resolved) {
    effectiveRate = Math.round(scopeBase.rate * resolved.rateMultiplier);
    if (resolved.source === "assumed") {
      assumptions.push(
        `Material category assumed: ${resolved.categoryLabel} (default benchmark)`
      );
    }
  } else {
    const material = getAnswerValue(input.answers, "retaining_wall.material");
    if (material === "timber") effectiveRate = Math.round(scopeBase.rate * 0.9);
    if (material === "concrete" || material === "concrete_sleeper") {
      effectiveRate = Math.round(scopeBase.rate * 1.15);
    }
  }

  let centralEstimate = 0;

  for (const componentDef of retainingWallScopeTemplate.pricing.components ?? []) {
    if (!isComponentIncluded(componentDef, input.answers)) continue;

    const weight = WALL_AREA_WEIGHTS[componentDef.key];
    if (weight != null) {
      const resolvedRate = resolveComponentRate({
        scopeTypeKey: "retaining_wall",
        scopeTemplateKey: "retaining_wall",
        workAreaTypeKey: input.workAreaTypeKey,
        componentType: componentDef.key,
        componentUnit: scopeUnit,
        componentDef,
        rateWeight: weight,
        orgRates: input.orgRates,
        finishLevel: input.finishLevel,
        scopeUnit,
        componentBenchmarks: RETAINING_WALL_COMPONENT_BENCHMARKS,
      });

      let rate = resolvedRate.rate;
      if (
        resolvedRate.source === "benchmark_scope_rate" ||
        resolvedRate.source === "contractor_scope_rate"
      ) {
        rate = Math.round(effectiveRate * weight);
      }

      const component = makeComponent(
        "retaining_wall",
        componentDef.key,
        wallArea,
        scopeUnit,
        rate,
        resolvedRate.source
      );
      components.push(component);
      centralEstimate += component.estimated_cost;
      continue;
    }

    if (componentDef.key === "drainage" && isYes(getAnswerValue(input.answers, "retaining_wall.has_drainage"))) {
      const bench = RETAINING_WALL_COMPONENT_BENCHMARKS.drainage;
      const rate =
        input.finishLevel === "budget"
          ? bench.budget
          : input.finishLevel === "premium"
            ? bench.premium
            : bench.standard;
      const component = makeComponent(
        "retaining_wall",
        "drainage",
        1,
        "each",
        rate,
        "benchmark_component_rate"
      );
      components.push(component);
      centralEstimate += component.estimated_cost;
      allowances.push("Drainage allowance");
      traceDrivers.push({
        key: "drainage",
        label: "Drainage",
        type: "flat_allowance",
        value: component.estimated_cost,
        amountImpact: component.estimated_cost,
        explanation: "Allowance included for drainage behind the wall.",
        source: "template",
      });
    } else if (
      componentDef.key === "backfill" &&
      isYes(getAnswerValue(input.answers, "retaining_wall.has_backfill"))
    ) {
      const bench = RETAINING_WALL_COMPONENT_BENCHMARKS.backfill;
      const rate =
        input.finishLevel === "budget"
          ? bench.budget
          : input.finishLevel === "premium"
            ? bench.premium
            : bench.standard;
      const component = makeComponent(
        "retaining_wall",
        "backfill",
        1,
        "each",
        rate,
        "benchmark_component_rate"
      );
      components.push(component);
      centralEstimate += component.estimated_cost;
      allowances.push("Backfill allowance");
      traceDrivers.push({
        key: "backfill",
        label: "Backfill",
        type: "flat_allowance",
        value: component.estimated_cost,
        amountImpact: component.estimated_cost,
        explanation: "Allowance included for backfill material and labour.",
        source: "template",
      });
    } else if (
      componentDef.key === "spoil_removal" &&
      isYes(getAnswerValue(input.answers, "retaining_wall.has_spoil_removal"))
    ) {
      const bench = RETAINING_WALL_COMPONENT_BENCHMARKS.spoil_removal;
      const rate =
        input.finishLevel === "budget"
          ? bench.budget
          : input.finishLevel === "premium"
            ? bench.premium
            : bench.standard;
      const component = makeComponent(
        "retaining_wall",
        "spoil_removal",
        1,
        "each",
        rate,
        "benchmark_component_rate"
      );
      components.push(component);
      centralEstimate += component.estimated_cost;
      allowances.push("Spoil removal allowance");
      traceDrivers.push({
        key: "spoil_removal",
        label: "Spoil removal",
        type: "flat_allowance",
        value: component.estimated_cost,
        amountImpact: component.estimated_cost,
        explanation: "Allowance for spoil removal off site.",
        source: "template",
      });
    }
  }

  inputs.push(
    `Retaining Wall: ${length}m × ${height}m = ${wallArea.toFixed(1)}m² × $${Math.round(effectiveRate)}/m² (component breakdown)`
  );

  if (isYes(getAnswerValue(input.answers, "retaining_wall.surcharge_loading"))) {
    const pct = 12;
    const impact = Math.round(centralEstimate * (pct / 100));
    centralEstimate += impact;
    inputs.push("Surcharge/loading risk (+12%)");
    assumptions.push("Surcharge or loading above wall assumed (+12%)");
    traceDrivers.push({
      key: "surcharge_loading",
      label: "Surcharge / loading",
      type: "percentage_adjustment",
      value: pct,
      amountImpact: impact,
      explanation: "Loading above the wall increases structural requirements.",
      source: "template",
    });
  }

  const finishEncodedInRate =
    input.finishLevel !== "unknown" &&
    (scopeBase.source === "template_benchmark" || scopeBase.source === "scope_rate");

  return {
    components,
    centralEstimate: Math.round(centralEstimate),
    quantity: wallArea,
    unit: scopeUnit,
    baseRate: effectiveRate,
    rateSource: scopeBase.source,
    finishEncodedInRate,
    inputs,
    allowances,
    assumptions,
    traceDrivers,
  };
}
