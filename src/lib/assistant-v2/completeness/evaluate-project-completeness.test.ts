import { describe, expect, it } from "vitest";
import {
  describeCompletenessStatus,
  evaluateProjectCompleteness,
  type EvaluateWorkAreaInput,
} from "@/lib/assistant-v2/completeness/evaluate-project-completeness";
import {
  formatNextBestQuestionsResponse,
  getNextBestQuestions,
} from "@/lib/assistant-v2/questions/get-next-best-questions";
import { buildMissingInformationLabels } from "@/lib/assistant-v2/compute-information-completeness";

const completeDeckAnswers: Record<string, string> = {
  "deck.area_m2": "29",
  "deck.material_type": "timber",
  "deck.level_type": "elevated",
  "deck.height_m": "0.8",
  "deck.finish_level": "premium",
  "deck.has_stairs": "yes",
};

const partialRetainingAnswers: Record<string, string> = {
  "retaining_wall.has_drainage": "yes",
};

function deckArea(scopeId = "deck-1"): EvaluateWorkAreaInput {
  return {
    scopeId,
    scopeName: "Deck",
    workAreaTypeKey: "Deck",
    answers: { ...completeDeckAnswers },
    included: true,
  };
}

function retainingArea(
  scopeId = "wall-1",
  included = true
): EvaluateWorkAreaInput {
  return {
    scopeId,
    scopeName: "Retaining Wall",
    workAreaTypeKey: "Retaining Wall",
    answers: { ...partialRetainingAnswers },
    included,
  };
}

function evaluateAreas(
  workAreas: EvaluateWorkAreaInput[],
  overrides: Partial<Parameters<typeof evaluateProjectCompleteness>[0]> = {}
) {
  return evaluateProjectCompleteness({
    workAreas,
    qualityLevel: "premium",
    selectedConstraintSlugs: ["tight-access", "poor-parking"],
    declinedConstraintSlugs: ["retaining-engineering-risk"],
    discoveryConstraintSlugs: ["tight-access", "poor-parking"],
    ...overrides,
  });
}

describe("evaluateProjectCompleteness", () => {
  it("Test A — adding retaining wall after complete deck drops status", () => {
    const deckOnly = evaluateAreas([deckArea()]);
    expect(deckOnly.projectStatus).toBe("enough_for_draft");

    const withWall = evaluateAreas([deckArea(), retainingArea()]);
    expect(withWall.projectStatus).toBe("needs_questions");
    expect(withWall.overallCompleteness).toBeLessThan(deckOnly.overallCompleteness);

    const wall = withWall.workAreas.find((w) => w.label === "Retaining Wall");
    expect(wall?.missingCriticalFacts).toEqual(
      expect.arrayContaining(["Wall length", "Wall height", "Wall material"])
    );

    const status = describeCompletenessStatus(withWall);
    expect(status.title).not.toMatch(/enough to work with/i);
    expect(status.title).toMatch(/few details/i);
  });

  it("Test B — re-including excluded retaining wall triggers missing facts", () => {
    const excluded = evaluateAreas([
      deckArea(),
      retainingArea("wall-1", false),
    ]);
    expect(
      excluded.workAreas.find((w) => w.label === "Retaining Wall")?.completeness
    ).toBe(100);

    const reincluded = evaluateAreas([deckArea(), retainingArea("wall-1", true)]);
    expect(reincluded.projectStatus).toBe("needs_questions");

    const questions = getNextBestQuestions({
      completeness: reincluded,
      workAreas: [deckArea(), retainingArea()],
      limit: 3,
    });
    expect(questions.length).toBeGreaterThan(0);
    expect(questions[0]?.scopeName).toBe("Retaining Wall");
  });

  it("Test C — deck area update reflected in understanding data", () => {
    const updatedAnswers = {
      ...completeDeckAnswers,
      "deck.area_m2": "29",
    };

    const result = evaluateAreas([
      {
        ...deckArea(),
        answers: updatedAnswers,
      },
    ]);

    const deck = result.workAreas.find((w) => w.label === "Deck");
    expect(deck?.missingCriticalFacts).not.toContain("Deck area");
    expect(updatedAnswers["deck.area_m2"]).toBe("29");
  });

  it("Test D — multi-scope missing labels are scoped", () => {
    const workAreas = [
      {
        scopeName: "Deck",
        workAreaTypeKey: "Deck",
        answers: completeDeckAnswers,
        included: true,
      },
      {
        scopeName: "Retaining Wall",
        workAreaTypeKey: "Retaining Wall",
        answers: partialRetainingAnswers,
        included: true,
      },
    ];

    const labels = buildMissingInformationLabels(workAreas);
    expect(labels.some((l) => l.startsWith("Retaining Wall"))).toBe(true);
    expect(labels.some((l) => l.toLowerCase().includes("material"))).toBe(true);
  });

  it("Test E — refinement questions include scope-specific missing facts", () => {
    const completeness = evaluateAreas([deckArea(), retainingArea()]);
    const questions = getNextBestQuestions({
      completeness,
      workAreas: [deckArea(), retainingArea()],
      limit: 3,
    });

    const response = formatNextBestQuestionsResponse(questions);
    expect(response).toMatch(/Retaining Wall/i);
    expect(questions.length).toBeLessThanOrEqual(3);
  });
});
