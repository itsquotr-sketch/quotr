import type { QualityLevel } from "@/lib/constants/quality-level";
import type { QuickEstimateWorkAreaInput } from "@/lib/cost-engine/quick-estimate-input";
import { getAnswerValue } from "@/lib/question-keys";
import {
  getScopeTemplateByWorkAreaType,
  isTemplateAffectsEstimateQuestion,
  isTemplateRequiredQuestion,
} from "@/lib/scope-templates";
import {
  isAnswered,
  isAnsweredSelect,
  type AnswerInputType,
} from "@/lib/scope-answer-state";

export type ScopeQuestionForMissing = {
  questionKey: string | null;
  questionText: string;
  workAreaTypeKey: string;
  workAreaName: string;
  answerRaw: string | null;
  answerSource: string | null;
  inputType: AnswerInputType;
  options: { value: string; label: string }[];
};

function parsePositiveNumber(value: string | undefined): number | null {
  if (value === undefined) return null;
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? num : null;
}

export function buildMissingInformation(input: {
  workAreas: QuickEstimateWorkAreaInput[];
  scopeQuestions: ScopeQuestionForMissing[];
  effectiveQualityLevel: QualityLevel;
}): string[] {
  const missing: string[] = [];
  const answeredKeys = new Set<string>();

  for (const q of input.scopeQuestions) {
    const key = q.questionKey;
    if (!key) continue;

    const checkContext = {
      inputType: q.inputType,
      requiresPositiveNumber: q.inputType === "number",
      allowedValues:
        q.inputType === "select" && q.options.length > 0
          ? q.options.map((o) => o.value)
          : undefined,
    };

    const answered =
      q.inputType === "select" && q.options.length > 0
        ? isAnsweredSelect(q.answerRaw, q.answerSource, q.options)
        : isAnswered(q.answerRaw, q.answerSource, checkContext);

    if (answered) {
      answeredKeys.add(key);
    }
  }

  for (const area of input.workAreas) {
    const template = getScopeTemplateByWorkAreaType(area.workAreaTypeKey);
    if (!template) continue;

    for (const factKey of template.estimateRules.requiredFactKeys) {
      if (answeredKeys.has(factKey)) continue;
      if (parsePositiveNumber(getAnswerValue(area.answers, factKey))) continue;

      const fact =
        template.requiredFacts.find((f) => f.key === factKey) ??
        template.questions.find((q) => q.questionKey === factKey);
      missing.push(`${area.name}: ${fact?.label ?? factKey} not provided`);
    }
  }

  for (const q of input.scopeQuestions) {
    const key = q.questionKey;
    if (!key) continue;

    const affects = isTemplateAffectsEstimateQuestion(
      q.workAreaTypeKey,
      key
    );
    const required = isTemplateRequiredQuestion(q.workAreaTypeKey, key);
    if (!affects && !required) continue;

    const answered =
      q.inputType === "select" && q.options.length > 0
        ? isAnsweredSelect(q.answerRaw, q.answerSource, q.options)
        : isAnswered(q.answerRaw, q.answerSource, {
            inputType: q.inputType,
            requiresPositiveNumber: q.inputType === "number",
          });

    if (answered) continue;

    const label = q.questionText.trim();
    if (!label) continue;
    missing.push(`${q.workAreaName}: ${label}`);
  }

  if (input.effectiveQualityLevel === "unknown") {
    const hasBathroom = input.workAreas.some(
      (a) => getScopeTemplateByWorkAreaType(a.workAreaTypeKey)?.key === "bathroom_renovation"
    );
    if (hasBathroom) {
      missing.push("Finish level not confirmed");
    }
  }

  return [...new Set(missing)];
}
