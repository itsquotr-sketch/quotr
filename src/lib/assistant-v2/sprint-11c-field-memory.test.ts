import { describe, expect, it } from "vitest";
import {
  getKnownFactsForScope,
  isFactKnown,
  parseFinishLevelSynonym,
  shouldSkipQuestion,
} from "@/lib/assistant-v2/facts/get-known-facts-for-scope";
import { parseLengthWidthDimensions } from "@/lib/assistant-v2/facts/parse-numeric-command";
import { resolveFactUpdate } from "@/lib/assistant-v2/facts/resolve-fact-update";
import {
  extractMessageActions,
  partitionActionsByConfidence,
} from "@/lib/assistant-v2/intent/extract-message-actions";
import { getDependentFollowUpQuestions } from "@/lib/assistant-v2/questions/get-dependent-follow-up-questions";
import type { ScopeForFactResolution } from "@/lib/assistant-v2/facts/resolve-fact-update";
import { getScopeByWorkAreaType } from "@/lib/scopes";

const deckScope: ScopeForFactResolution = {
  scopeId: "11111111-1111-1111-1111-111111111111",
  scopeName: "Deck",
  workAreaTypeKey: "Deck",
  answers: {},
};

describe("Sprint 11C — field memory & parsing", () => {
  it("Test A — finish level not repeated when known from prompt", () => {
    const known = getKnownFactsForScope({
      scopeId: deckScope.scopeId,
      scopeTypeKey: "Deck",
      answers: { "deck.area_m2": "25", "deck.finish_level": "premium" },
      qualityLevel: "premium",
    });

    expect(isFactKnown(known, "deck.finish_level")).toBe(true);

    const finishFact = getScopeByWorkAreaType("Deck")!.requiredFacts.find(
      (f) => f.key === "deck.finish_level"
    )!;
    expect(shouldSkipQuestion(known, finishFact)).toBe(true);
  });

  it("Test B — length × width calculates area", () => {
    const dims = parseLengthWidthDimensions("Deck is 7m wide by 3.5m long");
    expect(dims[0]?.width_m).toBe(7);
    expect(dims[0]?.length_m).toBe(3.5);
    expect(dims[0]?.area_m2).toBe(24.5);

    const result = resolveFactUpdate(
      [deckScope],
      "Deck is 7m wide by 3.5m long"
    );
    expect(result.matched).toBe(true);
    expect(result.factKey).toBe("deck.area_m2");
    expect(result.newValue).toBe("24.5");
  });

  it("Test C — height not area for off the ground", () => {
    const result = resolveFactUpdate(
      [deckScope],
      "The deck is 25m off the ground"
    );

    expect(result.matched).toBe(true);
    expect(result.factKey).toBe("deck.height_m");
    expect(result.newValue).toBe("25");
    expect(result.factKey).not.toBe("deck.area_m2");
    expect(result.requiresConfirmation).toBe(true);
  });

  it("Test D — access distance without deck area update", () => {
    const extracted = extractMessageActions(
      [deckScope],
      "Access is tight through stairwells around 150m walking"
    );

    const areaAction = extracted.actions.find((a) =>
      a.factKey?.includes("area")
    );
    expect(areaAction).toBeUndefined();

    const tight = extracted.actions.find(
      (a) => a.factKey === "deck.tight_access" || a.constraintSlug === "tight-access"
    );
    expect(tight).toBeDefined();

    const distance = extracted.actions.find(
      (a) =>
        a.constraintSlug === "carting-distance" ||
        a.factKey?.includes("carting")
    );
    expect(distance?.value).toBe("150");
  });

  it("Test E — multi-update in one message", () => {
    const extracted = extractMessageActions(
      [deckScope],
      "Deck is 25m², no stairs, client supplies decking, access is tight"
    );

    const { apply } = partitionActionsByConfidence(extracted);
    expect(apply.length).toBeGreaterThanOrEqual(3);

    const area = apply.find((a) => a.factKey === "deck.area_m2");
    const stairs = apply.find((a) => a.factKey === "deck.has_stairs");
    const supply = apply.find((a) => a.factKey === "deck.material_supply");
    expect(area?.value).toBe("25");
    expect(stairs?.value).toBe("no");
    expect(supply?.value).toBe("client_supplied");
  });

  it("Test F — dependent follow-up when deck elevated", () => {
    const known = getKnownFactsForScope({
      scopeId: deckScope.scopeId,
      scopeTypeKey: "Deck",
      answers: { "deck.level_type": "elevated" },
    });

    const followUps = getDependentFollowUpQuestions({
      knownFacts: known,
      changedFactKey: "deck.level_type",
    });

    expect(followUps.some((q) => /how high/i.test(q.questionText))).toBe(
      true
    );
  });

  it("Test G — no repeated elevated question when already known", () => {
    const known = getKnownFactsForScope({
      scopeId: deckScope.scopeId,
      scopeTypeKey: "Deck",
      answers: { "deck.level_type": "elevated", "deck.height_m": "1.2" },
    });

    const levelFact = getScopeByWorkAreaType("Deck")!.requiredFacts.find(
      (f) => f.key === "deck.level_type"
    )!;
    expect(shouldSkipQuestion(known, levelFact)).toBe(true);
  });

  it("parses finish level synonyms", () => {
    expect(parseFinishLevelSynonym("Premium 25m² timber deck")).toBe("premium");
    expect(parseFinishLevelSynonym("high-end finish")).toBe("premium");
    expect(parseFinishLevelSynonym("cheap and cheerful")).toBe("budget");
    expect(parseFinishLevelSynonym("standard timber")).toBeNull();
  });
});
