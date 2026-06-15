import type { QualityLevel } from "@/lib/constants/quality-level";
import { getScopeByWorkAreaType } from "@/lib/scopes";
import {
  getCanonicalScopeTemplateByWorkAreaType,
  isPricingSupportedWorkAreaType,
} from "@/lib/scopes/templates";
import {
  buildScopeMissingFactsMessage,
  getMissingRequiredFactsForWorkArea,
} from "@/lib/assistant-v2/stages/required-fact-gating";

export type ScopePricingState =
  | "supported_priced"
  | "supported_unpriced"
  | "recognised_unsupported"
  | "custom";

export type ScopePricingStateResult = {
  state: ScopePricingState;
  /** Contractor-facing label — no internal jargon. */
  userLabel: string;
  /** Short explanation for chat / estimate panels. */
  message: string;
  canIncludeInEstimate: boolean;
  usesRoughAllowance: boolean;
};

function isCustomWorkArea(workAreaTypeKey: string, scopeName?: string): boolean {
  const lower = workAreaTypeKey.toLowerCase();
  if (lower.includes("custom")) return true;
  if (scopeName?.toLowerCase().includes("custom")) return true;
  return !getScopeByWorkAreaType(workAreaTypeKey) &&
    !getCanonicalScopeTemplateByWorkAreaType(workAreaTypeKey);
}

export function resolveScopePricingState(input: {
  workAreaTypeKey: string;
  scopeName?: string;
  answers?: Record<string, string>;
  qualityLevel?: QualityLevel | string | null;
  roughAllowance?: boolean;
}): ScopePricingStateResult {
  const { workAreaTypeKey, scopeName } = input;
  const answers = input.answers ?? {};
  const label =
    getCanonicalScopeTemplateByWorkAreaType(workAreaTypeKey)?.label ??
    getScopeByWorkAreaType(workAreaTypeKey)?.name ??
    scopeName ??
    workAreaTypeKey;

  if (isCustomWorkArea(workAreaTypeKey, scopeName)) {
    return {
      state: "custom",
      userLabel: "Needs pricing",
      message:
        "Custom scope added. I can track it, but it is not included in the quick estimate until you add a rate.",
      canIncludeInEstimate: false,
      usesRoughAllowance: false,
    };
  }

  const canonical = getCanonicalScopeTemplateByWorkAreaType(workAreaTypeKey);
  const legacy = getScopeByWorkAreaType(workAreaTypeKey);
  const pricingSupported =
    isPricingSupportedWorkAreaType(workAreaTypeKey) || Boolean(legacy);

  if (pricingSupported) {
    const rough =
      input.roughAllowance ??
      (workAreaTypeKey === "Kitchen renovation" ||
        canonical?.pricing.pricingMode === "benchmark_rate");

    if (rough && workAreaTypeKey === "Kitchen renovation") {
      return {
        state: "supported_priced",
        userLabel: "Rough allowance",
        message:
          "Kitchen renovation detected. I can collect scope details and include a rough kitchen allowance — confirm rates before relying on this.",
        canIncludeInEstimate: true,
        usesRoughAllowance: true,
      };
    }

    const missingRequired = getMissingRequiredFactsForWorkArea(
      workAreaTypeKey,
      answers,
      { projectQualityLevel: input.qualityLevel }
    );
    if (missingRequired.length > 0) {
      const missingMessage =
        buildScopeMissingFactsMessage(label, workAreaTypeKey, answers) ??
        `${label} needs a few details before I can include it.`;
      return {
        state: "supported_unpriced",
        userLabel: "Needs details",
        message: missingMessage,
        canIncludeInEstimate: false,
        usesRoughAllowance: false,
      };
    }

    return {
      state: "supported_priced",
      userLabel: "Ready to estimate",
      message: `${label} has enough support for a quick estimate.`,
      canIncludeInEstimate: true,
      usesRoughAllowance: false,
    };
  }

  if (canonical && !canonical.pricing.supported) {
    return {
      state: "supported_unpriced",
      userLabel: "Needs pricing",
      message: `${canonical.label} detected. I can collect scope details, but quick pricing support is limited until rates or templates are added.`,
      canIncludeInEstimate: false,
      usesRoughAllowance: false,
    };
  }

  if (canonical) {
    return {
      state: "recognised_unsupported",
      userLabel: "Not included yet",
      message: `${canonical.label} is recognised but not included in the quick estimate yet.`,
      canIncludeInEstimate: false,
      usesRoughAllowance: false,
    };
  }

  return {
    state: "recognised_unsupported",
    userLabel: "Not included yet",
    message: "This scope is not included in the quick estimate yet.",
    canIncludeInEstimate: false,
    usesRoughAllowance: false,
  };
}

export function buildMultiScopePricingGuidance(input: {
  workAreas: { scopeName: string; workAreaTypeKey: string }[];
}): { message: string; options: { id: string; label: string }[] } | null {
  const hasBathroom = input.workAreas.some(
    (a) => a.workAreaTypeKey === "Bathroom renovation"
  );
  const kitchen = input.workAreas.find(
    (a) => a.workAreaTypeKey === "Kitchen renovation"
  );

  if (!hasBathroom || !kitchen) return null;

  const kitchenState = resolveScopePricingState({
    workAreaTypeKey: kitchen.workAreaTypeKey,
    scopeName: kitchen.scopeName,
  });

  if (!kitchenState.usesRoughAllowance) return null;

  return {
    message: [
      "I found Bathroom renovation and Kitchen renovation.",
      "",
      "Bathroom has enough information for a rough estimate.",
      "",
      "Kitchen pricing is less certain. I can include a rough kitchen allowance, or exclude it until you add rates.",
    ].join("\n"),
    options: [
      { id: "include_kitchen_allowance", label: "Include rough kitchen allowance" },
      { id: "exclude_kitchen", label: "Exclude kitchen for now" },
      { id: "add_kitchen_rate", label: "Add kitchen rate" },
    ],
  };
}

export function buildPartialEstimateFencePrompt(scopeName: string): {
  message: string;
  options: { id: string; label: string }[];
} {
  return {
    message: `Partial estimate — ${scopeName} is not included yet because height/type is missing.\n\nDo you want to answer the fence details now?`,
    options: [
      { id: "answer_fence_details", label: "Answer fence details" },
      { id: "exclude_fence", label: "Exclude fence for now" },
      { id: "rough_fence_allowance", label: "Use rough fence allowance" },
    ],
  };
}
