import { getScopeRateDefinitionByKey } from "@/lib/constants/scope-rates";

export type WorkPackagePricingStatus =
  | "included"
  | "needs_pricing"
  | "scope_note_only";

export type WorkPackagePricingResult = {
  status: WorkPackagePricingStatus;
  includeInQuickEstimate: boolean;
  message: string | null;
};

/** Packages with template or rate support today */
const PACKAGES_WITH_PRICING_LOGIC = new Set([
  "demolition",
  "painting",
  "flooring",
]);

/**
 * Determine whether a work package should be included in the quick estimate.
 * Never invents prices for unsupported packages.
 */
export function resolveWorkPackagePricing(
  packageKey: string,
  options: {
    hasOrgRate?: boolean;
    hasQuantity?: boolean;
    parentScopeIncludedInEstimate?: boolean;
  } = {}
): WorkPackagePricingResult {
  const hasPricingLogic = PACKAGES_WITH_PRICING_LOGIC.has(packageKey);
  const rateDef = getScopeRateDefinitionByKey(packageKey);

  if (hasPricingLogic && options.hasQuantity && (options.hasOrgRate || rateDef)) {
    return {
      status: "included",
      includeInQuickEstimate: true,
      message: null,
    };
  }

  if (options.hasOrgRate && options.hasQuantity) {
    return {
      status: "included",
      includeInQuickEstimate: true,
      message: null,
    };
  }

  if (hasPricingLogic && !options.hasQuantity) {
    return {
      status: "scope_note_only",
      includeInQuickEstimate: false,
      message:
        "I've added this as a scope item. Add rates or quantities to include it in the estimate.",
    };
  }

  return {
    status: "needs_pricing",
    includeInQuickEstimate: false,
    message: "Needs pricing before estimate can include this.",
  };
}

export function packageHasPricingLogic(packageKey: string): boolean {
  return (
    PACKAGES_WITH_PRICING_LOGIC.has(packageKey) ||
    Boolean(getScopeRateDefinitionByKey(packageKey))
  );
}
