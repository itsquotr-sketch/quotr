import { PLACEHOLDER_BASE_RANGES } from "@/lib/constants/quick-estimate";
import { getScopeTemplateByWorkAreaType } from "@/lib/scope-templates";
import type {
  LabourRate,
  MaterialRate,
  PackageRate,
  SubcontractorRate,
} from "@/types/database";

export type RateSource =
  | "org_rate"
  | "package_rate"
  | "template_benchmark"
  | "regional_fallback"
  | "placeholder";

export type BaseRateResult = {
  rate: number;
  source: RateSource;
  confidenceBonus: number;
};

export type OrgRatesInput = {
  labourRates: LabourRate[];
  materialRates: MaterialRate[];
  subcontractorRates: SubcontractorRate[];
  packageRates: PackageRate[];
};

const SCOPE_KEYWORDS: Record<string, string[]> = {
  deck: ["deck", "decking", "timber", "composite"],
  "retaining-wall": ["retaining", "wall", "block"],
  "bathroom-renovation": ["bathroom", "tile", "vanity", "shower"],
};

function normaliseKey(key: string): string {
  return key.toLowerCase().replace(/\s+/g, "-");
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
  const keywords = SCOPE_KEYWORDS[normaliseKey(scopeKey)] ?? [scopeKey];
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
      r.unit.toLowerCase() === unit.toLowerCase() &&
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
      r.unit.toLowerCase() === unit.toLowerCase() &&
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
      r.unit.toLowerCase() === unit.toLowerCase() &&
      matchesScopeKeywords(r.trade, scopeTemplateKey)
  );
}

function placeholderRateForScope(scopeTemplateKey: string, unit: string): number {
  const key = normaliseKey(scopeTemplateKey);
  const placeholder =
    PLACEHOLDER_BASE_RANGES[key] ??
    PLACEHOLDER_BASE_RANGES[key.replace(/-/g, "_")] ??
    PLACEHOLDER_BASE_RANGES.other;
  const mid = (placeholder.low + placeholder.high) / 2;
  if (unit === "m²" || unit === "sqm") {
    return Math.round(mid / 20);
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
  const material = findOrgMaterialRate(
    orgRates.materialRates,
    scopeTemplateKey,
    unit
  );
  if (material) {
    return { rate: Number(material.cost_rate), source: "org_rate", confidenceBonus: 10 };
  }

  const labour = findOrgLabourRate(
    orgRates.labourRates,
    scopeTemplateKey,
    unit
  );
  if (labour) {
    return { rate: Number(labour.cost_rate), source: "org_rate", confidenceBonus: 10 };
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

  const pkg = findPackageRate(orgRates.packageRates, workAreaTypeKey);
  if (pkg) {
    const typical = Number(pkg.typical_base_cost ?? pkg.base_cost);
    return { rate: typical, source: "package_rate", confidenceBonus: 5 };
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
    };
  }

  const regionalRate = placeholderRateForScope(scopeTemplateKey, unit);
  if (regionalRate > 0) {
    return {
      rate: regionalRate,
      source: "regional_fallback",
      confidenceBonus: -5,
    };
  }

  return {
    rate: placeholderRateForScope(scopeTemplateKey, unit),
    source: "placeholder",
    confidenceBonus: -10,
  };
}

export function rateSourceLabel(source: RateSource): string {
  switch (source) {
    case "org_rate":
      return "Your saved rates";
    case "package_rate":
      return "Package rate";
    case "template_benchmark":
      return "Template benchmark";
    case "regional_fallback":
      return "Regional fallback";
    case "placeholder":
      return "Placeholder fallback";
  }
}

export function primaryRateSource(sources: RateSource[]): RateSource {
  const priority: RateSource[] = [
    "org_rate",
    "package_rate",
    "template_benchmark",
    "regional_fallback",
    "placeholder",
  ];
  for (const p of priority) {
    if (sources.includes(p)) return p;
  }
  return "placeholder";
}
