import type { QualityLevel } from "@/lib/constants/quality-level";
import type { QuickEstimateWorkAreaInput } from "@/lib/cost-engine/quick-estimate-input";
import {
  getMissingOptionalHighImpact,
  getMissingRequiredFacts,
} from "@/lib/scopes/missing-facts";

export type ScopeQuestionForMissing = {
  questionKey: string | null;
  questionText: string;
  workAreaTypeKey: string;
  workAreaName: string;
  answerRaw: string | null;
  answerSource: string | null;
  inputType: import("@/lib/scope-answer-state").AnswerInputType;
  options: { value: string; label: string }[];
};

/** Missing = required scope facts minus known facts. No duplicate question loops. */
export function buildMissingInformation(input: {
  workAreas: QuickEstimateWorkAreaInput[];
  effectiveQualityLevel: QualityLevel;
}): string[] {
  const missing: string[] = [];

  for (const area of input.workAreas) {
    for (const fact of getMissingRequiredFacts(
      area.workAreaTypeKey,
      area.answers,
      { projectQualityLevel: input.effectiveQualityLevel }
    )) {
      missing.push(`${area.name}: ${fact.questionText || fact.label}`);
    }

    for (const fact of getMissingOptionalHighImpact(
      area.workAreaTypeKey,
      area.answers
    )) {
      if (fact.key.includes("floor_area") || fact.key.includes("benchtop")) {
        missing.push(`${area.name}: ${fact.questionText || fact.label}`);
      }
    }
  }

  if (
    input.effectiveQualityLevel === "unknown" &&
    input.workAreas.some((a) => a.workAreaTypeKey === "Bathroom renovation") &&
    !missing.some((m) => m.toLowerCase().includes("finish"))
  ) {
    missing.push("Finish level");
  }

  return [...new Set(missing)];
}
