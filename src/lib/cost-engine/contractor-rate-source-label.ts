import type { RateSource } from "@/lib/cost-engine/rates/get-base-rate-for-scope";

/** Contractor-facing rate source labels (no internal product names). */
export function contractorRateSourceLabel(
  source: RateSource,
  options?: { scopeLabel?: string; usesDefaultRateOnly?: boolean }
): string {
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
      return "Industry benchmark";
    case "regional_fallback":
      return "Regional benchmark";
    case "placeholder":
      return "Placeholder / rough estimate";
  }
}
