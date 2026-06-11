import type { QualityLevel } from "@/lib/constants/quality-level";
import type { QuickEstimateConfidenceLevel } from "@/lib/constants/quick-estimate";
import { getScopeByWorkAreaType } from "@/lib/scopes/index";
import {
  factIsAnsweredFromMap,
  getMissingRequiredFacts,
} from "@/lib/scopes/missing-facts";
import type { EstimateQualityFactor } from "@/lib/cost-engine/estimate-quality";

export type ScopeConfidenceInput = {
  workAreaTypeKeys: string[];
  answersByWorkArea: { workAreaTypeKey: string; answers: Record<string, string> }[];
  qualityLevel: QualityLevel;
  usedPackageRates: boolean;
  constraintsAssessed: boolean;
  hasCustomScope: boolean;
};

export function resolveEstimateQualityLevel(
  input: ScopeConfidenceInput
): QuickEstimateConfidenceLevel {
  if (input.hasCustomScope) return "low";

  const supportedAreas = input.workAreaTypeKeys.filter((k) =>
    Boolean(getScopeByWorkAreaType(k))
  );
  if (supportedAreas.length === 0) return "low";

  const allRequiredAnswered = input.answersByWorkArea.every((area) => {
    const scope = getScopeByWorkAreaType(area.workAreaTypeKey);
    if (!scope) return false;
    return getMissingRequiredFacts(area.workAreaTypeKey, area.answers).length === 0;
  });

  if (!allRequiredAnswered) return "low";

  const finishKnown = input.qualityLevel !== "unknown";

  if (
    allRequiredAnswered &&
    finishKnown &&
    input.usedPackageRates &&
    input.constraintsAssessed
  ) {
    return "high";
  }

  if (allRequiredAnswered && finishKnown) {
    return "medium";
  }

  return "low";
}

export function buildScopeQualityFactors(
  input: ScopeConfidenceInput
): EstimateQualityFactor[] {
  const supportedAreas = input.workAreaTypeKeys.filter((k) =>
    Boolean(getScopeByWorkAreaType(k))
  );
  const templateMatched =
    supportedAreas.length > 0 && supportedAreas.length === input.workAreaTypeKeys.length;

  const measurementsComplete = input.answersByWorkArea.every((area) => {
    const scope = getScopeByWorkAreaType(area.workAreaTypeKey);
    if (!scope) return false;
    return scope.confidenceRules.measurementFactKeys.every((key) => {
      const fact =
        scope.requiredFacts.find((f) => f.key === key) ??
        scope.optionalFacts.find((f) => f.key === key);
      return fact ? factIsAnsweredFromMap(fact, area.answers) : false;
    });
  });

  return [
    {
      label: "Work area confirmed",
      met: input.workAreaTypeKeys.length > 0,
    },
    {
      label: "Key measurements provided",
      met: measurementsComplete,
    },
    {
      label: "Finish level selected",
      met: input.qualityLevel !== "unknown",
    },
    {
      label: "Scope template matched",
      met: templateMatched && !input.hasCustomScope,
    },
    {
      label: "Contractor package rates configured",
      met: input.usedPackageRates,
    },
    {
      label: "Access conditions assessed",
      met: input.constraintsAssessed,
    },
  ];
}
