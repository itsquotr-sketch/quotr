import type { QualityLevel } from "@/lib/constants/quality-level";
import type { DiscoveryResult } from "@/lib/ai/discovery/types";
import {
  getUnknownSiteConditions,
  type ConstraintQuestion,
} from "@/lib/assistant-v2/get-next-constraint-question";
import {
  getNextPricingQuestions,
  getNextPricingQuestion,
  SCOPE_BATCH_MAX_TOTAL,
  type PricingQuestion,
  type ScopeGroupInput,
} from "@/lib/assistant-v2/get-next-pricing-question";
import type { ScopeQuestionWithAnswers } from "@/lib/project-assistant-data";
import { normalizeQuestionKey } from "@/lib/question-keys";

export type QualityTurn = {
  kind: "quality";
  prompt: string;
  currentLevel: QualityLevel;
  options: { value: QualityLevel; label: string }[];
};

export type AssistantTurn =
  | {
      kind: "scope_batch";
      questions: PricingQuestion[];
      intro: string;
      hasRequired: boolean;
    }
  | { kind: "constraint_batch"; constraints: ConstraintQuestion[] }
  | { kind: "quality"; turn: QualityTurn };

const QUALITY_OPTIONS: { value: QualityLevel; label: string }[] = [
  { value: "budget", label: "Budget" },
  { value: "standard", label: "Standard" },
  { value: "premium", label: "Premium" },
  { value: "unknown", label: "Not Sure" },
];

function scopeBatchIntro(questions: PricingQuestion[]): string {
  const hasRequired = questions.some((q) => q.required);
  if (hasRequired && questions.length === 1) {
    return contextualScopePrompt(questions[0]!);
  }
  if (hasRequired) {
    return "To tighten this estimate I need:";
  }
  return "I can price this now — these would sharpen the range:";
}

function contextualScopePrompt(q: PricingQuestion): string {
  const key = q.questionKey.toLowerCase();
  if (key.includes("level")) return "Is the deck ground-level or elevated?";
  if (key.includes("balustrade")) return "Is a balustrade required?";
  if (key.includes("stair")) return "Are stairs required?";
  if (key.includes("material")) return "What material should I assume?";
  if (key.includes("area")) return "What's the approximate area?";
  return q.questionText;
}

export function getNextAssistantTurn(input: {
  scopeGroups: ScopeGroupInput[];
  workAreaTypeKeys: string[];
  discovery: DiscoveryResult | null;
  scopeQuestions: ScopeQuestionWithAnswers[];
  selectedConstraintSlugs: string[];
  declinedConstraintSlugs: Set<string>;
  qualityLevel: QualityLevel;
  answeredQuestionKeys: Set<string>;
}): AssistantTurn | null {
  const pricingInput = {
    scopeGroups: input.scopeGroups,
    discovery: input.discovery,
    scopeQuestions: input.scopeQuestions,
    answeredQuestionKeys: input.answeredQuestionKeys,
  };

  const requiredQuestions = getNextPricingQuestions(
    pricingInput,
    SCOPE_BATCH_MAX_TOTAL
  ).filter((q) => q.required);

  if (requiredQuestions.length > 0) {
    return {
      kind: "scope_batch",
      questions: requiredQuestions,
      intro: scopeBatchIntro(requiredQuestions),
      hasRequired: true,
    };
  }

  if (input.qualityLevel === "unknown" && input.scopeGroups.length > 0) {
    return {
      kind: "quality",
      turn: {
        kind: "quality",
        prompt: "What finish level should I assume?",
        currentLevel: input.qualityLevel,
        options: QUALITY_OPTIONS,
      },
    };
  }

  const optionalQuestions = getNextPricingQuestions(
    pricingInput,
    SCOPE_BATCH_MAX_TOTAL
  ).filter((q) => !q.required);

  if (optionalQuestions.length > 0) {
    return {
      kind: "scope_batch",
      questions: optionalQuestions,
      intro: scopeBatchIntro(optionalQuestions),
      hasRequired: false,
    };
  }

  const pendingRequired = getNextPricingQuestion(pricingInput);
  if (pendingRequired?.required) {
    return {
      kind: "scope_batch",
      questions: [pendingRequired],
      intro: scopeBatchIntro([pendingRequired]),
      hasRequired: true,
    };
  }

  const discoverySlugs =
    input.discovery?.constraints?.map((c) => c.slug) ?? [];

  const pendingConstraints = getUnknownSiteConditions({
    workAreaTypeKeys: input.workAreaTypeKeys,
    selectedConstraintSlugs: input.selectedConstraintSlugs,
    discoveryConstraintSlugs: discoverySlugs,
    answeredQuestionKeys: input.answeredQuestionKeys,
    declinedConstraintSlugs: [...input.declinedConstraintSlugs],
  });

  if (pendingConstraints.length > 0) {
    const stillHasRequired =
      getNextPricingQuestions(pricingInput, 1).some((q) => q.required) ||
      Boolean(getNextPricingQuestion(pricingInput)?.required);

    if (stillHasRequired) {
      const requiredBatch = getNextPricingQuestions(
        pricingInput,
        SCOPE_BATCH_MAX_TOTAL
      ).filter((q) => q.required);
      if (requiredBatch.length > 0) {
        return {
          kind: "scope_batch",
          questions: requiredBatch,
          intro: scopeBatchIntro(requiredBatch),
          hasRequired: true,
        };
      }
      const fallback = getNextPricingQuestion(pricingInput);
      if (fallback?.required) {
        return {
          kind: "scope_batch",
          questions: [fallback],
          intro: scopeBatchIntro([fallback]),
          hasRequired: true,
        };
      }
    }

    return { kind: "constraint_batch", constraints: pendingConstraints };
  }

  return null;
}

export function collectAnsweredQuestionKeys(
  scopeQuestions: ScopeQuestionWithAnswers[]
): Set<string> {
  const keys = new Set<string>();
  for (const question of scopeQuestions) {
    if (!question.scope_answers?.[0]) continue;
    const key = normalizeQuestionKey(question.question_key);
    if (key) keys.add(key);
    if (question.question_key) keys.add(question.question_key);
  }
  return keys;
}
