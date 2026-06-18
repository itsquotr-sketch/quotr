import { describe, expect, it } from "vitest";
import {
  getNextPricingQuestions,
  SCOPE_BATCH_MAX_PER_SCOPE,
  SCOPE_BATCH_MAX_TOTAL,
  type ScopeGroupInput,
} from "@/lib/assistant-v2/get-next-pricing-question";
import type { ScopeQuestionWithAnswers } from "@/lib/project-assistant-data";

function makeQuestion(
  id: string,
  key: string,
  scopeId: string
): ScopeQuestionWithAnswers {
  return {
    id,
    project_scope_id: scopeId,
    organisation_id: null,
    question: `Q ${key}`,
    question_key: key,
    question_type: "select",
    options: [{ value: "yes", label: "Yes" }],
    unit: null,
    sort_order: 0,
    created_at: new Date().toISOString(),
    scope_answers: [],
  } as ScopeQuestionWithAnswers;
}

describe("getNextPricingQuestions batch grouping", () => {
  it("returns up to 6 questions total", () => {
    const scopeGroups: ScopeGroupInput[] = [
      {
        scopeId: "deck-1",
        scopeName: "Deck",
        scopeTypeName: "Deck",
        questions: [
          makeQuestion("q1", "deck.area_m2", "deck-1"),
          makeQuestion("q2", "deck.material_type", "deck-1"),
          makeQuestion("q3", "deck.level_type", "deck-1"),
          makeQuestion("q4", "deck.finish_level", "deck-1"),
          makeQuestion("q5", "deck.has_stairs", "deck-1"),
          makeQuestion("q6", "deck.has_balustrade", "deck-1"),
          makeQuestion("q7", "deck.has_pergola", "deck-1"),
        ],
      },
    ];

    const batch = getNextPricingQuestions(
      {
        scopeGroups,
        discovery: null,
        scopeQuestions: scopeGroups.flatMap((g) => g.questions),
      },
      SCOPE_BATCH_MAX_TOTAL
    );

    expect(batch.length).toBeLessThanOrEqual(SCOPE_BATCH_MAX_TOTAL);
    expect(batch.length).toBe(4);
  });

  it("groups by work area with max 4 per scope", () => {
    const scopeGroups: ScopeGroupInput[] = [
      {
        scopeId: "deck-1",
        scopeName: "Deck",
        scopeTypeName: "Deck",
        questions: [
          makeQuestion("d1", "deck.area_m2", "deck-1"),
          makeQuestion("d2", "deck.material_type", "deck-1"),
          makeQuestion("d3", "deck.level_type", "deck-1"),
          makeQuestion("d4", "deck.finish_level", "deck-1"),
          makeQuestion("d5", "deck.has_stairs", "deck-1"),
        ],
      },
      {
        scopeId: "wall-1",
        scopeName: "Retaining Wall",
        scopeTypeName: "Retaining Wall",
        questions: [
          makeQuestion("w1", "retaining_wall.length_m", "wall-1"),
          makeQuestion("w2", "retaining_wall.height_m", "wall-1"),
          makeQuestion("w3", "retaining_wall.material", "wall-1"),
        ],
      },
    ];

    const batch = getNextPricingQuestions(
      {
        scopeGroups,
        discovery: null,
        scopeQuestions: scopeGroups.flatMap((g) => g.questions),
      },
      SCOPE_BATCH_MAX_TOTAL
    );

    expect(batch.length).toBe(6);
    const deckCount = batch.filter((q) => q.scopeId === "deck-1").length;
    const wallCount = batch.filter((q) => q.scopeId === "wall-1").length;
    expect(deckCount).toBe(SCOPE_BATCH_MAX_PER_SCOPE);
    expect(wallCount).toBe(2);
    expect(batch[0]?.scopeName).toBe("Deck");
    expect(batch[4]?.scopeName).toBe("Retaining Wall");
  });
});
