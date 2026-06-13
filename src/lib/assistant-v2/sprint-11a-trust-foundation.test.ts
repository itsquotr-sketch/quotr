import { describe, expect, it } from "vitest";
import { classifyAssistantIntent } from "@/lib/assistant-v2/intent/classify-assistant-intent";
import { resolveRateSourceBanner } from "@/lib/cost-engine/resolve-rate-source-banner";
import type { WorkAreaRateSourceLine } from "@/lib/cost-engine/estimate-trace";

const deckScopeId = "11111111-1111-1111-1111-111111111111";
const retainingScopeId = "22222222-2222-2222-2222-222222222222";

function rateLine(
  name: string,
  source: WorkAreaRateSourceLine["rateSource"],
  label: string
): WorkAreaRateSourceLine {
  return {
    workAreaName: name,
    workAreaTypeKey: name,
    scopeTypeKey: label.toLowerCase().replace(/\s+/g, "-"),
    label,
    rateSource: source,
    rateSourceLabel: label,
  };
}

describe("Sprint 11A trust foundation", () => {
  describe("Test A — Benchmark warning", () => {
    it("shows benchmark banner when retaining wall uses industry benchmark", () => {
      const banner = resolveRateSourceBanner([
        rateLine("Retaining Wall", "template_benchmark", "Retaining Wall"),
      ]);
      expect(banner?.kind).toBe("all_benchmark");
      expect(banner?.message).toMatch(/industry benchmarks/i);
      expect(banner?.perScopeLines[0]?.label).toBe("Industry benchmark");
    });
  });

  describe("Test B — Saved rate", () => {
    it("shows saved rate for deck without benchmark warning", () => {
      const banner = resolveRateSourceBanner([
        rateLine("Deck", "scope_rate", "Deck"),
      ]);
      expect(banner?.kind).toBe("all_saved");
      expect(banner?.perScopeLines[0]?.label).toBe("Your saved Deck rate");
    });
  });

  describe("Test C — Mixed rates", () => {
    it("shows mixed banner with per-scope sources", () => {
      const banner = resolveRateSourceBanner([
        rateLine("Deck", "scope_rate", "Deck"),
        rateLine("Retaining Wall", "template_benchmark", "Retaining Wall"),
      ]);
      expect(banner?.kind).toBe("mixed");
      expect(banner?.message).toMatch(/some scopes use your rates/i);
      expect(banner?.perScopeLines).toHaveLength(2);
    });
  });

  describe("Test D — Unknown quality", () => {
    it("does not classify finish note as discovery when quality synonyms used", async () => {
      const result = await classifyAssistantIntent("Make it premium finish");
      expect(result.intent).toBe("update_finish_level");
    });
  });

  describe("Test E — What's included", () => {
    it("classifies what's included question", async () => {
      const result = await classifyAssistantIntent("What's included?");
      expect(result.intent).toBe("ask_question");
      expect(result.extractedPayload).toMatchObject({
        questionType: "whats_included",
      });
    });

    it("classifies what's excluded question", async () => {
      const result = await classifyAssistantIntent("What is excluded?");
      expect(result.intent).toBe("ask_question");
      expect(result.extractedPayload).toMatchObject({
        questionType: "whats_excluded",
      });
    });

    it("classifies assumptions question", async () => {
      const result = await classifyAssistantIntent(
        "What assumptions are you making?"
      );
      expect(result.intent).toBe("ask_question");
      expect(result.extractedPayload).toMatchObject({
        questionType: "assumptions",
      });
    });
  });

  describe("Test F — Client supplied materials", () => {
    it("classifies client supplies tiles and vanity as fact update", async () => {
      const result = await classifyAssistantIntent(
        "Client supplies tiles and vanity.",
        {
          hasConfirmedScopes: true,
          workAreaNames: ["Bathroom renovation"],
          scopes: [
            {
              scopeId: retainingScopeId,
              scopeName: "Bathroom renovation",
              workAreaTypeKey: "Bathroom renovation",
              answers: {},
            },
          ],
        }
      );
      expect(result.intent).toBe("update_existing_fact");
    });
  });

  describe("Test G — Remove command", () => {
    it("classifies forget the retaining wall as exclude", async () => {
      const result = await classifyAssistantIntent("Forget the retaining wall.", {
        workAreaNames: ["Retaining wall", "Deck"],
        hasConfirmedScopes: true,
      });
      expect(result.intent).toBe("exclude_work_area");
      expect(result.confidence).toBeGreaterThanOrEqual(0.8);
    });
  });

  describe("Test H — Command synonyms", () => {
    it("classifies size update synonyms", async () => {
      const result = await classifyAssistantIntent("Actually it's 29m² deck area", {
        hasConfirmedScopes: true,
        workAreaNames: ["Deck"],
        scopes: [
          {
            scopeId: deckScopeId,
            scopeName: "Deck",
            workAreaTypeKey: "Deck",
            answers: { "deck.area_m2": "24" },
          },
        ],
      });
      expect(result.intent).toBe("update_existing_fact");
    });

    it("classifies labour only materials command", async () => {
      const result = await classifyAssistantIntent("Labour only on the deck", {
        hasConfirmedScopes: true,
        workAreaNames: ["Deck"],
        scopes: [
          {
            scopeId: deckScopeId,
            scopeName: "Deck",
            workAreaTypeKey: "Deck",
            answers: {},
          },
        ],
      });
      expect(result.intent).toBe("update_existing_fact");
    });
  });
});
