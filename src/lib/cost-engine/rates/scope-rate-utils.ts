import type { ScopeRate } from "@/types/database";

export function normaliseRateUnit(unit: string): string {
  return unit
    .toLowerCase()
    .replace(/²/g, "2")
    .replace(/\s+/g, "")
    .replace(/sqm/g, "m2")
    .replace(/wallface/g, "");
}

export function rateUnitsMatch(a: string, b: string): boolean {
  const left = normaliseRateUnit(a);
  const right = normaliseRateUnit(b);
  if (left === right) return true;
  return left.includes("m2") && right.includes("m2");
}

export function pickScopeRateValue(
  scopeRate: Pick<
    ScopeRate,
    "budget_rate" | "standard_rate" | "premium_rate" | "default_rate"
  >,
  finishLevel?: "budget" | "standard" | "premium" | "unknown"
): number | null {
  const budget =
    scopeRate.budget_rate != null ? Number(scopeRate.budget_rate) : null;
  const standard =
    scopeRate.standard_rate != null ? Number(scopeRate.standard_rate) : null;
  const premium =
    scopeRate.premium_rate != null ? Number(scopeRate.premium_rate) : null;
  const fallback =
    scopeRate.default_rate != null ? Number(scopeRate.default_rate) : null;

  if (finishLevel === "budget" && budget != null) return budget;
  if (finishLevel === "premium" && premium != null) return premium;
  if (finishLevel === "standard" && standard != null) return standard;

  if (standard != null) return standard;
  if (fallback != null) return fallback;
  if (budget != null) return budget;
  if (premium != null) return premium;
  return null;
}

export type ScopeRateAllocation = {
  labour: number;
  materials: number;
  subcontractors: number;
  allowances: number;
};

export function scopeRateAllocation(
  scopeRate: Pick<
    ScopeRate,
    | "labour_allocation_percent"
    | "materials_allocation_percent"
    | "subcontractor_allocation_percent"
    | "allowance_allocation_percent"
  >
): ScopeRateAllocation | null {
  const labour = scopeRate.labour_allocation_percent;
  const materials = scopeRate.materials_allocation_percent;
  const subcontractors = scopeRate.subcontractor_allocation_percent;
  const allowances = scopeRate.allowance_allocation_percent;

  if (
    labour == null &&
    materials == null &&
    subcontractors == null &&
    allowances == null
  ) {
    return null;
  }

  return {
    labour: labour != null ? Number(labour) / 100 : 0,
    materials: materials != null ? Number(materials) / 100 : 0,
    subcontractors:
      subcontractors != null ? Number(subcontractors) / 100 : 0,
    allowances: allowances != null ? Number(allowances) / 100 : 0,
  };
}
