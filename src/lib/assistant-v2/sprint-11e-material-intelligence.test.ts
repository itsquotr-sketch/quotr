import { describe, expect, it } from "vitest";
import { buildEstimateTrace } from "@/lib/cost-engine/build-estimate-trace";
import { computeConfidenceScore } from "@/lib/cost-engine/confidence/score";
import { getDependentFollowUpQuestions } from "@/lib/assistant-v2/questions/get-dependent-follow-up-questions";
import { getKnownFactsForScope } from "@/lib/assistant-v2/facts/get-known-facts-for-scope";
import { contextualQuestionText } from "@/lib/assistant-v2/build-assistant-messages";
import { getQuestionDefsForWorkAreaType } from "@/lib/project-assistant-questions";
import {
  getMaterialCategoriesForScope,
  resolveMaterialCategory,
} from "@/lib/scopes/material-categories";
import type { PricingQuestion } from "@/lib/assistant-v2/get-next-pricing-question";

describe("Sprint 11E — Material Intelligence Layer", () => {
  describe("Material category architecture", () => {
    it("defines deck material categories with Not Sure", () => {
      const config = getMaterialCategoriesForScope("deck");
      expect(config?.questionText).toBe("What type of decking should I assume?");
      expect(config?.categories.map((c) => c.label)).toEqual([
        "Treated Pine",
        "Hardwood Timber",
        "Composite",
        "Not Sure",
      ]);
      expect(config?.defaultCategoryKey).toBe("treated_pine");
    });

    it("defines fence material categories", () => {
      const config = getMaterialCategoriesForScope("fence");
      expect(config?.categories.map((c) => c.label)).toContain("Steel");
      expect(config?.categories.map((c) => c.label)).toContain("Not Sure");
      expect(config?.defaultCategoryKey).toBe("timber");
    });

    it("defines retaining wall material categories", () => {
      const config = getMaterialCategoriesForScope("retaining_wall");
      expect(config?.questionText).toBe(
        "What type of retaining wall should I assume?"
      );
      expect(config?.categories.map((c) => c.label)).toContain("Keystone");
    });
  });

  describe("QA — Fence", () => {
    it("generates fence questions with scope-specific material prompt", () => {
      const defs = getQuestionDefsForWorkAreaType("Fence", "Fence");
      const material = defs.find((d) => d.key === "fence.material_type");
      expect(material?.text).toBe("What type of fencing should I assume?");
      expect(material?.options?.some((o) => o.label === "Not Sure")).toBe(true);
    });

    it("chains fence length → height → material follow-ups", () => {
      const knownFacts = getKnownFactsForScope({
        scopeId: "fence-1",
        scopeTypeKey: "Fence",
        answers: { "fence.length_m": "20" },
      });
      const followUps = getDependentFollowUpQuestions({ knownFacts });
      expect(followUps.some((q) => q.factKey.includes("height_m"))).toBe(true);
    });

    it("resolves Not Sure to standard timber fence benchmark", () => {
      const resolved = resolveMaterialCategory({
        scopeTypeKey: "fence",
        answers: { "fence.material_type": "unknown" },
      });
      expect(resolved?.categoryValue).toBe("timber");
      expect(resolved?.categoryLabel).toBe("Timber");
      expect(resolved?.source).toBe("assumed");
    });
  });

  describe("QA — Deck", () => {
    it("uses scope-specific decking question in legacy question map", () => {
      const question: PricingQuestion = {
        questionId: "q1",
        scopeId: "deck-1",
        scopeName: "Deck",
        workAreaTypeKey: "Deck",
        questionKey: "deck.material_type",
        questionText: "Deck material",
        inputType: "select",
        options: [],
        required: true,
      };
      expect(contextualQuestionText(question)).toBe(
        "What type of decking should I assume?"
      );
    });

    it("stores hardwood timber category from user selection", () => {
      const resolved = resolveMaterialCategory({
        scopeTypeKey: "deck",
        answers: { "deck.material_type": "hardwood_timber" },
      });
      expect(resolved?.categoryLabel).toBe("Hardwood Timber");
      expect(resolved?.source).toBe("user_provided");
    });

    it("awards higher confidence when material is known vs assumed", () => {
      const known = computeConfidenceScore({
        workAreas: [
          {
            scopeId: "deck-1",
            name: "Deck",
            workAreaTypeKey: "Deck",
            answers: {
              "deck.area_m2": "20",
              "deck.material_type": "composite",
              "deck.level_type": "ground",
              "deck.finish_level": "standard",
            },
            answeredFromNotes: [],
          },
        ],
        qualityLevel: "standard",
        rateSources: ["template_benchmark"],
        clientBudget: null,
        constraintsAssessed: false,
        hasCustomScope: false,
      });

      const assumed = computeConfidenceScore({
        workAreas: [
          {
            scopeId: "deck-2",
            name: "Deck",
            workAreaTypeKey: "Deck",
            answers: {
              "deck.area_m2": "20",
              "deck.material_type": "unknown",
              "deck.level_type": "ground",
              "deck.finish_level": "standard",
            },
            answeredFromNotes: [],
          },
        ],
        qualityLevel: "standard",
        rateSources: ["template_benchmark"],
        clientBudget: null,
        constraintsAssessed: false,
        hasCustomScope: false,
      });

      expect(known.positiveSignals).toContain("MATERIAL_SPECIFIED");
      expect(assumed.positiveSignals).toContain("MATERIAL_ASSUMED");
      expect(known.score).toBeGreaterThan(assumed.score);
    });
  });

  describe("QA — Retaining Wall", () => {
    it("records material category in estimate trace", () => {
      const trace = buildEstimateTrace({
        workAreas: [
          {
            scopeId: "rw-1",
            name: "Retaining Wall",
            workAreaTypeKey: "Retaining Wall",
            answers: {
              "retaining_wall.length_m": "10",
              "retaining_wall.height_m": "1.2",
              "retaining_wall.material": "stone",
              "retaining_wall.has_drainage": "yes",
              "retaining_wall.machine_access": "yes",
            },
            answeredFromNotes: [],
          },
        ],
        scopeKey: "retaining_wall",
        quantity: 12,
        unit: "m²",
        baseRate: 850,
        rateSource: "template_benchmark",
        centralEstimate: 10200,
        baseDescription: "Retaining wall",
        constraintLabels: [],
        finishAdjustments: [],
        contingencyPercent: 5,
        marginPercent: 20,
        confidenceScore: 60,
        rangeFactor: 0.25,
        costLow: 9000,
        costHigh: 11500,
        sellLow: 10800,
        sellHigh: 13800,
        missingCriticalFacts: [],
        finishLevel: "standard",
      });

      expect(trace.materialCategories).toHaveLength(1);
      expect(trace.materialCategories?.[0]).toMatchObject({
        categoryLabel: "Stone",
        sourceLabel: "User Provided",
      });
    });

    it("records assumed material when Not Sure selected", () => {
      const trace = buildEstimateTrace({
        workAreas: [
          {
            scopeId: "rw-2",
            name: "Retaining Wall",
            workAreaTypeKey: "Retaining Wall",
            answers: {
              "retaining_wall.length_m": "10",
              "retaining_wall.height_m": "1.2",
              "retaining_wall.material": "unknown",
              "retaining_wall.has_drainage": "yes",
              "retaining_wall.machine_access": "yes",
            },
            answeredFromNotes: [],
          },
        ],
        scopeKey: "retaining_wall",
        quantity: 12,
        unit: "m²",
        baseRate: 850,
        rateSource: "template_benchmark",
        centralEstimate: 10200,
        baseDescription: "Retaining wall",
        constraintLabels: [],
        finishAdjustments: [],
        contingencyPercent: 5,
        marginPercent: 20,
        confidenceScore: 55,
        rangeFactor: 0.28,
        costLow: 9000,
        costHigh: 11500,
        sellLow: 10800,
        sellHigh: 13800,
        missingCriticalFacts: [],
        finishLevel: "standard",
      });

      expect(trace.materialCategories?.[0]).toMatchObject({
        categoryLabel: "Timber",
        sourceLabel: "Assumed",
      });
    });
  });

  describe("QA — Bathroom", () => {
    it("uses finish level as material category question", () => {
      const config = getMaterialCategoriesForScope("bathroom_renovation");
      expect(config?.factKey).toBe("bathroom.finish_level");
      expect(config?.questionText).toContain("finish level");
    });
  });
});
