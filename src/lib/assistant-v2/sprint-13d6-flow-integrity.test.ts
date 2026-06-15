import { describe, expect, it } from "vitest";
import {
  buildProjectConfidenceMessage,
  confidenceStatusToTier,
  evaluateConfidence,
  evaluateScopeConfidence,
  scoreToConfidenceStatus,
} from "@/lib/assistant-v2/confidence/evaluate-confidence";
import { isFactDependencyMet } from "@/lib/assistant-v2/questions/is-fact-dependency-met";
import { getNextPricingQuestions } from "@/lib/assistant-v2/get-next-pricing-question";

describe("Sprint 13D.6 — flow integrity", () => {
  it("maps confidence scores to consistent status labels", () => {
    expect(scoreToConfidenceStatus(94)).toBe("ready");
    expect(confidenceStatusToTier("ready")).toBe("READY");
    expect(scoreToConfidenceStatus(64)).toBe("fair");
    expect(scoreToConfidenceStatus(41)).toBe("fair");
    expect(scoreToConfidenceStatus(39)).toBe("low");
    expect(scoreToConfidenceStatus(89)).toBe("good");
  });

  it("aligns scope badge status with displayed confidence score", () => {
    const deck = evaluateScopeConfidence(
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
        },
      },
      { qualityLevel: "standard", siteConstraintsAssessed: true }
    );

    expect(deck.score).toBeGreaterThanOrEqual(90);
    expect(confidenceStatusToTier(deck.status)).toBe("READY");
  });

  it("gates balustrade supply until balustrade is confirmed yes", () => {
    const withoutParent = isFactDependencyMet("Deck", "deck.balustrade_supply", {
      "deck.has_balustrade": "no",
    });
    const unresolvedParent = isFactDependencyMet("Deck", "deck.balustrade_supply", {
      "deck.has_balustrade": "not_sure",
    });
    const withParent = isFactDependencyMet("Deck", "deck.balustrade_supply", {
      "deck.has_balustrade": "yes",
    });

    expect(withoutParent).toBe(false);
    expect(unresolvedParent).toBe(false);
    expect(withParent).toBe(true);
  });

  it("does not batch parent and child deck questions together", () => {
    const questions = getNextPricingQuestions({
      scopeGroups: [
        {
          scopeId: "deck-1",
          scopeName: "Deck",
          scopeTypeName: "Deck",
          questions: [],
        },
      ],
      discovery: null,
      scopeQuestions: [],
      qualityLevel: "standard",
      answeredQuestionKeys: new Set(),
    });

    const keys = questions.map((q) => q.questionKey);
    if (keys.includes("deck.has_balustrade")) {
      expect(keys).not.toContain("deck.balustrade_supply");
    }
    if (keys.includes("deck.has_balustrade") && keys.includes("deck.balustrade_supply")) {
      throw new Error("parent and child should not appear together");
    }
  });

  it("computes overall understanding as average scope confidence", () => {
    const evaluation = evaluateConfidence({
      qualityLevel: "standard",
      siteConstraintsAssessed: true,
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
          },
        },
        {
          scopeId: "fence-1",
          scopeName: "Fence",
          workAreaTypeKey: "Fence",
          included: true,
          answers: {
            "fence.length_m": "3",
            "fence.height_m": "1.8",
            "fence.fence_type": "paling",
            "fence.material_type": "timber",
          },
        },
      ],
    });

    expect(evaluation.overallScore).toBeGreaterThan(0);
    expect(evaluation.overallScore).toBeLessThanOrEqual(100);
    const avg =
      evaluation.scopes.reduce((sum, scope) => sum + scope.score, 0) /
      evaluation.scopes.length;
    expect(evaluation.overallScore).toBe(Math.round(avg));
  });

  it("uses mixed project-level language when scopes differ", () => {
    const evaluation = evaluateConfidence({
      qualityLevel: "standard",
      siteConstraintsAssessed: true,
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
          },
        },
        {
          scopeId: "fence-1",
          scopeName: "Fence",
          workAreaTypeKey: "Fence",
          included: true,
          answers: {
            "fence.length_m": "3",
            "fence.height_m": "1.8",
            "fence.fence_type": "paling",
            "fence.material_type": "timber",
          },
        },
      ],
    });

    const message = buildProjectConfidenceMessage(evaluation);
    expect(message).toMatch(/Deck.*Fence|Fence.*Deck/i);
    expect(message).toMatch(/strong|details/i);
  });
});
