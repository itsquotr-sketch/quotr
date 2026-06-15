import { getAnswerValue } from "@/lib/question-keys";
import { bathroomRenovationScopeTemplate } from "@/lib/scopes/templates/bathroom-renovation";
import { BATHROOM_COMPONENT_BENCHMARKS } from "@/lib/cost-engine/estimate-components/benchmark-rates";
import {
  deriveTileAreaM2,
  deriveWetAreaM2,
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

const BATHROOM_AREA_WEIGHTS: Record<string, number> = {
  demolition: 0.08,
  waterproofing: 0.06,
  tiling: 0.22,
  plumbing: 0.18,
  electrical: 0.1,
  fixtures: 0.24,
  painting_stopping: 0.12,
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

function componentQuantity(
  componentKey: string,
  floorArea: number,
  answers: Record<string, string>
): { quantity: number; unit: string } {
  switch (componentKey) {
    case "waterproofing":
      return { quantity: deriveWetAreaM2(floorArea), unit: "m²" };
    case "tiling":
      return { quantity: deriveTileAreaM2(floorArea, answers), unit: "m²" };
    default:
      return { quantity: floorArea, unit: "m²" };
  }
}

export function calculateBathroomComponents(input: ScopeComponentCalcInput) {
  const area = parsePositiveNumber(
    getAnswerValue(input.answers, "bathroom.floor_area_m2")
  );
  const scopeUnit = "m²";
  const traceDrivers: EstimateTraceDriver[] = [];
  const inputs: string[] = [];
  const allowances: string[] = [];
  const assumptions: string[] = [];
  const components: EstimateComponent[] = [];

  if (!area) {
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
    "bathroom_renovation",
    input.workAreaTypeKey,
    scopeUnit,
    input.orgRates,
    input.finishLevel
  );

  let centralEstimate = 0;

  for (const componentDef of bathroomRenovationScopeTemplate.pricing.components ?? []) {
    if (!isComponentIncluded(componentDef, input.answers)) continue;

    const weight = BATHROOM_AREA_WEIGHTS[componentDef.key];
    if (weight != null) {
      const { quantity, unit } = componentQuantity(
        componentDef.key,
        area,
        input.answers
      );
      const resolved = resolveComponentRate({
        scopeTypeKey: "bathroom_renovation",
        scopeTemplateKey: "bathroom_renovation",
        workAreaTypeKey: input.workAreaTypeKey,
        componentType: componentDef.key,
        componentUnit: unit,
        componentDef,
        rateWeight: weight,
        orgRates: input.orgRates,
        finishLevel: input.finishLevel,
        scopeUnit,
        componentBenchmarks: BATHROOM_COMPONENT_BENCHMARKS,
      });

      let rate = resolved.rate;
      if (
        resolved.source === "benchmark_scope_rate" ||
        resolved.source === "contractor_scope_rate"
      ) {
        rate = Math.round(scopeBase.rate * weight);
      }

      const component = makeComponent(
        "bathroom_renovation",
        componentDef.key,
        quantity,
        unit,
        rate,
        resolved.source
      );
      components.push(component);
      centralEstimate += component.estimated_cost;
    }
  }

  inputs.push(
    `Bathroom renovation: ${area} m² × $${Math.round(scopeBase.rate)}/m² (component breakdown)`
  );

  if (isYes(getAnswerValue(input.answers, "bathroom.layout_changing"))) {
    const mod = bathroomRenovationScopeTemplate.pricing.layoutChangeModifier ?? 1.2;
    const pct = Math.round((mod - 1) * 100);
    const impact = Math.round(centralEstimate * (pct / 100));
    centralEstimate += impact;
    inputs.push("Layout changing (+20%)");
    assumptions.push("Bathroom layout change assumed (+20%)");
    traceDrivers.push({
      key: "layout_change",
      label: "Layout changing",
      type: "percentage_adjustment",
      value: pct,
      amountImpact: impact,
      explanation: "Layout changes increase plumbing, electrical, and labour.",
      source: "template",
    });
  }

  const tileExtent =
    getAnswerValue(input.answers, "bathroom.tile_extent") ??
    getAnswerValue(input.answers, "bathroom.tile_height");
  if (tileExtent === "full") {
    const pct = 15;
    const impact = Math.round(centralEstimate * (pct / 100));
    centralEstimate += impact;
    inputs.push("Full-height tiling (+15%)");
    traceDrivers.push({
      key: "full_height_tiling",
      label: "Full-height tiling",
      type: "percentage_adjustment",
      value: pct,
      amountImpact: impact,
      explanation: "Full-height tiling increases tile area and labour.",
      source: "template",
    });
  }

  if (isYes(getAnswerValue(input.answers, "bathroom.rubbish_removal"))) {
    const bench = BATHROOM_COMPONENT_BENCHMARKS.rubbish_removal;
    const rate =
      input.finishLevel === "budget"
        ? bench.budget
        : input.finishLevel === "premium"
          ? bench.premium
          : bench.standard;
    const component = makeComponent(
      "bathroom_renovation",
      "rubbish_removal",
      1,
      "each",
      rate,
      "benchmark_component_rate"
    );
    components.push(component);
    centralEstimate += component.estimated_cost;
    allowances.push("Rubbish removal allowance");
  }

  const fixturesSupply = getAnswerValue(
    input.answers,
    "bathroom.fixtures_client_supplied"
  );
  if (fixturesSupply === "yes") {
    const pct = -12;
    const impact = Math.round(centralEstimate * 0.12);
    centralEstimate -= impact;
    inputs.push("Client-supplied fixtures (-12%)");
    assumptions.push("Fixtures client-supplied — material allowance reduced");
    traceDrivers.push({
      key: "client_supplied_fixtures",
      label: "Client-supplied fixtures",
      type: "exclusion",
      value: pct,
      amountImpact: -impact,
      explanation:
        "Fixture material allowance reduced — client supplying vanity and fittings.",
      source: "user",
    });
  } else if (fixturesSupply === "partial") {
    const pct = -6;
    const impact = Math.round(centralEstimate * 0.06);
    centralEstimate -= impact;
    inputs.push("Partial client-supplied fixtures (-6%)");
    assumptions.push("Some fixtures client-supplied");
    traceDrivers.push({
      key: "partial_client_supplied_fixtures",
      label: "Partial client-supplied fixtures",
      type: "exclusion",
      value: pct,
      amountImpact: -impact,
      explanation: "Some fixtures client-supplied.",
      source: "user",
    });
  }

  const tilesSupply = getAnswerValue(input.answers, "bathroom.tiles_supplied_by");
  if (tilesSupply === "client") {
    const pct = -8;
    const impact = Math.round(centralEstimate * 0.08);
    centralEstimate -= impact;
    inputs.push("Client-supplied tiles (-8%)");
    assumptions.push("Tiles client-supplied — tile material excluded");
    traceDrivers.push({
      key: "client_supplied_tiles",
      label: "Client-supplied tiles",
      type: "exclusion",
      value: pct,
      amountImpact: -impact,
      explanation: "Tile material excluded — client supplying tiles.",
      source: "user",
    });
  }

  if (isYes(getAnswerValue(input.answers, "bathroom.occupied_home"))) {
    const pct = 6;
    const impact = Math.round(centralEstimate * (pct / 100));
    centralEstimate += impact;
    inputs.push("Occupied home (+6%)");
    traceDrivers.push({
      key: "occupied_home",
      label: "Occupied home",
      type: "percentage_adjustment",
      value: pct,
      amountImpact: impact,
      explanation: "Working in an occupied home adds coordination time.",
      source: "template",
    });
  }

  const finishEncodedInRate =
    input.finishLevel !== "unknown" &&
    (scopeBase.source === "template_benchmark" || scopeBase.source === "scope_rate");

  return {
    components,
    centralEstimate: Math.round(centralEstimate),
    quantity: area,
    unit: scopeUnit,
    baseRate: scopeBase.rate,
    rateSource: scopeBase.source,
    finishEncodedInRate,
    inputs,
    allowances,
    assumptions,
    traceDrivers,
  };
}
