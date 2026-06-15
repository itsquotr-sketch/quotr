import {
  getBaseRateForScope,
  type OrgRatesInput,
  type RateSource,
} from "@/lib/cost-engine/rates/get-base-rate-for-scope";
import { rateUnitsMatch } from "@/lib/cost-engine/rates/scope-rate-utils";
import type { ScopeComponentDefinition } from "@/lib/scopes/templates/types";
import {
  pickBenchmarkComponentRate,
  confidenceForSource,
  type ComponentBenchmarkRate,
} from "@/lib/cost-engine/estimate-components/benchmark-rates";
import type { EstimateComponentSource } from "@/lib/cost-engine/estimate-components/types";

export type ResolvedComponentRate = {
  rate: number;
  source: EstimateComponentSource;
  unit: string;
};

const COMPONENT_KEYWORDS: Record<string, string[]> = {
  substructure: ["frame", "substructure", "joist", "framing"],
  decking_boards: ["deck", "decking", "board", "timber"],
  fixings: ["fixing", "screw", "nail", "hardware"],
  piles: ["pile", "post", "footing"],
  stairs: ["stair", "step"],
  balustrade: ["balustrade", "railing", "handrail"],
  demolition: ["demo", "demolition", "strip"],
  waterproofing: ["waterproof", "membrane"],
  tiling: ["tile", "tiling"],
  plumbing: ["plumb", "pipe"],
  electrical: ["electrical", "electric", "wiring"],
  fixtures: ["fixture", "vanity", "tap", "toilet"],
  painting_stopping: ["paint", "stop", "gib"],
  excavation: ["excavat", "dig", "earth"],
  wall_materials: ["wall", "block", "retaining", "sleeper"],
  drainage: ["drain", "agg", "weep"],
  backfill: ["backfill", "fill"],
  spoil_removal: ["spoil", "cart", "waste", "rubbish"],
  machine_labour: ["machine", "excavator", "bobcat"],
  engineering_allowance: ["engineer", "consent"],
  rubbish_removal: ["rubbish", "waste", "skip"],
  access_allowance: ["access", "cart"],
};

function matchesKeywords(text: string, componentType: string): boolean {
  const keywords = COMPONENT_KEYWORDS[componentType] ?? [componentType];
  const lower = text.toLowerCase();
  return keywords.some((kw) => lower.includes(kw));
}

function findContractorComponentRate(
  orgRates: OrgRatesInput,
  componentType: string,
  unit: string,
  componentDef?: ScopeComponentDefinition
): number | null {
  const category = componentDef?.category;

  if (category === "materials" || !category) {
    const material = orgRates.materialRates.find(
      (r) =>
        r.is_active &&
        rateUnitsMatch(r.unit, unit) &&
        matchesKeywords(`${r.material_name} ${r.category ?? ""}`, componentType)
    );
    if (material) return Number(material.cost_rate);
  }

  if (category === "labour" || category === "allowance" || !category) {
    const labour = orgRates.labourRates.find(
      (r) =>
        r.is_active &&
        rateUnitsMatch(r.unit, unit) &&
        matchesKeywords(`${r.name} ${r.category ?? ""}`, componentType)
    );
    if (labour) return Number(labour.cost_rate);
  }

  if (category === "subcontractor" || !category) {
    const sub = orgRates.subcontractorRates.find(
      (r) =>
        r.is_active &&
        rateUnitsMatch(r.unit, unit) &&
        matchesKeywords(r.trade, componentType)
    );
    if (sub) {
      return Number(sub.typical_cost_rate ?? sub.cost_rate);
    }
  }

  return null;
}

function scopeRateShare(
  scopeRatePerUnit: number,
  weight: number,
  componentUnit: string,
  scopeUnit: string
): number {
  if (rateUnitsMatch(componentUnit, scopeUnit)) {
    return Math.round(scopeRatePerUnit * weight);
  }
  return Math.round(scopeRatePerUnit * weight);
}

export function resolveComponentRate(input: {
  scopeTypeKey: string;
  scopeTemplateKey: string;
  workAreaTypeKey: string;
  componentType: string;
  componentUnit: string;
  componentDef?: ScopeComponentDefinition;
  rateWeight: number;
  orgRates: OrgRatesInput;
  finishLevel: "budget" | "standard" | "premium" | "unknown";
  scopeUnit: string;
  componentBenchmarks: Record<string, ComponentBenchmarkRate>;
}): ResolvedComponentRate {
  const contractorRate = findContractorComponentRate(
    input.orgRates,
    input.componentType,
    input.componentUnit,
    input.componentDef
  );
  if (contractorRate != null && contractorRate > 0) {
    return {
      rate: contractorRate,
      source: "contractor_component_rate",
      unit: input.componentUnit,
    };
  }

  const scopeBase = getBaseRateForScope(
    input.scopeTemplateKey,
    input.workAreaTypeKey,
    input.scopeUnit,
    input.orgRates,
    input.finishLevel
  );

  if (scopeBase.source === "scope_rate" && scopeBase.rate > 0) {
    return {
      rate: scopeRateShare(
        scopeBase.rate,
        input.rateWeight,
        input.componentUnit,
        input.scopeUnit
      ),
      source: "contractor_scope_rate",
      unit: input.componentUnit,
    };
  }

  const benchmark = pickBenchmarkComponentRate(
    input.componentBenchmarks,
    input.componentType,
    input.finishLevel
  );
  if (benchmark && benchmark.rate > 0) {
    return {
      rate: benchmark.rate,
      source: "benchmark_component_rate",
      unit: benchmark.unit,
    };
  }

  if (
    (scopeBase.source === "template_benchmark" ||
      scopeBase.source === "regional_fallback") &&
    scopeBase.rate > 0
  ) {
    return {
      rate: scopeRateShare(
        scopeBase.rate,
        input.rateWeight,
        input.componentUnit,
        input.scopeUnit
      ),
      source: "benchmark_scope_rate",
      unit: input.componentUnit,
    };
  }

  const placeholder =
    pickBenchmarkComponentRate(
      input.componentBenchmarks,
      input.componentType,
      "standard"
    )?.rate ?? Math.round(scopeBase.rate * input.rateWeight);

  return {
    rate: placeholder > 0 ? placeholder : 1,
    source: "placeholder",
    unit: input.componentUnit,
  };
}

export function primaryComponentRateSource(
  sources: EstimateComponentSource[]
): RateSource {
  if (sources.includes("contractor_component_rate")) return "scope_rate";
  if (sources.includes("contractor_scope_rate")) return "scope_rate";
  if (sources.includes("benchmark_component_rate")) return "template_benchmark";
  if (sources.includes("benchmark_scope_rate")) return "template_benchmark";
  return "placeholder";
}

export function averageComponentConfidence(
  sources: EstimateComponentSource[]
): number {
  if (sources.length === 0) return 25;
  const total = sources.reduce((sum, s) => sum + confidenceForSource(s), 0);
  return Math.round(total / sources.length);
}
