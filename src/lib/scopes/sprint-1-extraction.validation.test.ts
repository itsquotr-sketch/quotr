import { describe, expect, it } from "vitest";
import {
  buildQuestionsFromTemplates,
  extractFactsFromTemplates,
  matchWorkAreasFromTemplates,
} from "@/lib/scope-templates/discovery";

function factValue(
  facts: ReturnType<typeof extractFactsFromTemplates>,
  key: string
): string | undefined {
  return facts.find((f) => f.key === key)?.value;
}

function factRawNumber(
  facts: ReturnType<typeof extractFactsFromTemplates>,
  key: string
): string | undefined {
  const value = factValue(facts, key);
  return value?.match(/^(\d+(?:\.\d+)?)/)?.[1];
}

describe("Sprint 1 extraction validation", () => {
  it("deck prompt 1 — hardwood kwila with dimensions and premium finish", () => {
    const facts = extractFactsFromTemplates(
      "hardwood kwila deck, 5m wide by 8m long, high quality finish, steps included"
    );

    expect(factRawNumber(facts, "deck.length_m")).toBe("8");
    expect(factRawNumber(facts, "deck.width_m")).toBe("5");
    expect(factRawNumber(facts, "deck.area_m2")).toBe("40");
    expect(factValue(facts, "deck.material_type")).toBe("timber");
    expect(factValue(facts, "deck.finish_level")).toBe("premium");
    expect(factValue(facts, "deck.has_stairs")).toBe("yes");
    expect(
      buildQuestionsFromTemplates(matchWorkAreasFromTemplates(
        "hardwood kwila deck, 5m wide by 8m long, high quality finish, steps included"
      ), facts).some((q) => q.key === "deck.area_m2")
    ).toBe(false);
  });

  it("deck prompt 2 — reversed dimension order with premium hardwood", () => {
    const facts = extractFactsFromTemplates(
      "8m long by 5m wide premium hardwood deck"
    );

    expect(factRawNumber(facts, "deck.length_m")).toBe("8");
    expect(factRawNumber(facts, "deck.width_m")).toBe("5");
    expect(factRawNumber(facts, "deck.area_m2")).toBe("40");
    expect(factValue(facts, "deck.material_type")).toBe("timber");
    expect(factValue(facts, "deck.finish_level")).toBe("premium");
  });

  it("deck prompt 3 — treated pine x/by dimensions", () => {
    const facts = extractFactsFromTemplates("5m x 8m treated pine deck");

    expect(factRawNumber(facts, "deck.length_m")).toBe("8");
    expect(factRawNumber(facts, "deck.width_m")).toBe("5");
    expect(factRawNumber(facts, "deck.area_m2")).toBe("40");
    expect(factValue(facts, "deck.material_type")).toBe("timber");
  });

  it("deck prompt Sprint 1B — 3m wide by 6m long with timber and features", () => {
    const facts = extractFactsFromTemplates(
      "3m wide by 6m long deck, hard wood timber, stairs down the side, and a pergola."
    );

    expect(factRawNumber(facts, "deck.width_m")).toBe("3");
    expect(factRawNumber(facts, "deck.length_m")).toBe("6");
    expect(factRawNumber(facts, "deck.area_m2")).toBe("18");
    expect(factValue(facts, "deck.material_type")).toBe("timber");
    expect(factValue(facts, "deck.has_stairs")).toBe("yes");
    expect(factValue(facts, "deck.has_pergola")).toBe("yes");
  });

  it("bathroom prompt 4 — premium with full tiling", () => {
    const facts = extractFactsFromTemplates(
      "premium bathroom, floor and wall tiling"
    );

    expect(factValue(facts, "bathroom.finish_level")).toBe("premium");
    expect(factValue(facts, "bathroom.tile_extent")).toBe("full");
  });

  it("bathroom prompt 5 — budget with splashback", () => {
    const facts = extractFactsFromTemplates(
      "budget bathroom with splashback only"
    );

    expect(factValue(facts, "bathroom.finish_level")).toBe("budget");
    expect(factValue(facts, "bathroom.tile_extent")).toBe("partial");
  });

  it("retaining wall regression — no change to existing extraction", () => {
    const facts = extractFactsFromTemplates(
      "retaining wall 15m long, 3m high retaining wall, timber with drainage"
    );

    expect(factRawNumber(facts, "retaining_wall.length_m")).toBe("15");
    expect(factRawNumber(facts, "retaining_wall.height_m")).toBe("3");
    expect(facts.some((f) => f.key.startsWith("deck."))).toBe(false);
  });
});
