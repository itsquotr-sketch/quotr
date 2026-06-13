import { describe, expect, it } from "vitest";
import {
  MAX_REFINEMENT_QUESTIONS,
  suggestionsToPricingQuestions,
} from "@/lib/assistant-v2/refinement/suggestions-to-pricing-questions";
import type { ScopeRefinementSuggestion } from "@/lib/assistant-v2/refinement/get-scope-refinement-suggestions";

describe("suggestionsToPricingQuestions", () => {
  const scopeId = "22222222-2222-2222-2222-222222222222";
  const scopeGroups = [
    {
      scopeId,
      scopeName: "Retaining wall",
      scopeTypeName: "Retaining Wall",
      questions: [],
    },
  ];

  function makeScopeQuestion(key: string, id: string) {
    return {
      id,
      project_scope_id: scopeId,
      question_key: key,
      question: "Question?",
      question_type: "number",
      unit: "m",
      options: null,
      scope_answers: [],
    };
  }

  it("maps refinement suggestions to scope questions", () => {    const suggestions: ScopeRefinementSuggestion[] = [
      {
        factKey: "retaining_wall.length_m",
        label: "Retaining wall length",
        question: "For Retaining wall, approximate wall length?",
        reason: "length drives wall area and cost",
        impact: "high",
        affectsEstimate: true,
        scopeId: "22222222-2222-2222-2222-222222222222",
        scopeName: "Retaining wall",
        required: true,
      },
    ];

    const scopeQuestions = [
      makeScopeQuestion(
        "retaining_wall.length_m",
        "qqqqqqqq-qqqq-qqqq-qqqq-qqqqqqqqqqqq"
      ),
    ] as Parameters<typeof suggestionsToPricingQuestions>[2];
    const questions = suggestionsToPricingQuestions(
      suggestions,
      scopeGroups,
      scopeQuestions
    );

    expect(questions).toHaveLength(1);
    expect(questions[0]?.questionKey).toBe("retaining_wall.length_m");
    expect(questions[0]?.inputType).toBe("number");
  });

  it("returns up to 5 answerable questions when limit is 5", () => {
    const suggestions: ScopeRefinementSuggestion[] = Array.from(
      { length: 5 },
      (_, index) => ({
        factKey: `retaining_wall.fact_${index}`,
        label: `Fact ${index}`,
        question: `Question ${index}?`,
        reason: "test",
        impact: "high" as const,
        affectsEstimate: true,
        scopeId,
        scopeName: "Retaining wall",
        required: true,
      })
    );

    const scopeQuestions = suggestions.map((s, index) =>
      makeScopeQuestion(s.factKey, `00000000-0000-0000-0000-00000000000${index}`)
    ) as Parameters<typeof suggestionsToPricingQuestions>[2];

    const questions = suggestionsToPricingQuestions(
      suggestions,
      scopeGroups,
      scopeQuestions,
      MAX_REFINEMENT_QUESTIONS
    );

    expect(questions).toHaveLength(5);
  });
});