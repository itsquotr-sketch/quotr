import type { QualityLevel } from "@/lib/constants/quality-level";
import { getAnswerValue } from "@/lib/question-keys";
import { calculateBathroomComponents } from "@/lib/cost-engine/estimate-components/calculators/bathroom";
import { calculateDeckComponents } from "@/lib/cost-engine/estimate-components/calculators/deck";
import { calculateRetainingWallComponents } from "@/lib/cost-engine/estimate-components/calculators/retaining-wall";
import type {
  EstimateComponent,
  ScopeComponentCalcInput,
  ScopeComponentCalcResult,
} from "@/lib/cost-engine/estimate-components/types";
import { getCanonicalScopeTemplateByWorkAreaType } from "@/lib/scopes/templates";

function resolveFinishLevel(
  answers: Record<string, string>,
  effectiveQualityLevel: QualityLevel,
  scopeFinishKey: string
): "budget" | "standard" | "premium" | "unknown" {
  if (effectiveQualityLevel !== "unknown") return effectiveQualityLevel;
  const scopeFinish = getAnswerValue(answers, scopeFinishKey) ?? "standard";
  if (scopeFinish === "budget" || scopeFinish === "premium") return scopeFinish;
  if (scopeFinish === "standard") return "standard";
  return "unknown";
}

export function calculateScopeFromComponents(
  input: ScopeComponentCalcInput
): ScopeComponentCalcResult | null {
  const template = getCanonicalScopeTemplateByWorkAreaType(input.workAreaTypeKey);
  if (!template?.pricing.supported) return null;

  const calculationType = template.pricing.calculationType;
  if (calculationType === "deck_area") {
    return calculateDeckComponents(input);
  }
  if (calculationType === "floor_area") {
    return calculateBathroomComponents(input);
  }
  if (calculationType === "wall_area") {
    return calculateRetainingWallComponents(input);
  }
  return null;
}

/** Scale component costs so they sum to the authoritative scope total. */
export function reconcileComponentsToTotal(
  components: EstimateComponent[],
  targetTotal: number
): EstimateComponent[] {
  if (components.length === 0 || targetTotal <= 0) return components;

  const componentSum = components.reduce((sum, c) => sum + c.estimated_cost, 0);
  if (componentSum <= 0) return components;

  const scale = targetTotal / componentSum;
  if (Math.abs(scale - 1) < 0.02) return components;

  return components.map((component) => ({
    ...component,
    estimated_cost: Math.round(component.estimated_cost * scale),
  }));
}

export function buildScopeComponentCalcInput(
  workAreaTypeKey: string,
  answers: Record<string, string>,
  orgRates: ScopeComponentCalcInput["orgRates"],
  effectiveQualityLevel: QualityLevel
): ScopeComponentCalcInput {
  const template = getCanonicalScopeTemplateByWorkAreaType(workAreaTypeKey);
  const scopeTypeKey = template?.scopeTypeKey ?? "generic";
  const finishKey = scopeTypeKey.includes("bathroom")
    ? "bathroom.finish_level"
    : scopeTypeKey === "deck"
      ? "deck.finish_level"
      : "finish_level";

  return {
    scopeTypeKey,
    workAreaTypeKey,
    answers,
    orgRates,
    effectiveQualityLevel,
    finishLevel: resolveFinishLevel(answers, effectiveQualityLevel, finishKey),
  };
}
