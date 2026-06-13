import { describe, expect, it } from "vitest";
import {
  resolveFactUpdate,
  type ScopeForFactResolution,
} from "@/lib/assistant-v2/facts/resolve-fact-update";

const deckScope: ScopeForFactResolution = {
  scopeId: "11111111-1111-1111-1111-111111111111",
  scopeName: "Deck",
  workAreaTypeKey: "Deck",
  answers: {
    "deck.area_m2": "24.5",
    "deck.material_type": "timber",
    "deck.level_type": "elevated",
    "deck.finish_level": "standard",
  },
};

const retainingScope: ScopeForFactResolution = {
  scopeId: "22222222-2222-2222-2222-222222222222",
  scopeName: "Retaining wall",
  workAreaTypeKey: "Retaining Wall",
  answers: {
    "retaining_wall.length_m": "7",
    "retaining_wall.height_m": "1.4",
  },
};

const bathroomScope: ScopeForFactResolution = {
  scopeId: "33333333-3333-3333-3333-333333333333",
  scopeName: "Bathroom renovation",
  workAreaTypeKey: "Bathroom renovation",
  answers: {
    "bathroom.floor_area_m2": "6",
  },
};

describe("resolveFactUpdate", () => {
  it("resolves deck area update with high confidence", () => {
    const result = resolveFactUpdate(
      [deckScope],
      "Update the deck area to 29m²"
    );

    expect(result.matched).toBe(true);
    expect(result.confidence).toBeGreaterThanOrEqual(0.8);
    expect(result.scopeId).toBe(deckScope.scopeId);
    expect(result.factKey).toBe("deck.area_m2");
    expect(result.newValue).toBe("29");
    expect(result.requiresConfirmation).toBe(false);
  });

  it("resolves implicit deck area correction", () => {
    const result = resolveFactUpdate([deckScope], "Actually the deck is 29m²");

    expect(result.matched).toBe(true);
    expect(result.factKey).toBe("deck.area_m2");
    expect(result.newValue).toBe("29");
  });

  it("asks for clarification when area is ambiguous", () => {
    const result = resolveFactUpdate(
      [deckScope, bathroomScope],
      "Change the area to 30m²"
    );

    expect(result.matched).toBe(true);
    expect(result.requiresConfirmation).toBe(true);
    expect(result.confirmationMessage).toMatch(/deck|bathroom/i);
  });

  it("resolves deck finish level change", () => {
    const result = resolveFactUpdate(
      [deckScope],
      "Actually make the deck standard not premium"
    );

    expect(result.matched).toBe(true);
    expect(result.factKey).toBe("deck.finish_level");
    expect(result.newValue).toBe("standard");
  });

  it("returns unmatched for non-update messages", () => {
    const result = resolveFactUpdate(
      [deckScope],
      "What is included in this estimate?"
    );

    expect(result.matched).toBe(false);
  });

  it("resolves retaining wall length update", () => {
    const result = resolveFactUpdate(
      [retainingScope],
      "Update retaining wall length to 8m"
    );

    expect(result.matched).toBe(true);
    expect(result.factKey).toBe("retaining_wall.length_m");
    expect(result.newValue).toBe("8");
  });

  it("resolves no stairs as deck fact update", () => {
    const result = resolveFactUpdate([deckScope], "No stairs.");

    expect(result.matched).toBe(true);
    expect(result.factKey).toBe("deck.has_stairs");
    expect(result.newValue).toBe("no");
    expect(result.requiresConfirmation).toBe(false);
  });

  it("resolves client supplying tiles and vanity", () => {
    const result = resolveFactUpdate(
      [bathroomScope],
      "Client is supplying tiles and vanity."
    );

    expect(result.matched).toBe(true);
    expect(result.scopeId).toBe(bathroomScope.scopeId);
    expect(["bathroom.fixtures_client_supplied", "bathroom.tiles_supplied_by"]).toContain(
      result.factKey
    );
  });
});
