import type { QualityLevel } from "@/lib/constants/quality-level";
import type { QuickEstimateWorkAreaInput } from "@/lib/cost-engine/quick-estimate-input";
import { buildScopeMissingLabels } from "@/lib/scopes/missing-facts";

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
  const missing = buildScopeMissingLabels(
    input.workAreas.map((a) => ({
      name: a.name,
      workAreaTypeKey: a.workAreaTypeKey,
      answers: a.answers,
    }))
  );

  if (input.effectiveQualityLevel === "unknown") {
    const hasBathroom = input.workAreas.some(
      (a) => a.workAreaTypeKey === "Bathroom renovation"
    );
    if (hasBathroom && !missing.some((m) => m.toLowerCase().includes("finish"))) {
      missing.push("Finish level");
    }
  }

  return missing;
}
