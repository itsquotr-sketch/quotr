import type { RateRange } from "@/lib/cost-engine/types";
import type { PackageRate, SubcontractorRate } from "@/types/database";

/** Build a RateRange from nullable DB columns, falling back to legacy single value. */
export function rateRangeFromColumns(
  low: number | null | undefined,
  typical: number | null | undefined,
  high: number | null | undefined,
  legacy: number | null | undefined
): RateRange {
  const base = Number(typical ?? legacy ?? 0);
  return {
    low: Number(low ?? base),
    typical: base,
    high: Number(high ?? base),
  };
}

export function subcontractorCostRange(rate: SubcontractorRate): RateRange {
  return rateRangeFromColumns(
    rate.low_cost_rate,
    rate.typical_cost_rate,
    rate.high_cost_rate,
    rate.cost_rate
  );
}

export function subcontractorChargeRange(rate: SubcontractorRate): RateRange {
  return rateRangeFromColumns(
    rate.low_charge_rate,
    rate.typical_charge_rate,
    rate.high_charge_rate,
    rate.charge_rate
  );
}

export function packageCostRange(rate: PackageRate): RateRange {
  return rateRangeFromColumns(
    rate.low_base_cost,
    rate.typical_base_cost,
    rate.high_base_cost,
    rate.base_cost
  );
}

export function packageSellRange(rate: PackageRate): RateRange {
  return rateRangeFromColumns(
    rate.low_base_sell,
    rate.typical_base_sell,
    rate.high_base_sell,
    rate.base_sell
  );
}

export function formatRateRange(range: RateRange, formatter: (n: number) => string): string {
  return `${formatter(range.low)} / ${formatter(range.typical)} / ${formatter(range.high)}`;
}
