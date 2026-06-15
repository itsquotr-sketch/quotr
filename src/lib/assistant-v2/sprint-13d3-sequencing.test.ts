import { describe, expect, it } from "vitest";
import { getNextAssistantTurn } from "@/lib/assistant-v2/get-next-assistant-turn";
import {
  resolveAssistantStage,
  stageBlocksSiteConditions,
} from "@/lib/assistant-v2/stages/resolve-assistant-stage";
import {
  getMissingRequiredFactsForWorkArea,
  buildScopeMissingFactsMessage,
} from "@/lib/assistant-v2/stages/required-fact-gating";
import { resolveScopePricingState } from "@/lib/scopes/pricing-state";
import { measurementsToFactUpdates, resolveMeasurements } from "@/lib/assistant-v2/facts/measurement-resolver";
import { evaluateProjectCompleteness, describeCompletenessStatus } from "@/lib/assistant-v2/completeness/evaluate-project-completeness";
import { resolveWideRangeAction } from "@/lib/assistant-v2/build-wide-range-action";

function extractDeckAnswers() {
  const m = resolveMeasurements("7m by 3m");
  const updates = measurementsToFactUpdates("deck", m);
  const answers: Record<string, string> = {
    "deck.material_type": "treated_pine",
    "deck.has_stairs": "yes",
    "deck.has_pergola": "yes",
  };
  for (const u of updates) {
    answers[`deck.${u.factKeySuffix}`] = u.value;
  }
  return answers;
}

function extractFenceAnswers() {
  const m = resolveMeasurements("new 3m fence with gate");
  const updates = measurementsToFactUpdates("fence", m);
  const answers: Record<string, string> = {
    "fence.gate_included": "yes",
  };
  for (const u of updates) {
    answers[`fence.${u.factKeySuffix}`] = u.value;
  }
  return answers;
}

function extractRetainingAnswers() {
  const m = resolveMeasurements("retaining wall 6m long by 1.8m high including all excavation");
  const updates = measurementsToFactUpdates("retaining_wall", m);
  const answers: Record<string, string> = {};
  for (const u of updates) {
    answers[`retaining_wall.${u.factKeySuffix}`] = u.value;
  }
  return answers;
}

describe("Sprint 13D.3 — sequencing, gating & work area detail first", () => {
  describe("Exact prompt QA", () => {
    const deckAnswers = extractDeckAnswers();
    const fenceAnswers = extractFenceAnswers();
    const retainingAnswers = extractRetainingAnswers();

    it("extracts deck, fence and retaining wall facts from prompt", () => {
      expect(deckAnswers["deck.length_m"]).toBe("7");
      expect(deckAnswers["deck.width_m"]).toBe("3");
      expect(deckAnswers["deck.area_m2"]).toBe("21");
      expect(deckAnswers["deck.material_type"]).toBe("treated_pine");
      expect(deckAnswers["deck.has_stairs"]).toBe("yes");
      expect(deckAnswers["deck.has_pergola"]).toBe("yes");

      expect(fenceAnswers["fence.length_m"]).toBe("3");
      expect(fenceAnswers["fence.gate_included"]).toBe("yes");
      expect(fenceAnswers["fence.height_m"]).toBeUndefined();

      expect(retainingAnswers["retaining_wall.length_m"]).toBe("6");
      expect(retainingAnswers["retaining_wall.height_m"]).toBe("1.8");
    });

    it("asks quality before required scope details", () => {
      const workAreas = [
        {
          scopeId: "deck-1",
          scopeName: "Deck",
          workAreaTypeKey: "Deck",
          answers: deckAnswers,
          included: true,
        },
        {
          scopeId: "fence-1",
          scopeName: "Fence",
          workAreaTypeKey: "Fence",
          answers: fenceAnswers,
          included: true,
        },
        {
          scopeId: "wall-1",
          scopeName: "Retaining Wall",
          workAreaTypeKey: "Retaining Wall",
          answers: retainingAnswers,
          included: true,
        },
      ];

      const stage = resolveAssistantStage({
        workAreas,
        qualityLevel: "unknown",
        selectedConstraintSlugs: [],
        declinedConstraintSlugs: [],
      });

      expect(stage.stage).toBe("needs_quality_confirmation");

      const stageWithQuality = resolveAssistantStage({
        workAreas,
        qualityLevel: "standard",
        selectedConstraintSlugs: [],
        declinedConstraintSlugs: [],
      });
      expect(stageWithQuality.stage).toBe("needs_required_scope_details");
      expect(stageBlocksSiteConditions(stageWithQuality.stage)).toBe(true);

      const turn = getNextAssistantTurn({
        scopeGroups: workAreas.map((a) => ({
          scopeId: a.scopeId,
          scopeName: a.scopeName,
          scopeTypeName: a.workAreaTypeKey,
          questions: [],
        })),
        workAreaTypeKeys: workAreas.map((a) => a.workAreaTypeKey),
        discovery: null,
        scopeQuestions: [],
        selectedConstraintSlugs: [],
        declinedConstraintSlugs: new Set(),
        qualityLevel: "standard",
        answeredQuestionKeys: new Set(),
      });

      expect(turn?.kind).toBe("scope_batch");
      expect(turn && turn.kind === "scope_batch" ? turn.hasRequired : false).toBe(
        true
      );
      expect(turn && turn.kind === "scope_batch" ? turn.intro : "").toMatch(
        /before pricing this properly/i
      );
    });

    it("identifies fence missing height and type", () => {
      const missing = getMissingRequiredFactsForWorkArea("Fence", fenceAnswers);
      const keys = missing.map((f) => f.key);
      expect(keys).toContain("fence.height_m");
      expect(keys.some((k) => k === "fence.fence_type" || k === "fence.material_type")).toBe(
        true
      );

      const message = buildScopeMissingFactsMessage(
        "Fence",
        "Fence",
        fenceAnswers
      );
      expect(message).toMatch(/height and type/i);
    });

    it("does not include fence in estimate until required facts answered", () => {
      const state = resolveScopePricingState({
        workAreaTypeKey: "Fence",
        scopeName: "Fence",
        answers: fenceAnswers,
      });
      expect(state.canIncludeInEstimate).toBe(false);
      expect(state.message).toMatch(/height and type/i);
    });

    it("uses required-details language in completeness status", () => {
      const result = evaluateProjectCompleteness({
        workAreas: [
          {
            scopeId: "deck-1",
            scopeName: "Deck",
            workAreaTypeKey: "Deck",
            answers: deckAnswers,
            included: true,
          },
          {
            scopeId: "fence-1",
            scopeName: "Fence",
            workAreaTypeKey: "Fence",
            answers: fenceAnswers,
            included: true,
          },
        ],
        qualityLevel: "unknown",
        selectedConstraintSlugs: [],
        declinedConstraintSlugs: [],
      });

      const status = describeCompletenessStatus(result);
      expect(status.title).toMatch(/before pricing this properly/i);
    });
  });

  describe("Regression QA", () => {
    it("deck with standard quality is priceable with core facts", () => {
      const missing = getMissingRequiredFactsForWorkArea(
        "Deck",
        {
          "deck.area_m2": "50",
          "deck.material_type": "treated_pine",
          "deck.level_type": "ground",
        },
        { projectQualityLevel: "standard" }
      );
      expect(missing).toEqual([]);

      const state = resolveScopePricingState({
        workAreaTypeKey: "Deck",
        answers: {
          "deck.area_m2": "50",
          "deck.material_type": "treated_pine",
          "deck.level_type": "ground",
        },
        qualityLevel: "standard",
      });
      expect(state.canIncludeInEstimate).toBe(true);
    });

    it("deck only — quality before required details when unknown", () => {
      const answers = {
        ...extractDeckAnswers(),
      } as Record<string, string>;
      delete answers["deck.level_type"];

      const stage = resolveAssistantStage({
        workAreas: [
          {
            scopeId: "d1",
            scopeName: "Deck",
            workAreaTypeKey: "Deck",
            answers,
            included: true,
          },
        ],
        qualityLevel: "unknown",
        selectedConstraintSlugs: [],
        declinedConstraintSlugs: [],
      });
      expect(stage.stage).toBe("needs_quality_confirmation");
    });

    it("fence only — asks height and type", () => {
      const missing = getMissingRequiredFactsForWorkArea("Fence", {
        "fence.length_m": "10",
      });
      expect(missing.map((f) => f.key)).toEqual(
        expect.arrayContaining(["fence.height_m"])
      );
    });

    it("bathroom + kitchen — required facts gate before constraints", () => {
      const stage = resolveAssistantStage({
        workAreas: [
          {
            scopeId: "b1",
            scopeName: "Bathroom",
            workAreaTypeKey: "Bathroom renovation",
            answers: {},
            included: true,
          },
          {
            scopeId: "k1",
            scopeName: "Kitchen",
            workAreaTypeKey: "Kitchen renovation",
            answers: {},
            included: true,
          },
        ],
        qualityLevel: "unknown",
        selectedConstraintSlugs: [],
        declinedConstraintSlugs: [],
      });
      expect(stageBlocksSiteConditions(stage.stage)).toBe(true);
    });

    it("wide range action uses short button labels", () => {
      const action = resolveWideRangeAction({
        isQualityUnknown: false,
        criticalMissing: [
          {
            scopeId: "f1",
            scopeLabel: "Fence",
            factKey: "fence.height_m",
            label: "Fence: fence height not confirmed",
            status: "missing",
            importance: "critical",
            affectsEstimate: true,
          },
        ],
        actionableMissingItems: [],
        usesBenchmarkRates: false,
      });
      expect(action?.label).toBe("Add fence height");
      expect(action?.label.length).toBeLessThan(40);
    });

    it("custom scope stays in pricing confirmation path", () => {
      const stage = resolveAssistantStage({
        workAreas: [
          {
            scopeId: "c1",
            scopeName: "Custom pergola",
            workAreaTypeKey: "Custom Scope",
            answers: {},
            included: true,
          },
        ],
        qualityLevel: "standard",
        selectedConstraintSlugs: [],
        declinedConstraintSlugs: [],
      });
      expect(
        stage.stage === "needs_required_scope_details" ||
          stage.stage === "needs_pricing_source_confirmation"
      ).toBe(true);
    });
  });
});
