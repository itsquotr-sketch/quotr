import { formatCurrency } from "@/lib/quick-estimate-calculate";
import {
  formatRateRange,
  packageCostRange,
  packageSellRange,
  subcontractorChargeRange,
  subcontractorCostRange,
} from "@/lib/rate-ranges";
import { RATE_UNITS } from "@/lib/constants/rates";

export function formatRateAmount(amount: number | string | null): string {
  if (amount == null) return "—";
  return formatCurrency(Number(amount));
}

export function formatSubcontractorCostRange(
  rate: Parameters<typeof subcontractorCostRange>[0]
): string {
  return formatRateRange(subcontractorCostRange(rate), formatRateAmount);
}

export function formatSubcontractorChargeRange(
  rate: Parameters<typeof subcontractorChargeRange>[0]
): string {
  return formatRateRange(subcontractorChargeRange(rate), formatRateAmount);
}

export function formatPackageCostRange(
  rate: Parameters<typeof packageCostRange>[0]
): string {
  return formatRateRange(packageCostRange(rate), formatRateAmount);
}

export function formatPackageSellRange(
  rate: Parameters<typeof packageSellRange>[0]
): string {
  return formatRateRange(packageSellRange(rate), formatRateAmount);
}

export function unitLabel(unit: string): string {
  return RATE_UNITS.find((u) => u.value === unit)?.label ?? unit;
}

export function matchesSearch(query: string, ...fields: (string | null | undefined)[]): boolean {
  if (!query.trim()) return true;
  const q = query.toLowerCase();
  return fields.some((f) => f?.toLowerCase().includes(q));
}
