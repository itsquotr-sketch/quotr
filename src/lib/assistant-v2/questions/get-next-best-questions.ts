import { z } from "zod";
import type { DiscoveryResult } from "@/lib/ai/discovery/types";
import type {
  EvaluateWorkAreaInput,
  ProjectCompletenessResult,
} from "@/lib/assistant-v2/completeness/evaluate-project-completeness";
import {
  getNextPricingQuestions,
  type PricingQuestion,
  type ScopeGroupInput,
} from "@/lib/assistant-v2/get-next-pricing-question";
import type { ScopeQuestionWithAnswers } from "@/lib/project-assistant-data";
import type { EstimateTrace } from "@/lib/cost-engine/estimate-trace";
import {
  getMissingOptionalHighImpact,
  getMissingRequiredFacts,
} from "@/lib/scopes/missing-facts";

export const nextBestQuestionSchema = z.object({
  scopeId: z.string(),
  scopeName: z.string(),
  factKey: z.string(),
  questionText: z.string(),
  priority: z.number(),
  required: z.boolean(),
});

export type NextBestQuestion = z.infer<typeof nextBestQuestionSchema>;

const FACT_PRIORITY: Record<string, number> = {
  area: 100,
  length: 100,
  height: 95,
  quantity: 100,
  material: 70,
  access: 50,
  finish: 30,
};

function priorityForFactKey(factKey: string, required: boolean): number {
  const key = factKey.toLowerCase();
  let score = required ? 80 : 40;

  for (const [fragment, value] of Object.entries(FACT_PRIORITY)) {
    if (key.includes(fragment)) {
      score = Math.max(score, value);
    }
  }

  if (key.includes("_m2") || key.includes("_m")) {
    score = Math.max(score, 100);
  }

  return score;
}

function contextualQuestion(scopeName: string, questionText: string): string {
  const lower = questionText.toLowerCase();
  if (lower.startsWith("for ") || lower.includes(scopeName.toLowerCase())) {
    return questionText;
  }
  if (questionText.endsWith("?")) {
    return `For ${scopeName}, ${questionText.charAt(0).toLowerCase()}${questionText.slice(1)}`;
  }
  return `For ${scopeName}, ${questionText}`;
}

function questionsFromWorkAreas(
  workAreas: EvaluateWorkAreaInput[],
  limit: number
): NextBestQuestion[] {
  const questions: NextBestQuestion[] = [];

  const included = workAreas.filter((a) => a.included);
  const sortedAreas = [...included].sort((a, b) => {
    const aMissing =
      getMissingRequiredFacts(a.workAreaTypeKey, a.answers).length +
      getMissingOptionalHighImpact(a.workAreaTypeKey, a.answers).length;
    const bMissing =
      getMissingRequiredFacts(b.workAreaTypeKey, b.answers).length +
      getMissingOptionalHighImpact(b.workAreaTypeKey, b.answers).length;
    return bMissing - aMissing;
  });

  for (const area of sortedAreas) {
    const requiredFacts = getMissingRequiredFacts(
      area.workAreaTypeKey,
      area.answers
    );
    const optionalFacts = getMissingOptionalHighImpact(
      area.workAreaTypeKey,
      area.answers
    );

    for (const fact of [...requiredFacts, ...optionalFacts]) {
      questions.push({
        scopeId: area.scopeId,
        scopeName: area.scopeName,
        factKey: fact.key,
        questionText: contextualQuestion(
          area.scopeName,
          fact.questionText || fact.label
        ),
        priority: priorityForFactKey(fact.key, fact.required),
        required: fact.required,
      });
    }
  }

  return questions
    .sort((a, b) => b.priority - a.priority)
    .slice(0, limit);
}

export type GetNextBestQuestionsInput = {
  completeness: ProjectCompletenessResult;
  workAreas: EvaluateWorkAreaInput[];
  scopeGroups?: ScopeGroupInput[];
  discovery?: DiscoveryResult | null;
  scopeQuestions?: ScopeQuestionWithAnswers[];
  answeredQuestionKeys?: Set<string>;
  estimateTrace?: EstimateTrace | null;
  limit?: number;
};

export function getNextBestQuestions(
  input: GetNextBestQuestionsInput
): NextBestQuestion[] {
  const limit = input.limit ?? 3;

  if (input.scopeGroups && input.scopeQuestions) {
    const pricingQuestions = getNextPricingQuestions(
      {
        scopeGroups: input.scopeGroups,
        discovery: input.discovery ?? null,
        scopeQuestions: input.scopeQuestions,
        answeredQuestionKeys: input.answeredQuestionKeys,
      },
      limit
    );

    if (pricingQuestions.length > 0) {
      return pricingQuestions.map((q) => toNextBestQuestion(q));
    }
  }

  const fromWorkAreas = questionsFromWorkAreas(input.workAreas, limit);
  if (fromWorkAreas.length > 0) {
    return fromWorkAreas.map((q) => nextBestQuestionSchema.parse(q));
  }

  const traceFacts = input.estimateTrace?.missingCriticalFacts ?? [];
  return traceFacts.slice(0, limit).map((label, index) => ({
    scopeId: "unknown",
    scopeName: "Project",
    factKey: `trace_${index}`,
    questionText: label,
    priority: 50 - index,
    required: true,
  }));
}

function toNextBestQuestion(q: PricingQuestion): NextBestQuestion {
  const contextual =
    q.scopeName &&
    !q.questionText.toLowerCase().includes(q.scopeName.toLowerCase())
      ? contextualQuestion(q.scopeName, q.questionText)
      : q.questionText;

  return nextBestQuestionSchema.parse({
    scopeId: q.scopeId,
    scopeName: q.scopeName,
    factKey: q.questionKey,
    questionText: contextual,
    priority: priorityForFactKey(q.questionKey, q.required),
    required: q.required,
  });
}

export function formatNextBestQuestionsResponse(
  questions: NextBestQuestion[]
): string {
  if (questions.length === 0) {
    return "This estimate looks reasonably complete for a quick draft.";
  }

  return questions.map((q, i) => `${i + 1}. ${q.questionText}`).join("\n");
}
