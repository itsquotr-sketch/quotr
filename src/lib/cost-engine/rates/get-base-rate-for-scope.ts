import { PLACEHOLDER_BASE_RANGES } from "@/lib/constants/quick-estimate";
import {
  getScopeRateDefinition,
  getScopeRateDefinitionByKey,
} from "@/lib/constants/scope-rates";
import { getScopeTemplateByWorkAreaType } from "@/lib/scope-templates";
import type {
  LabourRate,
  MaterialRate,
  PackageRate,
  ScopeRate,
  SubcontractorRate,
} from "@/types/database";
import {
  pickScopeRateValue,
  rateUnitsMatch,
} from "@/lib/cost-engine/rates/scope-rate-utils";

export type RateSource =
  | "scope_rate"
  | "package_rate"
  | "org_rate"
  | "template_benchmark"
  | "regional_fallback"
  | "placeholder";

export type BaseRateResult = {
  rate: number;
  source: RateSource;
  confidenceBonus: number;
  scopeTypeKey?: string;
  scopeRateId?: string;
  usesDefaultRateOnly?: boolean;
};

export type OrgRatesInput = {
  scopeRates: ScopeRate[];
  labourRates: LabourRate[];
  materialRates: MaterialRate[];
  subcontractorRates: SubcontractorRate[];
  packageRates: PackageRate[];
};

const SCOPE_KEYWORDS: Record<string, string[]> = {
  deck: [
    "deck",
    "decking",
    "timber",
    "composite",
    "hardwood",
    "merbau",
    "kwila",
    "outdoor",
  ],
  "retaining-wall": [
    "retaining",
    "wall",
    "block",
    "blockwall",
    "blockwork",
    "sleeper",
    "gabion",
    "earth",
  ],
  "retaining_wall": [
    "retaining",
    "wall",
    "block",
    "blockwall",
    "blockwork",
    "sleeper",
    "gabion",
    "earth",
  ],
  "bathroom-renovation": [
    "bathroom",
    "bath",
    "tile",
    "tiling",
    "vanity",
    "shower",
    "ensuite",
    "wet area",
    "reno",
  ],
  bathroom_renovation: [
    "bathroom",
    "bath",
    "tile",
    "tiling",
    "vanity",
    "shower",
    "ensuite",
    "wet area",
    "reno",
  ],
  "kitchen-renovation": [
    "kitchen",
    "cabinetry",
    "benchtops",
    "joinery",
    "appliances",
  ],
  kitchen_renovation: [
    "kitchen",
    "cabinetry",
    "benchtops",
    "joinery",
    "appliances",
  ],
};

function normaliseKey(key: string): string {
  return key.toLowerCase().replace(/\s+/g, "-").replace(/_/g, "-");
}

function findScopeRate(
  scopeRates: ScopeRate[],
  scopeTypeKey: string,
  unit: string
): ScopeRate | undefined {
  return scopeRates.find(
    (rate) =>
      rate.is_active &&
      rate.scope_type_key === scopeTypeKey &&
      rateUnitsMatch(rate.unit, unit)
  );
}

function findPackageRate(
  packageRates: PackageRate[],
  workAreaTypeKey: string
): PackageRate | undefined {
  return packageRates.find(
    (rate) =>
      rate.is_active &&
      rate.work_area_type?.toLowerCase() === workAreaTypeKey.toLowerCase()
  );
}

function matchesScopeKeywords(text: string, scopeKey: string): boolean {
  const keywords =
    SCOPE_KEYWORDS[normaliseKey(scopeKey)] ??
    SCOPE_KEYWORDS[scopeKey.replace(/-/g, "_")] ??
    [scopeKey];
  const lower = text.toLowerCase();
  return keywords.some((kw) => lower.includes(kw));
}

function findOrgMaterialRate(
  materialRates: MaterialRate[],
  scopeTemplateKey: string,
  unit: string
): MaterialRate | undefined {
  return materialRates.find(
    (r) =>
      r.is_active &&
      rateUnitsMatch(r.unit, unit) &&
      matchesScopeKeywords(
        `${r.material_name} ${r.category ?? ""}`,
        scopeTemplateKey
      )
  );
}

function findOrgLabourRate(
  labourRates: LabourRate[],
  scopeTemplateKey: string,
  unit: string
): LabourRate | undefined {
  return labourRates.find(
    (r) =>
      r.is_active &&
      rateUnitsMatch(r.unit, unit) &&
      matchesScopeKeywords(`${r.name} ${r.category ?? ""}`, scopeTemplateKey)
  );
}

function findOrgSubcontractorRate(
  subcontractorRates: SubcontractorRate[],
  scopeTemplateKey: string,
  unit: string
): SubcontractorRate | undefined {
  return subcontractorRates.find(
    (r) =>
      r.is_active &&
      rateUnitsMatch(r.unit, unit) &&
      matchesScopeKeywords(r.trade, scopeTemplateKey)
  );
}

function placeholderRateForScope(
  scopeTemplateKey: string,
  workAreaTypeKey: string,
  unit: string
): number {
  const template = getScopeTemplateByWorkAreaType(workAreaTypeKey);
  if (template?.benchmarkRates && rateUnitsMatch(unit, template.benchmarkRates.unit)) {
    return template.benchmarkRates.typical;
  }

  const key = normaliseKey(scopeTemplateKey);
  const placeholder =
    PLACEHOLDER_BASE_RANGES[key] ??
    PLACEHOLDER_BASE_RANGES[key.replace(/-/g, "_")] ??
    PLACEHOLDER_BASE_RANGES.other;
  const mid = (placeholder.low + placeholder.high) / 2;
  if (rateUnitsMatch(unit, "m²")) {
    const typicalArea =
      key === "deck" ? 25 : key.includes("bathroom") ? 6 : 12;
    return Math.round(mid / typicalArea);
  }
  return Math.round(mid);
}

export function getBaseRateForScope(
  scopeTemplateKey: string,
  workAreaTypeKey: string,
  unit: string,
  orgRates: OrgRatesInput,
  finishLevel?: "budget" | "standard" | "premium" | "unknown"
): BaseRateResult {
  const scopeDef =
    getScopeRateDefinitionByKey(scopeTemplateKey) ??
    getScopeRateDefinition(workAreaTypeKey);
  const scopeTypeKey = scopeDef?.scopeTypeKey ?? scopeTemplateKey;

  const scopeRate = findScopeRate(orgRates.scopeRates, scopeTypeKey, unit);
  if (scopeRate) {
    const rate = pickScopeRateValue(scopeRate, finishLevel);
    if (rate != null && rate > 0) {
      const usesDefaultRateOnly =
        finishLevel === "unknown" &&
        scopeRate.standard_rate == null &&
        scopeRate.default_rate != null;
      return {
        rate,
        source: "scope_rate",
        confidenceBonus: 12,
        scopeTypeKey,
        scopeRateId: scopeRate.id,
        usesDefaultRateOnly,
      };
    }
  }

  const pkg = findPackageRate(orgRates.packageRates, workAreaTypeKey);
  if (pkg) {
    const typical = Number(pkg.typical_base_cost ?? pkg.base_cost);
    return { rate: typical, source: "package_rate", confidenceBonus: 5 };
  }

  const material = findOrgMaterialRate(
    orgRates.materialRates,
    scopeTemplateKey,
    unit
  );
  if (material) {
    return {
      rate: Number(material.cost_rate),
      source: "org_rate",
      confidenceBonus: 10,
    };
  }

  const labour = findOrgLabourRate(
    orgRates.labourRates,
    scopeTemplateKey,
    unit
  );
  if (labour) {
    return {
      rate: Number(labour.cost_rate),
      source: "org_rate",
      confidenceBonus: 10,
    };
  }

  const sub = findOrgSubcontractorRate(
    orgRates.subcontractorRates,
    scopeTemplateKey,
    unit
  );
  if (sub) {
    const rate = Number(sub.typical_cost_rate ?? sub.cost_rate);
    return { rate, source: "org_rate", confidenceBonus: 10 };
  }

  const template = getScopeTemplateByWorkAreaType(workAreaTypeKey);
  if (template?.benchmarkRates) {
    const rates = template.benchmarkRates;
    let rate = rates.typical;
    if (finishLevel === "budget") rate = rates.low;
    if (finishLevel === "premium") rate = rates.high;
    return {
      rate,
      source: "template_benchmark",
      confidenceBonus: 0,
      scopeTypeKey,
    };
  }

  const regionalRate = placeholderRateForScope(
    scopeTemplateKey,
    workAreaTypeKey,
    unit
  );
  if (regionalRate > 0) {
    return {
      rate: regionalRate,
      source: "regional_fallback",
      confidenceBonus: -5,
      scopeTypeKey,
    };
  }

  return {
    rate: placeholderRateForScope(scopeTemplateKey, workAreaTypeKey, unit),
    source: "placeholder",
    confidenceBonus: -10,
    scopeTypeKey,
  };
}

export function rateSourceLabel(
  source: RateSource,
  options?: {
    scopeLabel?: string;
    usesDefaultRateOnly?: boolean;
    roughAllowance?: boolean;
  }
): string {
  if (options?.roughAllowance) {
    return "Rough allowance";
  }
  switch (source) {
    case "scope_rate":
      if (options?.usesDefaultRateOnly) {
        return options.scopeLabel
          ? `Your saved default ${options.scopeLabel} rate`
          : "Your saved default rate";
      }
      return options?.scopeLabel
        ? `Your saved ${options.scopeLabel} rate`
        : "Your saved rate";
    case "package_rate":
      return "Your package rate";
    case "org_rate":
      return "Your trade/material rates";
    case "template_benchmark":
      return "Quotr benchmark";
    case "regional_fallback":
      return "Regional benchmark";
    case "placeholder":
      return "Rough placeholder";
  }
}

export function primaryRateSource(sources: RateSource[]): RateSource {
  const priority: RateSource[] = [
    "scope_rate",
    "package_rate",
    "org_rate",
    "template_benchmark",
    "regional_fallback",
    "placeholder",
  ];
  for (const p of priority) {
    if (sources.includes(p)) return p;
  }
  return "placeholder";
}

export function isBenchmarkRateSource(source: RateSource): boolean {
  return (
    source === "template_benchmark" ||
    source === "regional_fallback" ||
    source === "placeholder"
  );
}
