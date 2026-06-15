import type { QualityLevel } from "@/lib/constants/quality-level";
import type { EvaluateWorkAreaInput } from "@/lib/assistant-v2/completeness/evaluate-project-completeness";
import {
  getMissingRequiredFactsForWorkArea,
} from "@/lib/assistant-v2/stages/required-fact-gating";
import {
  resolveScopePricingState,
  type ScopePricingStateResult,
} from "@/lib/scopes/pricing-state";

export type PricingReadinessIssue =
  | "needs_details"
  | "needs_rate"
  | "unsupported"
  | "custom"
  | "ready";

export type ScopePricingReadiness = {
  scopeId: string;
  scopeName: string;
  workAreaTypeKey: string;
  issue: PricingReadinessIssue;
  state: ScopePricingStateResult;
  message: string;
};

export function resolveScopePricingReadiness(input: {
  scopeId: string;
  scopeName: string;
  workAreaTypeKey: string;
  answers: Record<string, string>;
  qualityLevel?: QualityLevel | string | null;
}): ScopePricingReadiness {
  const pricingState = resolveScopePricingState({
    workAreaTypeKey: input.workAreaTypeKey,
    scopeName: input.scopeName,
    answers: input.answers,
    qualityLevel: input.qualityLevel,
  });

  if (pricingState.state === "custom") {
    return {
      scopeId: input.scopeId,
      scopeName: input.scopeName,
      workAreaTypeKey: input.workAreaTypeKey,
      issue: "custom",
      state: pricingState,
      message: pricingState.message,
    };
  }

  const missingRequired = getMissingRequiredFactsForWorkArea(
    input.workAreaTypeKey,
    input.answers,
    { projectQualityLevel: input.qualityLevel }
  );

  if (missingRequired.length > 0) {
    return {
      scopeId: input.scopeId,
      scopeName: input.scopeName,
      workAreaTypeKey: input.workAreaTypeKey,
      issue: "needs_details",
      state: pricingState,
      message:
        missingRequired.map((f) => f.label.toLowerCase()).join(", ") +
        " still needed",
    };
  }

  let issue: PricingReadinessIssue = "ready";
  if (pricingState.state === "recognised_unsupported") issue = "unsupported";
  else if (!pricingState.canIncludeInEstimate) issue = "needs_rate";
  else issue = "ready";

  return {
    scopeId: input.scopeId,
    scopeName: input.scopeName,
    workAreaTypeKey: input.workAreaTypeKey,
    issue,
    state: pricingState,
    message: pricingState.message,
  };
}

export function resolveWorkAreasPricingReadiness(
  workAreas: EvaluateWorkAreaInput[],
  qualityLevel?: QualityLevel | string | null
): ScopePricingReadiness[] {
  return workAreas
    .filter((a) => a.included !== false)
    .map((area) =>
      resolveScopePricingReadiness({
        scopeId: area.scopeId,
        scopeName: area.scopeName,
        workAreaTypeKey: area.workAreaTypeKey,
        answers: area.answers,
        qualityLevel,
      })
    );
}

export function scopesNeedingPricingConfirmation(
  readiness: ScopePricingReadiness[]
): ScopePricingReadiness[] {
  return readiness.filter(
    (r) =>
      r.issue === "custom" ||
      r.issue === "unsupported" ||
      r.issue === "needs_rate"
  );
}

export function buildPartialEstimateMessage(input: {
  included: string[];
  excluded: { scopeName: string; reason: string }[];
}): string {
  if (input.excluded.length === 0) {
    return `Partial estimate: ${input.included.join(" and ")} included.`;
  }

  const includedPart =
    input.included.length > 0
      ? `${input.included.join(" and ")} included.`
      : "No scopes priced yet.";

  const excludedPart = input.excluded
    .map((e) => `${e.scopeName} needs ${e.reason}`)
    .join(" ");

  return `Partial estimate: ${includedPart} ${excludedPart}`.trim();
}

export function buildPricingSourceAlert(
  scopes: ScopePricingReadiness[]
): { message: string; options: { id: string; label: string }[] } | null {
  const blocked = scopesNeedingPricingConfirmation(scopes);
  if (blocked.length === 0) return null;

  const primary = blocked[0]!;
  const label = primary.scopeName;

  if (primary.issue === "custom" || primary.issue === "unsupported") {
    return {
      message: `${label} is included, but I need a rate or enough details before it can be priced.`,
      options: [
        { id: "add_rate", label: "Add rate" },
        { id: "exclude_scope", label: `Exclude ${label.toLowerCase()} for now` },
        { id: "answer_details", label: `Answer ${label.toLowerCase()} details` },
      ],
    };
  }

  if (primary.workAreaTypeKey === "Fence") {
    return {
      message: `${label} is included, but I need a fence rate or enough fence details before it can be priced.`,
      options: [
        { id: "answer_fence_details", label: "Answer fence details" },
        { id: "rough_fence_allowance", label: "Use rough fence allowance" },
        { id: "exclude_fence", label: "Exclude fence for now" },
      ],
    };
  }

  return {
    message: primary.message,
    options: [
      { id: "add_rate", label: "Add rate" },
      { id: "use_benchmark", label: "Use rough benchmark" },
      { id: "exclude_scope", label: `Exclude ${label.toLowerCase()} for now` },
    ],
  };
}
