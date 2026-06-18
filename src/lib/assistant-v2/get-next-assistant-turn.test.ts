import { describe, expect, it } from "vitest";
import { getNextAssistantTurn } from "@/lib/assistant-v2/get-next-assistant-turn";
import type { ScopeGroupInput } from "@/lib/assistant-v2/get-next-pricing-question";
import type { ScopeQuestionWithAnswers } from "@/lib/project-assistant-data";

function emptyTurnInput(overrides: {
  scopeGroups?: ScopeGroupInput[];
  workAreaTypeKeys?: string[];
  qualityLevel?: "budget" | "standard" | "premium" | "unknown";
  answeredQuestionKeys?: Set<string>;
} = {}) {
  return {
    scopeGroups: overrides.scopeGroups ?? [],
    workAreaTypeKeys: overrides.workAreaTypeKeys ?? ["Deck"],
    discovery: {
      workAreas: [],
      facts: [],
      questions: [],
      constraints: [{ slug: "deck-restricted-access", label: "Restricted access", source: "notes" as const, confidence: 0.8 }],
      trades: [],
    },
    scopeQuestions: [] as ScopeQuestionWithAnswers[],
    selectedConstraintSlugs: [],
    declinedConstraintSlugs: new Set<string>(),
    qualityLevel: overrides.qualityLevel ?? "standard",
    answeredQuestionKeys: overrides.answeredQuestionKeys ?? new Set<string>(),
  };
}

function deckScopeGroup(
  questions: ScopeQuestionWithAnswers[]
): ScopeGroupInput {
  return {
    scopeId: "scope-deck",
    scopeName: "Deck",
    scopeTypeName: "Deck",
    questions,
  };
}

function makeQuestion(key: string, answered = false): ScopeQuestionWithAnswers {
  return {
    id: `q-${key}`,
    project_scope_id: "scope-deck",
    organisation_id: null,
    question: `Question for ${key}`,
    question_key: key,
    question_type: "select",
    options: [{ value: "timber", label: "Timber" }],
    unit: null,
    sort_order: 0,
    created_at: new Date().toISOString(),
    scope_answers: answered
      ? [
          {
            id: "a1",
            answer: "timber",
            source: "user",
            updated_at: new Date().toISOString(),
          },
        ]
      : [],
  } as ScopeQuestionWithAnswers;
}

describe("getNextAssistantTurn ordering", () => {
  it("returns required work-area questions before constraints", () => {
    const turn = getNextAssistantTurn(
      emptyTurnInput({
        scopeGroups: [
          deckScopeGroup([
            makeQuestion("deck.material_type", false),
            makeQuestion("deck.area_m2", true),
          ]),
        ],
      })
    );

    expect(turn?.kind).toBe("scope_batch");
    if (turn?.kind === "scope_batch") {
      expect(turn.questions[0]?.questionKey).toBe("deck.material_type");
      expect(turn.hasRequired).toBe(true);
    }
  });

  it("returns optional high-impact questions before constraints when required are done", () => {
    const turn = getNextAssistantTurn(
      emptyTurnInput({
        scopeGroups: [
          deckScopeGroup([
            makeQuestion("deck.area_m2", true),
            makeQuestion("deck.material_type", true),
            makeQuestion("deck.level_type", true),
            makeQuestion("deck.finish_level", true),
            makeQuestion("deck.has_stairs", false),
          ]),
        ],
      })
    );

    expect(turn?.kind).toBe("scope_batch");
    if (turn?.kind === "scope_batch") {
      expect(turn.questions[0]?.questionKey).toBe("deck.has_stairs");
      expect(turn.hasRequired).toBe(false);
    }
  });

  it("returns constraints only after required and optional scope questions are handled", () => {
    const turn = getNextAssistantTurn(
      emptyTurnInput({
        scopeGroups: [
          deckScopeGroup([
            makeQuestion("deck.area_m2", true),
            makeQuestion("deck.material_type", true),
            makeQuestion("deck.level_type", true),
            makeQuestion("deck.finish_level", true),
          ]),
        ],
      })
    );

    expect(turn?.kind).toBe("constraint_batch");
  });

  it("returns quality before constraints when required facts are known", () => {
    const turn = getNextAssistantTurn(
      emptyTurnInput({
        qualityLevel: "unknown",
        scopeGroups: [
          deckScopeGroup([
            makeQuestion("deck.area_m2", true),
            makeQuestion("deck.material_type", true),
            makeQuestion("deck.level_type", true),
            makeQuestion("deck.finish_level", true),
          ]),
        ],
      })
    );

    expect(turn?.kind).toBe("quality");
  });

  it("does not return constraints while required work-area questions remain", () => {
    const turn = getNextAssistantTurn(
      emptyTurnInput({
        qualityLevel: "standard",
        scopeGroups: [
          deckScopeGroup([
            makeQuestion("deck.area_m2", true),
            makeQuestion("deck.material_type", true),
            makeQuestion("deck.level_type", false),
            makeQuestion("deck.finish_level", true),
          ]),
        ],
      })
    );

    expect(turn?.kind).toBe("scope_batch");
    if (turn?.kind === "scope_batch") {
      expect(turn.hasRequired).toBe(true);
      expect(turn.questions[0]?.questionKey).toBe("deck.level_type");
    }
  });
});
