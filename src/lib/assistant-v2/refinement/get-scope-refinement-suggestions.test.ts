import { describe, expect, it } from "vitest";
import {
  formatScopeRefinementResponse,
  getScopeRefinementSuggestions,
} from "@/lib/assistant-v2/refinement/get-scope-refinement-suggestions";
import type { EvaluateWorkAreaInput } from "@/lib/assistant-v2/completeness/evaluate-project-completeness";

const deckArea: EvaluateWorkAreaInput = {
  scopeId: "11111111-1111-1111-1111-111111111111",
  scopeName: "Deck",
  workAreaTypeKey: "Deck",
  included: true,
  answers: {
    "deck.area_m2": "24",
    "deck.material_type": "timber",
    "deck.level_type": "elevated",
  },
};

const retainingArea: EvaluateWorkAreaInput = {
  scopeId: "22222222-2222-2222-2222-222222222222",
  scopeName: "Retaining wall",
  workAreaTypeKey: "Retaining Wall",
  included: true,
  answers: {
    "retaining_wall.length_m": "7",
    "retaining_wall.height_m": "1.4",
  },
};

describe("getScopeRefinementSuggestions", () => {
  it("returns scoped missing facts for general refinement", () => {
    const suggestions = getScopeRefinementSuggestions({
      workAreas: [deckArea, retainingArea],
      limit: 5,
    });

    expect(suggestions.length).toBeGreaterThan(0);
    expect(
      suggestions.some((s) => s.factKey.includes("finish_level"))
    ).toBe(true);
    expect(
      suggestions.some((s) => s.scopeName === "Retaining wall")
    ).toBe(true);
  });

  it("filters suggestions to a specific work area", () => {
    const suggestions = getScopeRefinementSuggestions({
      workAreas: [deckArea, retainingArea],
      scopeName: "Deck",
      limit: 5,
    });

    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions.every((s) => !s.scopeName || s.scopeName === "Deck")).toBe(
      true
    );
  });

  it("includes retaining wall material and machine access when missing", () => {
    const suggestions = getScopeRefinementSuggestions({
      workAreas: [retainingArea],
      limit: 5,
    });

    const keys = suggestions.map((s) => s.factKey);
    expect(keys).toContain("retaining_wall.material");
    expect(keys).toContain("retaining_wall.machine_access");
  });

  it("formats solid estimate message when nothing missing", () => {
    const completeDeck: EvaluateWorkAreaInput = {
      ...deckArea,
      answers: {
        "deck.area_m2": "24",
        "deck.material_type": "timber",
        "deck.level_type": "elevated",
        "deck.finish_level": "standard",
        "deck.has_stairs": "no",
        "deck.has_balustrade": "no",
        "deck.has_pergola": "no",
        "deck.height_m": "0.8",
        "deck.tight_access": "no",
        "deck.material_supply": "supply_and_install",
        "deck.balustrade_supply": "supply_and_install",
      },
    };

    const suggestions = getScopeRefinementSuggestions({
      workAreas: [completeDeck],
      hasUserRates: true,
      limit: 5,
    });

    const text = formatScopeRefinementResponse(suggestions);
    expect(text).toMatch(/already solid/i);
  });
});
