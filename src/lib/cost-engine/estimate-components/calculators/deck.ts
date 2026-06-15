import { getAnswerValue } from "@/lib/question-keys";
import { resolveMaterialCategory } from "@/lib/scopes/material-categories";
import { deckScopeTemplate } from "@/lib/scopes/templates/deck";
import {
  DECK_COMPONENT_BENCHMARKS,
  pickBenchmarkComponentRate,
} from "@/lib/cost-engine/estimate-components/benchmark-rates";
import {
  deriveBalustradeLengthM,
  derivePileCount,
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
import {
  getBaseRateForScope,
  type RateSource,
} from "@/lib/cost-engine/rates/get-base-rate-for-scope";

const DECK_AREA_WEIGHTS: Record<string, number> = {
  substructure: 0.32,
  decking_boards: 0.48,
  fixings: 0.12,
  piles: 0.08,
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

function applyMaterialRateMultiplier(
  baseRate: number,
  answers: Record<string, string>,
  rateSource: RateSource,
  _finishLevel: "budget" | "standard" | "premium" | "unknown"
): number {
  if (rateSource !== "template_benchmark" && rateSource !== "regional_fallback") {
    return baseRate;
  }

  const resolved = resolveMaterialCategory({ scopeTypeKey: "deck", answers });
  if (resolved) {
    const bench = deckScopeTemplate.pricing.benchmarkRates;
    if (!bench) return baseRate;
    if (resolved.benchmarkTier === "premium") return bench.premium ?? baseRate;
    if (resolved.benchmarkTier === "budget") return bench.budget ?? baseRate;
    return bench.standard ?? baseRate;
  }

  const material = getAnswerValue(answers, "deck.material_type");
  const bench = deckScopeTemplate.pricing.benchmarkRates;
  if (!bench) return baseRate;
  if (material === "composite") return bench.premium ?? baseRate;
  if (material === "treated_pine" || material === "timber") return bench.budget ?? baseRate;
  if (material === "hardwood_timber") return bench.standard ?? baseRate;
  return baseRate;
}

export function calculateDeckComponents(
  input: ScopeComponentCalcInput
): {
  components: EstimateComponent[];
  centralEstimate: number;
  quantity: number;
  unit: string;
  baseRate: number;
  rateSource: RateSource;
  finishEncodedInRate: boolean;
  inputs: string[];
  allowances: string[];
  assumptions: string[];
  traceDrivers: EstimateTraceDriver[];
} {
  const area = parsePositiveNumber(getAnswerValue(input.answers, "deck.area_m2"));
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
      rateSource: "placeholder",
      finishEncodedInRate: false,
      inputs: [],
      allowances: [],
      assumptions: [],
      traceDrivers: [],
    };
  }

  const scopeBase = getBaseRateForScope(
    "deck",
    input.workAreaTypeKey,
    scopeUnit,
    input.orgRates,
    input.finishLevel
  );
  const effectiveScopeRate = applyMaterialRateMultiplier(
    scopeBase.rate,
    input.answers,
    scopeBase.source,
    input.finishLevel
  );

  let centralEstimate = 0;

  for (const componentDef of deckScopeTemplate.pricing.components ?? []) {
    if (!isComponentIncluded(componentDef, input.answers)) continue;

    const weight = DECK_AREA_WEIGHTS[componentDef.key];
    if (weight != null) {
      const resolved = resolveComponentRate({
        scopeTypeKey: "deck",
        scopeTemplateKey: "deck",
        workAreaTypeKey: input.workAreaTypeKey,
        componentType: componentDef.key,
        componentUnit: scopeUnit,
        componentDef,
        rateWeight: weight,
        orgRates: input.orgRates,
        finishLevel: input.finishLevel,
        scopeUnit,
        componentBenchmarks: DECK_COMPONENT_BENCHMARKS,
      });

      let quantity = area;
      let unit = scopeUnit;
      let rate = resolved.rate;

      if (componentDef.key === "piles") {
        quantity = derivePileCount(area);
        unit = "each";
        const pileBench = pickBenchmarkComponentRate(
          DECK_COMPONENT_BENCHMARKS,
          "piles",
          input.finishLevel
        );
        rate =
          resolved.source === "contractor_scope_rate" ||
          resolved.source === "benchmark_scope_rate"
            ? Math.round((effectiveScopeRate * area * weight) / quantity)
            : (pileBench?.rate ?? resolved.rate);
      }

      if (
        resolved.source === "benchmark_scope_rate" ||
        resolved.source === "contractor_scope_rate"
      ) {
        rate = Math.round(effectiveScopeRate * weight);
      }

      const component = makeComponent(
        "deck",
        componentDef.key,
        quantity,
        unit,
        rate,
        resolved.source
      );
      components.push(component);
      centralEstimate += component.estimated_cost;
      continue;
    }

    if (componentDef.key === "stairs" && isYes(getAnswerValue(input.answers, "deck.has_stairs"))) {
      const resolved = resolveComponentRate({
        scopeTypeKey: "deck",
        scopeTemplateKey: "deck",
        workAreaTypeKey: input.workAreaTypeKey,
        componentType: "stairs",
        componentUnit: "each",
        componentDef,
        rateWeight: 1,
        orgRates: input.orgRates,
        finishLevel: input.finishLevel,
        scopeUnit,
        componentBenchmarks: DECK_COMPONENT_BENCHMARKS,
      });
      const component = makeComponent("deck", "stairs", 1, "each", resolved.rate, resolved.source);
      components.push(component);
      centralEstimate += component.estimated_cost;
      allowances.push("Stairs allowance");
      traceDrivers.push({
        key: "stairs",
        label: "Stairs",
        type: "flat_allowance",
        value: component.estimated_cost,
        amountImpact: component.estimated_cost,
        explanation: "Allowance included for stairs.",
        source: "template",
      });
    } else if (
      componentDef.key === "balustrade" &&
      isYes(getAnswerValue(input.answers, "deck.has_balustrade"))
    ) {
      const balustradeSupply = getAnswerValue(input.answers, "deck.balustrade_supply");
      if (balustradeSupply !== "excluded") {
        const length = deriveBalustradeLengthM(area);
        const bench = pickBenchmarkComponentRate(
          DECK_COMPONENT_BENCHMARKS,
          "balustrade",
          input.finishLevel
        );
        const rate =
          balustradeSupply === "client_supplied"
            ? Math.round((bench?.rate ?? 400) * 0.45)
            : (bench?.rate ?? 400);
        const component = makeComponent(
          "deck",
          "balustrade",
          length,
          "m",
          rate,
          "benchmark_component_rate"
        );
        components.push(component);
        centralEstimate += component.estimated_cost;
        allowances.push(
          balustradeSupply === "client_supplied"
            ? "Balustrade install allowance"
            : "Balustrade allowance"
        );
        traceDrivers.push({
          key: "balustrade",
          label: "Balustrade",
          type: "flat_allowance",
          value: component.estimated_cost,
          amountImpact: component.estimated_cost,
          explanation:
            balustradeSupply === "client_supplied"
              ? "Balustrade install only — client supplying materials."
              : "Balustrade supply and install allowance.",
          source: "template",
        });
      }
    } else if (
      componentDef.key === "rubbish_removal" &&
      (isYes(getAnswerValue(input.answers, "deck.has_existing_deck")) ||
        isYes(getAnswerValue(input.answers, "deck.rubbish_removal")))
    ) {
      const bench = pickBenchmarkComponentRate(
        DECK_COMPONENT_BENCHMARKS,
        "rubbish_removal",
        input.finishLevel
      );
      const amount = isYes(getAnswerValue(input.answers, "deck.has_existing_deck"))
        ? 1800
        : (bench?.rate ?? 1200);
      const component = makeComponent(
        "deck",
        "rubbish_removal",
        1,
        "each",
        amount,
        "benchmark_component_rate"
      );
      components.push(component);
      centralEstimate += component.estimated_cost;
      allowances.push(
        isYes(getAnswerValue(input.answers, "deck.has_existing_deck"))
          ? "Existing deck removal allowance"
          : "Rubbish removal allowance"
      );
    } else if (
      componentDef.key === "access_allowance" &&
      isYes(getAnswerValue(input.answers, "deck.tight_access"))
    ) {
      const pct = 8;
      const amount = Math.round(centralEstimate * (pct / 100));
      const component = makeComponent(
        "deck",
        "access_allowance",
        1,
        "each",
        amount,
        "benchmark_component_rate"
      );
      components.push(component);
      centralEstimate += amount;
      inputs.push("Tight access (+8%)");
      assumptions.push("Tight site access assumed (+8%)");
      traceDrivers.push({
        key: "tight_access",
        label: "Tight access",
        type: "percentage_adjustment",
        value: pct,
        amountImpact: amount,
        explanation: "Tight access increases carting and labour time.",
        source: "template",
      });
    }
  }

  if (!components.some((c) => c.component_type === "piles")) {
    const pileCount = derivePileCount(area);
    const weight = DECK_AREA_WEIGHTS.piles ?? 0.08;
    const resolved = resolveComponentRate({
      scopeTypeKey: "deck",
      scopeTemplateKey: "deck",
      workAreaTypeKey: input.workAreaTypeKey,
      componentType: "piles",
      componentUnit: "each",
      rateWeight: weight,
      orgRates: input.orgRates,
      finishLevel: input.finishLevel,
      scopeUnit,
      componentBenchmarks: DECK_COMPONENT_BENCHMARKS,
    });
    const rate =
      resolved.source === "contractor_scope_rate" ||
      resolved.source === "benchmark_scope_rate"
        ? Math.round((effectiveScopeRate * area * weight) / pileCount)
        : resolved.rate;
    const pileComponent = makeComponent(
      "deck",
      "piles",
      pileCount,
      "each",
      rate,
      resolved.source
    );
    components.push(pileComponent);
    centralEstimate += pileComponent.estimated_cost;
  }

  inputs.push(
    `Deck: ${area} m² × $${Math.round(effectiveScopeRate)}/m² (component breakdown)`
  );

  if (getAnswerValue(input.answers, "deck.level_type") === "elevated") {
    const mod = deckScopeTemplate.pricing.elevatedModifier ?? 1.15;
    const pct = Math.round((mod - 1) * 100);
    const impact = Math.round(centralEstimate * (pct / 100));
    centralEstimate += impact;
    inputs.push("Elevated deck (+15%)");
    assumptions.push("Elevated deck access assumed (+15%)");
    traceDrivers.push({
      key: "elevated_deck",
      label: "Elevated deck",
      type: "percentage_adjustment",
      value: pct,
      amountImpact: impact,
      explanation: "Elevated decks usually require more labour and framing.",
      source: "template",
    });

    const height = parsePositiveNumber(getAnswerValue(input.answers, "deck.height_m"));
    if (height && height > 1.5) {
      const heightPct = 8;
      const heightImpact = Math.round(centralEstimate * (heightPct / 100));
      centralEstimate += heightImpact;
      inputs.push("Extra height allowance (+8%)");
      traceDrivers.push({
        key: "extra_height",
        label: "Extra height",
        type: "percentage_adjustment",
        value: heightPct,
        amountImpact: heightImpact,
        explanation: "Extra height above 1.5m adds scaffolding and framing.",
        source: "template",
      });
    }
  }

  const materialSupply = getAnswerValue(input.answers, "deck.material_supply");
  if (materialSupply === "labour_only") {
    const pct = -35;
    const impact = Math.round(centralEstimate * 0.35);
    centralEstimate -= impact;
    inputs.push("Labour only (-35% materials)");
    assumptions.push("Labour only — decking materials excluded");
    traceDrivers.push({
      key: "labour_only",
      label: "Labour only",
      type: "exclusion",
      value: pct,
      amountImpact: -impact,
      explanation: "Material allowance reduced — labour only scope.",
      source: "user",
    });
  } else if (materialSupply === "client_supplied") {
    const pct = -25;
    const impact = Math.round(centralEstimate * 0.25);
    centralEstimate -= impact;
    inputs.push("Client-supplied decking (-25%)");
    assumptions.push("Client-supplied decking materials");
    traceDrivers.push({
      key: "client_supplied_materials",
      label: "Client-supplied materials",
      type: "exclusion",
      value: pct,
      amountImpact: -impact,
      explanation: "Material allowance reduced because client is supplying materials.",
      source: "user",
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
    baseRate: effectiveScopeRate,
    rateSource: scopeBase.source,
    finishEncodedInRate,
    inputs,
    allowances,
    assumptions,
    traceDrivers,
  };
}
