import { describe, expect, it } from "vitest";
import { getNextAssistantTurn } from "@/lib/assistant-v2/get-next-assistant-turn";
import { getNextPricingQuestions } from "@/lib/assistant-v2/get-next-pricing-question";
import { resolveAssistantFlowState } from "@/lib/assistant-v2/flow/resolve-assistant-flow-state";
import { resolveFlowPanelAction } from "@/lib/assistant-v2/flow/resolve-flow-panel-action";
import { extractProjectScopeFactsDeterministic } from "@/lib/assistant-v2/extraction/extract-project-scope-facts";
import { applyInferredFacts } from "@/lib/assistant-v2/facts/infer-related-facts";
import {
  needsConfidenceContinuation,
  shouldStopProactiveQuestions,
} from "@/lib/assistant-v2/confidence/confidence-continuation";
import { evaluateConfidence } from "@/lib/assistant-v2/confidence/evaluate-confidence";

const EXACT_PROMPT =
  "7m by 3m timber deck with single step and pergola, also a new 3m fence with gate, and new retaining wall (6m long by 1.8m high) including all excavation";

function answersForScope(scopeTypeKey: string) {
  const extracted = extractProjectScopeFactsDeterministic(EXACT_PROMPT);
  const area = extracted.workAreas.find((w) => w.scopeTypeKey === scopeTypeKey);
  const answers: Record<string, string> = {};
  for (const fact of area?.facts ?? []) {
    answers[fact.key] = fact.value;
  }
  return applyInferredFacts(answers);
}

describe("Sprint 13D.7 — confidence continuation", () => {
  const deckAnswers = answersForScope("Deck");
  const fenceAnswers = answersForScope("Fence");
  const retainingAnswers = answersForScope("Retaining Wall");

  const workAreas = [
    {
      scopeId: "deck-1",
      scopeName: "Deck",
      workAreaTypeKey: "Deck",
      answers: deckAnswers,
      included: true,
    },
    {
      scopeId: "fence-1",
      scopeName: "Fence",
      workAreaTypeKey: "Fence",
      answers: fenceAnswers,
      included: true,
    },
    {
      scopeId: "wall-1",
      scopeName: "Retaining Wall",
      workAreaTypeKey: "Retaining Wall",
      answers: retainingAnswers,
      included: true,
    },
  ];

  it("allows up to 8 questions with max 4 per scope for multi-scope projects", () => {
    const questions = getNextPricingQuestions({
      scopeGroups: workAreas.map((a) => ({
        scopeId: a.scopeId,
        scopeName: a.scopeName,
        scopeTypeName: a.workAreaTypeKey,
        questions: [],
      })),
      discovery: null,
      scopeQuestions: [],
      qualityLevel: "standard",
      answeredQuestionKeys: new Set(),
    });

    expect(questions.length).toBeGreaterThanOrEqual(3);
    expect(questions.length).toBeLessThanOrEqual(8);

    const perScope = new Map<string, number>();
    for (const q of questions) {
      perScope.set(q.scopeId, (perScope.get(q.scopeId) ?? 0) + 1);
    }
    for (const count of perScope.values()) {
      expect(count).toBeLessThanOrEqual(4);
    }
  });

  it("does not mark estimate_ready while required facts or confidence gaps remain", () => {
    const evaluation = evaluateConfidence({
      workAreas,
      qualityLevel: "standard",
      siteConstraintsAssessed: false,
    });

    expect(needsConfidenceContinuation({ evaluation })).toBe(true);

    const flow = resolveAssistantFlowState({
      workAreas,
      qualityLevel: "standard",
      selectedConstraintSlugs: [],
      declinedConstraintSlugs: [],
      hasEstimate: true,
      estimateReady: true,
      confidenceEvaluation: evaluation,
    });

    expect(["needs_required_scope_details", "needs_confidence_refinement"]).toContain(
      flow.state
    );
    expect(flow.state).not.toBe("estimate_ready");
  });

  it("auto-asks useful questions after estimate when confidence is FAIR/LOW", () => {
    const requiredCompleteAreas = [
      {
        scopeId: "deck-1",
        scopeName: "Deck",
        workAreaTypeKey: "Deck",
        answers: {
          ...deckAnswers,
          "deck.finish_level": "standard",
          "deck.level_type": "ground",
        },
        included: true,
      },
      {
        scopeId: "fence-1",
        scopeName: "Fence",
        workAreaTypeKey: "Fence",
        answers: {
          ...fenceAnswers,
          "fence.height_m": "1.8",
          "fence.fence_type": "paling",
          "fence.material_type": "timber",
        },
        included: true,
      },
      {
        scopeId: "wall-1",
        scopeName: "Retaining Wall",
        workAreaTypeKey: "Retaining Wall",
        answers: {
          ...retainingAnswers,
          "retaining_wall.material": "timber",
          "retaining_wall.drainage": "yes",
          "retaining_wall.machine_access": "yes",
        },
        included: true,
      },
    ];

    const turn = getNextAssistantTurn({
      scopeGroups: requiredCompleteAreas.map((a) => ({
        scopeId: a.scopeId,
        scopeName: a.scopeName,
        scopeTypeName: a.workAreaTypeKey,
        questions: [],
        answers: a.answers,
      })),
      workAreaTypeKeys: requiredCompleteAreas.map((a) => a.workAreaTypeKey),
      discovery: null,
      scopeQuestions: [],
      selectedConstraintSlugs: ["steep_site"],
      declinedConstraintSlugs: new Set(["limited_access"]),
      qualityLevel: "standard",
      answeredQuestionKeys: new Set(["limited_access"]),
      hasEstimate: true,
      estimateReady: true,
    });

    expect(turn).not.toBeNull();
    expect(["scope_batch", "constraint_batch"]).toContain(turn?.kind);
    if (turn?.kind === "scope_batch") {
      expect(turn.questions.length).toBeGreaterThan(0);
    }
  });

  it("estimate panel shows Improve estimate when confidence target not reached", () => {
    const completeWorkAreas = [
      {
        scopeId: "deck-1",
        scopeName: "Deck",
        workAreaTypeKey: "Deck",
        answers: {
          ...deckAnswers,
          "deck.finish_level": "standard",
          "deck.level_type": "ground",
        },
        included: true,
      },
      {
        scopeId: "fence-1",
        scopeName: "Fence",
        workAreaTypeKey: "Fence",
        answers: {
          ...fenceAnswers,
          "fence.height_m": "1.8",
          "fence.fence_type": "paling",
          "fence.material_type": "timber",
        },
        included: true,
      },
      {
        scopeId: "wall-1",
        scopeName: "Retaining Wall",
        workAreaTypeKey: "Retaining Wall",
        answers: {
          ...retainingAnswers,
          "retaining_wall.material": "timber",
          "retaining_wall.drainage": "yes",
          "retaining_wall.machine_access": "yes",
        },
        included: true,
      },
    ];

    const evaluation = evaluateConfidence({
      workAreas: completeWorkAreas,
      qualityLevel: "standard",
      siteConstraintsAssessed: true,
    });

    const flow = resolveAssistantFlowState({
      workAreas: completeWorkAreas,
      qualityLevel: "standard",
      selectedConstraintSlugs: ["steep_site"],
      declinedConstraintSlugs: [],
      hasEstimate: true,
      estimateReady: true,
      confidenceEvaluation: evaluation,
    });

    const action = resolveFlowPanelAction(flow);
    expect(action?.label).toMatch(
      /Improve estimate|Answer \d+ details|Answer missing details/i
    );
    expect(action?.label).not.toMatch(/Add more detail/i);
  });

  it("stops proactively when every scope reaches GOOD or better", () => {
    const strongEvaluation = evaluateConfidence({
      workAreas: [
        {
          scopeId: "deck-1",
          scopeName: "Deck",
          workAreaTypeKey: "Deck",
          included: true,
          answers: {
            "deck.area_m2": "21",
            "deck.material_type": "treated_pine",
            "deck.level_type": "ground",
            "deck.finish_level": "standard",
            "deck.has_balustrade": "yes",
            "deck.has_stairs": "yes",
            "deck.has_pergola": "yes",
            "deck.material_supply": "contractor",
          },
        },
      ],
      qualityLevel: "standard",
      siteConstraintsAssessed: true,
    });

    expect(
      shouldStopProactiveQuestions({ evaluation: strongEvaluation })
    ).toBe(true);
  });
});
