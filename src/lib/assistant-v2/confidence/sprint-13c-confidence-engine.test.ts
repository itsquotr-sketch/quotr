import { describe, expect, it } from "vitest";
import {
  buildConfidenceExplanationFromEvaluation,
  confidenceStatusToTier,
  evaluateConfidence,
  scoreToConfidenceStatus,
} from "@/lib/assistant-v2/confidence/evaluate-confidence";
import { buildConfidenceExplanation } from "@/lib/assistant-v2/commands/build-question-responses";

const completeDeckAnswers: Record<string, string> = {
  "deck.area_m2": "25",
  "deck.material_type": "composite",
  "deck.level_type": "ground",
  "deck.finish_level": "standard",
  "deck.has_stairs": "no",
  "deck.has_balustrade": "yes",
  "deck.has_pergola": "no",
  "deck.tight_access": "no",
};

function deckWorkArea(answers: Record<string, string>) {
  return {
    scopeId: "scope-deck-1",
    scopeName: "Deck",
    workAreaTypeKey: "Deck",
    answers,
    included: true,
  };
}

describe("Sprint 13C confidence engine", () => {
  it("Test A — complete deck with user rate reaches READY or GOOD", () => {
    const result = evaluateConfidence({
      workAreas: [deckWorkArea(completeDeckAnswers)],
      qualityLevel: "standard",
      siteConstraintsAssessed: true,
      rateSourceLines: [
        {
          workAreaName: "Deck",
          workAreaTypeKey: "Deck",
          scopeTypeKey: "deck",
          label: "Deck",
          rateSource: "scope_rate",
          rateSourceLabel: "Your deck rate",
        },
      ],
    });

    expect(result.overallScore).toBeGreaterThanOrEqual(70);
    expect(["good", "ready"]).toContain(result.overallStatus);
    expect(confidenceStatusToTier(result.overallStatus)).toMatch(/GOOD|READY/);
  });

  it("Test B — unknown area cannot be READY", () => {
    const answers = { ...completeDeckAnswers };
    delete answers["deck.area_m2"];

    const result = evaluateConfidence({
      workAreas: [deckWorkArea(answers)],
      qualityLevel: "standard",
      siteConstraintsAssessed: true,
      rateSourceLines: [
        {
          workAreaName: "Deck",
          workAreaTypeKey: "Deck",
          scopeTypeKey: "deck",
          label: "Deck",
          rateSource: "scope_rate",
          rateSourceLabel: "Your deck rate",
        },
      ],
    });

    expect(result.overallStatus).not.toBe("ready");
    expect(result.scopes[0]?.missingCritical.length).toBeGreaterThan(0);
  });

  it("Test C — benchmark only caps at GOOD when useful facts remain", () => {
    const result = evaluateConfidence({
      workAreas: [deckWorkArea(completeDeckAnswers)],
      qualityLevel: "standard",
      siteConstraintsAssessed: true,
      rateSourceLines: [
        {
          workAreaName: "Deck",
          workAreaTypeKey: "Deck",
          scopeTypeKey: "deck",
          label: "Deck",
          rateSource: "template_benchmark",
          rateSourceLabel: "Benchmark",
        },
      ],
    });

    expect(result.overallScore).toBeGreaterThanOrEqual(70);
    expect(result.overallStatus).not.toBe("low");
  });

  it("Test D — optional-only missing does not block READY/GOOD", () => {
    const answers = {
      ...completeDeckAnswers,
    };

    const result = evaluateConfidence({
      workAreas: [deckWorkArea(answers)],
      qualityLevel: "standard",
      siteConstraintsAssessed: true,
      rateSourceLines: [
        {
          workAreaName: "Deck",
          workAreaTypeKey: "Deck",
          scopeTypeKey: "deck",
          label: "Deck",
          rateSource: "scope_rate",
          rateSourceLabel: "Your deck rate",
        },
      ],
    });

    expect(result.scopes[0]?.missingCritical.length).toBe(0);
    expect(result.scopes[0]?.optional.length).toBeGreaterThan(0);
    expect(["good", "ready"]).toContain(result.overallStatus);
  });

  it("Test E — placeholder rate keeps badge aligned with score (Sprint 13D.6)", () => {
    const result = evaluateConfidence({
      workAreas: [deckWorkArea(completeDeckAnswers)],
      qualityLevel: "standard",
      siteConstraintsAssessed: true,
      rateSourceLines: [
        {
          workAreaName: "Deck",
          workAreaTypeKey: "Deck",
          scopeTypeKey: "deck",
          label: "Deck",
          rateSource: "placeholder",
          rateSourceLabel: "Placeholder",
        },
      ],
    });

    const scope = result.scopes[0]!;
    expect(scope.status).toBe(scoreToConfidenceStatus(scope.score));
  });

  it("Test F — confidence chat answer uses engine evaluation", () => {
    const evaluation = evaluateConfidence({
      workAreas: [deckWorkArea(completeDeckAnswers)],
      qualityLevel: "standard",
      siteConstraintsAssessed: true,
      rateSourceLines: [
        {
          workAreaName: "Deck",
          workAreaTypeKey: "Deck",
          scopeTypeKey: "deck",
          label: "Deck",
          rateSource: "scope_rate",
          rateSourceLabel: "Your deck rate",
        },
      ],
    });

    const message = buildConfidenceExplanation({ confidenceEvaluation: evaluation });
    expect(message).toMatch(/GOOD|READY/i);
    expect(message.length).toBeGreaterThan(40);

    const direct = buildConfidenceExplanationFromEvaluation(evaluation);
    expect(direct).toContain("draft");
  });
});
