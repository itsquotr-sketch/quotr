import { describe, expect, it } from "vitest";
import {
  formatSharpeningResponse,
  getSharpeningSuggestions,
} from "@/lib/assistant-v2/estimate-sharpening/get-sharpening-suggestions";
import type { QuickEstimateWorkAreaInput } from "@/lib/cost-engine/quick-estimate-input";

const deckWorkArea: QuickEstimateWorkAreaInput = {
  scopeId: "scope-1",
  name: "Deck",
  workAreaTypeKey: "Deck",
  answeredFromNotes: [],
  answers: {
    "deck.area_m2": "50",
    "deck.material_type": "timber",
    "deck.level_type": "elevated",
    "deck.finish_level": "standard",
  },
};

describe("getSharpeningSuggestions", () => {
  it("returns top missing high-impact deck facts", () => {
    const suggestions = getSharpeningSuggestions(
      {
        workAreas: [deckWorkArea],
        effectiveQualityLevel: "standard",
        hasUserRates: false,
      },
      3
    );

    expect(suggestions.length).toBeLessThanOrEqual(3);
    expect(suggestions.some((s) => s.impact === "high" || s.impact === "medium")).toBe(
      true
    );
  });

  it("includes trace missing facts", () => {
    const suggestions = getSharpeningSuggestions(
      {
        workAreas: [deckWorkArea],
        effectiveQualityLevel: "standard",
        missingCriticalFacts: ["Balustrade"],
      },
      3
    );

    expect(suggestions.some((s) => s.label === "Balustrade")).toBe(true);
  });
});

describe("formatSharpeningResponse", () => {
  it("formats numbered list with call to action", () => {
    const text = formatSharpeningResponse([
      {
        key: "deck.has_stairs",
        label: "Stairs",
        reason: "Affects framing and labour.",
        impact: "high",
        questionText: "Are stairs included?",
      },
    ]);

    expect(text).toMatch(/To sharpen this estimate/);
    expect(text).toMatch(/Stairs/);
    expect(text).toMatch(/Want to answer these now/);
  });
});
