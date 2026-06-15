import { describe, expect, it } from "vitest";
import { getNextAssistantTurn } from "@/lib/assistant-v2/get-next-assistant-turn";
import {
  resolveAssistantFlowState,
  flowBlocksSiteConditions,
  describeFlowStatusMessage,
} from "@/lib/assistant-v2/flow/resolve-assistant-flow-state";
import { resolveAssistantStage } from "@/lib/assistant-v2/stages/resolve-assistant-stage";
import {
  getMissingRequiredFactsForWorkArea,
  buildScopeMissingFactsMessage,
} from "@/lib/assistant-v2/stages/required-fact-gating";
import { applyInferredFacts } from "@/lib/assistant-v2/facts/infer-related-facts";
import { extractProjectScopeFactsDeterministic } from "@/lib/assistant-v2/extraction/extract-project-scope-facts";
import { resolveScopePricingState } from "@/lib/scopes/pricing-state";
import {
  buildPartialEstimateMessage,
  resolveWorkAreasPricingReadiness,
} from "@/lib/assistant-v2/flow/pricing-readiness";
import {
  evaluateProjectCompleteness,
  describeCompletenessStatus,
} from "@/lib/assistant-v2/completeness/evaluate-project-completeness";
import { resolveRateSourceBanner } from "@/lib/cost-engine/resolve-rate-source-banner";

const EXACT_PROMPT =
  "7m by 3m timber deck with single step and pergola, also a new 3m fence with gate, and new retaining wall (6m long by 1.8m high) including all excavation";

function deckAnswersFromExtraction() {
  const extracted = extractProjectScopeFactsDeterministic(EXACT_PROMPT);
  const deck = extracted.workAreas.find((w) => w.scopeTypeKey === "Deck");
  const answers: Record<string, string> = {};
  for (const fact of deck?.facts ?? []) {
    answers[fact.key] = fact.value;
  }
  return applyInferredFacts(answers);
}

function fenceAnswersFromExtraction() {
  const extracted = extractProjectScopeFactsDeterministic(EXACT_PROMPT);
  const fence = extracted.workAreas.find((w) => w.scopeTypeKey === "Fence");
  const answers: Record<string, string> = {};
  for (const fact of fence?.facts ?? []) {
    answers[fact.key] = fact.value;
  }
  return applyInferredFacts(answers);
}

function retainingAnswersFromExtraction() {
  const extracted = extractProjectScopeFactsDeterministic(EXACT_PROMPT);
  const wall = extracted.workAreas.find((w) => w.scopeTypeKey === "Retaining Wall");
  const answers: Record<string, string> = {};
  for (const fact of wall?.facts ?? []) {
    answers[fact.key] = fact.value;
  }
  return applyInferredFacts(answers);
}

describe("Sprint 13D.4 — flow intelligence", () => {
  describe("Exact prompt QA", () => {
    const deckAnswers = deckAnswersFromExtraction();
    const fenceAnswers = fenceAnswersFromExtraction();
    const retainingAnswers = retainingAnswersFromExtraction();

    it("extracts deck, fence and retaining wall facts from prompt", () => {
      expect(deckAnswers["deck.length_m"]).toBe("7");
      expect(deckAnswers["deck.width_m"]).toBe("3");
      expect(deckAnswers["deck.area_m2"]).toBe("21");
      expect(deckAnswers["deck.has_stairs"]).toBe("yes");
      expect(deckAnswers["deck.has_pergola"]).toBe("yes");

      expect(fenceAnswers["fence.length_m"]).toBe("3");
      expect(fenceAnswers["fence.gate_included"]).toBe("yes");
      expect(fenceAnswers["fence.height_m"]).toBeUndefined();

      expect(retainingAnswers["retaining_wall.length_m"]).toBe("6");
      expect(retainingAnswers["retaining_wall.height_m"]).toBe("1.8");
      expect(retainingAnswers["retaining_wall.excavation_included"]).toBe("yes");
    });

    it("enforces master flow order — quality before required details", () => {
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

      const unknownQuality = resolveAssistantFlowState({
        workAreas,
        qualityLevel: "unknown",
        selectedConstraintSlugs: [],
        declinedConstraintSlugs: [],
      });
      expect(unknownQuality.state).toBe("needs_quality_confirmation");

      const withQuality = resolveAssistantFlowState({
        workAreas,
        qualityLevel: "standard",
        selectedConstraintSlugs: [],
        declinedConstraintSlugs: [],
      });
      expect(withQuality.state).toBe("needs_required_scope_details");
      expect(flowBlocksSiteConditions(withQuality.state)).toBe(true);
    });

    it("asks required scope batch after quality is set", () => {
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

    it("does not ask deck level when height proves elevation", () => {
      const answers = applyInferredFacts({
        "deck.area_m2": "20",
        "deck.material_type": "treated_pine",
        "deck.height_m": "1.2",
      });
      const missing = getMissingRequiredFactsForWorkArea("Deck", answers, {
        projectQualityLevel: "standard",
      });
      expect(missing.map((f) => f.key)).not.toContain("deck.level_type");
    });

    it("identifies fence missing height and type", () => {
      const missing = getMissingRequiredFactsForWorkArea("Fence", fenceAnswers);
      const keys = missing.map((f) => f.key);
      expect(keys).toContain("fence.height_m");
      expect(
        keys.some((k) => k === "fence.fence_type" || k === "fence.material_type")
      ).toBe(true);

      const message = buildScopeMissingFactsMessage(
        "Fence",
        "Fence",
        fenceAnswers
      );
      expect(message).toMatch(/height and type/i);
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
        qualityLevel: "standard",
        selectedConstraintSlugs: [],
        declinedConstraintSlugs: [],
      });

      const status = describeCompletenessStatus(result, {
        flowState: "needs_required_scope_details",
      });
      expect(status.title).toMatch(/before pricing this properly/i);
    });

    it("renders a single combined rate source banner", () => {
      const banner = resolveRateSourceBanner([
        {
          workAreaName: "Deck",
          label: "Deck",
          rateSource: "scope_rate",
        },
        {
          workAreaName: "Retaining Wall",
          label: "Retaining Wall",
          rateSource: "scope_rate",
        },
      ]);
      expect(banner?.message).toMatch(/saved rates/i);
      expect(banner?.perScopeLines).toHaveLength(2);
    });
  });

  describe("Regression QA", () => {
    it("deck only with standard quality — core facts priceable", () => {
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

    it("deck only — quality asked before required details when unknown", () => {
      const stage = resolveAssistantStage({
        workAreas: [
          {
            scopeId: "d1",
            scopeName: "Deck",
            workAreaTypeKey: "Deck",
            answers: deckAnswersFromExtraction(),
            included: true,
          },
        ],
        qualityLevel: "unknown",
        selectedConstraintSlugs: [],
        declinedConstraintSlugs: [],
      });
      expect(stage.state).toBe("needs_quality_confirmation");
    });

    it("fence only — asks height and type after quality set", () => {
      const missing = getMissingRequiredFactsForWorkArea("Fence", {
        "fence.length_m": "10",
      });
      expect(missing.map((f) => f.key)).toEqual(
        expect.arrayContaining(["fence.height_m"])
      );
    });

    it("bathroom + kitchen — required facts gate before constraints", () => {
      const stage = resolveAssistantFlowState({
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
        qualityLevel: "standard",
        selectedConstraintSlugs: [],
        declinedConstraintSlugs: [],
      });
      expect(flowBlocksSiteConditions(stage.state)).toBe(true);
      expect(stage.state).toBe("needs_required_scope_details");
    });

    it("custom scope triggers pricing confirmation path when facts complete", () => {
      const readiness = resolveWorkAreasPricingReadiness(
        [
          {
            scopeId: "c1",
            scopeName: "Custom pergola",
            workAreaTypeKey: "Custom Scope",
            answers: { "custom.description": "Pergola" },
            included: true,
          },
        ],
        "standard"
      );
      expect(readiness[0]?.issue).toBe("custom");
    });

    it("partial estimate message explains excluded scopes", () => {
      const message = buildPartialEstimateMessage({
        included: ["Deck", "Retaining Wall"],
        excluded: [
          { scopeName: "Fence", reason: "type/height before I can include it" },
        ],
      });
      expect(message).toMatch(/Deck and Retaining Wall included/i);
      expect(message).toMatch(/Fence needs/i);
    });

    it("optional refinement status only after estimate usable", () => {
      const requiredStatus = describeFlowStatusMessage("needs_required_scope_details");
      expect(requiredStatus.title).toMatch(/before pricing this properly/i);
      expect(requiredStatus.title).not.toMatch(/sharpen/i);

      const refineStatus = describeFlowStatusMessage("optional_refinement", {
        hasUsefulGaps: true,
      });
      expect(refineStatus.title).toMatch(/sharpen/i);
    });
  });
});
