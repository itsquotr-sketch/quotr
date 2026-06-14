import { describe, expect, it } from "vitest";
import {
  getDiscoveryQuestionDefsForWorkArea,
  getGenericDiscoveryQuestionDefs,
} from "@/lib/assistant-v2/discovery/generic-scope-discovery";
import {
  measurementsToFactUpdates,
  resolveMeasurements,
  shouldSuppressQuestionForDerivedValue,
} from "@/lib/assistant-v2/facts/measurement-resolver";
import { extractMessageActionsDeterministic } from "@/lib/assistant-v2/intent/extract-message-actions";
import { getCurrentMissingItems } from "@/lib/assistant-v2/missing/get-current-missing-items";
import { buildRefinementPathForward } from "@/lib/assistant-v2/refinement/build-refinement-path-forward";
import { getDependentFollowUpQuestions } from "@/lib/assistant-v2/questions/get-dependent-follow-up-questions";
import { getKnownFactsForScope } from "@/lib/assistant-v2/facts/get-known-facts-for-scope";
import { computeScopeCompleteness } from "@/lib/assistant-v2/compute-information-completeness";
import { getQuestionDefsForWorkAreaType } from "@/lib/project-assistant-questions";

describe("Sprint 11D — conversational intelligence hardening", () => {
  describe("TEST 1 — Fence scope discovery", () => {
    it("generates fence-specific questions for Fence work area", () => {
      const defs = getQuestionDefsForWorkAreaType("Fence", "Fence");
      const keys = defs.map((d) => d.key);
      expect(keys).toContain("fence.length_m");
      expect(keys).toContain("fence.material_type");
      expect(defs.length).toBeGreaterThanOrEqual(3);
    });

    it("extracts 20m length from timber fence message", () => {
      const result = extractMessageActionsDeterministic(
        [
          {
            scopeId: "11111111-1111-1111-1111-111111111111",
            scopeName: "Fence",
            workAreaTypeKey: "Fence",
            answers: {},
          },
        ],
        "Build a 20m timber fence."
      );
      const lengthUpdate = result.actions.find(
        (a) => a.factKey === "fence.length_m"
      );
      expect(lengthUpdate?.value).toBe("20");
    });
  });

  describe("TEST 2 — Measurement resolver", () => {
    it("derives 28m² from 7m x 4m deck", () => {
      const m = resolveMeasurements("Deck is 7m x 4m");
      expect(m.length_m).toBe(7);
      expect(m.width_m).toBe(4);
      expect(m.area_m2).toBe(28);
    });

    it("suppresses area question when length and width are known", () => {
      const suppressed = shouldSuppressQuestionForDerivedValue("deck.area_m2", {
        "deck.length_m": "7",
        "deck.width_m": "4",
      });
      expect(suppressed).toBe(true);
    });

    it("stores area from deck dimension message", () => {
      const result = extractMessageActionsDeterministic(
        [
          {
            scopeId: "22222222-2222-2222-2222-222222222222",
            scopeName: "Deck",
            workAreaTypeKey: "Deck",
            answers: {},
          },
        ],
        "Deck is 7m x 4m."
      );
      const areaUpdate = result.actions.find((a) => a.factKey === "deck.area_m2");
      expect(areaUpdate?.value).toBe("28");
    });
  });

  describe("TEST 3 — Multi-field update", () => {
    it("updates both deck height and tight access from one message", () => {
      const result = extractMessageActionsDeterministic(
        [
          {
            scopeId: "33333333-3333-3333-3333-333333333333",
            scopeName: "Deck",
            workAreaTypeKey: "Deck",
            answers: {},
          },
        ],
        "Deck is elevated 2m and access is tight."
      );
      const height = result.actions.find((a) => a.factKey === "deck.height_m");
      const access = result.actions.find(
        (a) => a.factKey === "deck.tight_access" || a.constraintSlug === "tight-access"
      );
      expect(height?.value).toBe("2");
      expect(access).toBeDefined();
      expect(result.actions.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("TEST 4 — Add More Detail never dead-ends", () => {
    it("returns path forward when no missing items", () => {
      const path = buildRefinementPathForward([]);
      expect(path.message).not.toContain("No optional details left");
      expect(path.pathType).toBe("highly_refined");
      expect(path.message).toContain("strong estimate");
    });

    it("lists critical missing items when present", () => {
      const path = buildRefinementPathForward(
        getCurrentMissingItems({
          workAreas: [
            {
              scopeId: "44444444-4444-4444-4444-444444444444",
              scopeName: "Fence",
              workAreaTypeKey: "Fence",
              answers: {},
            },
          ],
        })
      );
      expect(path.pathType).toBe("missing_critical");
      expect(path.message).toContain("improve confidence");
    });
  });

  describe("TEST 5 — Confidence path visibility", () => {
    it("reports missing fence facts for partial answers", () => {
      const items = getCurrentMissingItems({
        workAreas: [
          {
            scopeId: "55555555-5555-5555-5555-555555555555",
            scopeName: "Fence",
            workAreaTypeKey: "Fence",
            answers: { "fence.length_m": "20" },
          },
        ],
      });
      const missing = items.filter((i) => i.status === "missing");
      expect(missing.length).toBeGreaterThan(0);
      expect(missing.some((i) => i.factKey.includes("material"))).toBe(true);
    });

    it("computes non-zero completeness for fence with partial answers", () => {
      const result = computeScopeCompleteness({
        workAreaTypeKey: "Fence",
        answers: { "fence.length_m": "20" },
      });
      expect(result.percent).toBeGreaterThan(0);
      expect(result.percent).toBeLessThan(100);
    });
  });

  describe("Follow-up chaining", () => {
    it("asks deck height after elevated is confirmed", () => {
      const knownFacts = getKnownFactsForScope({
        scopeId: "66666666-6666-6666-6666-666666666666",
        scopeTypeKey: "Deck",
        answers: { "deck.level_type": "elevated" },
      });
      const followUps = getDependentFollowUpQuestions({
        knownFacts,
        changedFactKey: "deck.level_type",
      });
      expect(followUps.some((q) => q.factKey.includes("height_m"))).toBe(true);
    });

    it("chains fence length → height → material", () => {
      const knownFacts = getKnownFactsForScope({
        scopeId: "77777777-7777-7777-7777-777777777777",
        scopeTypeKey: "Fence",
        answers: { "fence.length_m": "20" },
      });
      const followUps = getDependentFollowUpQuestions({ knownFacts });
      expect(followUps.some((q) => q.factKey.includes("height_m"))).toBe(true);
    });
  });

  describe("Tier 3 generic discovery", () => {
    it("generates generic questions for unknown scopes", () => {
      const defs = getGenericDiscoveryQuestionDefs("Wine cellar");
      expect(defs.length).toBeGreaterThanOrEqual(5);
      expect(defs.some((d) => d.text.toLowerCase().includes("dimension"))).toBe(
        true
      );
    });

    it("uses generic fallback for custom scope type", () => {
      const defs = getDiscoveryQuestionDefsForWorkArea("Custom Scope", "Feature wall");
      expect(defs.length).toBeGreaterThanOrEqual(5);
    });
  });

  describe("Retaining wall measurements", () => {
    it("derives wall area from length and height", () => {
      const m = resolveMeasurements("7m retaining wall 1.2m high");
      expect(m.length_m).toBe(7);
      expect(m.height_m).toBe(1.2);
      expect(m.wall_area_m2).toBe(8.4);

      const updates = measurementsToFactUpdates("retaining_wall", m);
      expect(updates.some((u) => u.factKeySuffix === "length_m")).toBe(true);
      expect(updates.some((u) => u.factKeySuffix === "height_m")).toBe(true);
    });
  });
});
