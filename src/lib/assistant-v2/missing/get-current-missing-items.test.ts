import { describe, expect, it } from "vitest";
import {
  getCriticalOrUsefulMissing,
  getCurrentMissingItems,
  getOptionalMissing,
} from "@/lib/assistant-v2/missing/get-current-missing-items";

describe("getCurrentMissingItems", () => {
  const deckArea = {
    scopeId: "11111111-1111-1111-1111-111111111111",
    scopeName: "Deck",
    workAreaTypeKey: "deck",
    included: true,
    answers: {
      "deck.area_m2": "20",
      "deck.finish_level": "standard",
      "deck.has_stairs": "no",
      "deck.has_balustrade": "no",
    },
  };

  it("excludes answered facts including false answers", () => {
    const items = getCurrentMissingItems({ workAreas: [deckArea] });
    const factKeys = items.map((i) => i.factKey);
    expect(factKeys).not.toContain("deck.has_stairs");
    expect(factKeys).not.toContain("deck.has_balustrade");
  });

  it("splits critical/useful vs optional missing", () => {
    const items = getCurrentMissingItems({ workAreas: [deckArea] });
    const criticalOrUseful = getCriticalOrUsefulMissing(items);
    const optional = getOptionalMissing(items);

    for (const item of criticalOrUseful) {
      expect(["critical", "useful"]).toContain(item.importance);
    }
    for (const item of optional) {
      expect(item.importance).toBe("optional");
    }
  });

  it("removes retaining wall items when answers are provided", () => {
    const unanswered = getCurrentMissingItems({
      workAreas: [
        {
          scopeId: "22222222-2222-2222-2222-222222222222",
          scopeName: "Retaining wall",
          workAreaTypeKey: "Retaining Wall",
          included: true,
          answers: {},
        },
      ],
    });

    const answered = getCurrentMissingItems({
      workAreas: [
        {
          scopeId: "22222222-2222-2222-2222-222222222222",
          scopeName: "Retaining wall",
          workAreaTypeKey: "Retaining Wall",
          included: true,
          answers: {
            "retaining_wall.has_backfill": "yes",
            "retaining_wall.has_spoil_removal": "yes",
            "retaining_wall.carting_distance_m": "34",
          },
        },
      ],
    });

    const unansweredKeys = unanswered.map((i) => i.factKey);
    const answeredKeys = answered.map((i) => i.factKey);

    expect(unansweredKeys).toContain("retaining_wall.has_backfill");
    expect(answeredKeys).not.toContain("retaining_wall.has_backfill");
    expect(answeredKeys).not.toContain("retaining_wall.has_spoil_removal");
    expect(answeredKeys).not.toContain("retaining_wall.carting_distance_m");
  });
});
