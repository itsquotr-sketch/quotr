import { describe, expect, it } from "vitest";
import { extractFactsFromNotes } from "@/lib/ai/discovery/fact-rules";
import { evaluateProjectCompleteness } from "@/lib/assistant-v2/completeness/evaluate-project-completeness";
import { getNextAssistantTurn } from "@/lib/assistant-v2/get-next-assistant-turn";
import { calculateQuickEstimateV1 } from "@/lib/cost-engine/calculate-quick-estimate-v1";
import type { QuickEstimateInput } from "@/lib/cost-engine/quick-estimate-input";
import { buildMissingInformation } from "@/lib/cost-engine/build-missing-information";
import {
  buildMultiScopePricingGuidance,
  resolveScopePricingState,
} from "@/lib/scopes/pricing-state";
import {
  isFinishLevelKnown,
  shouldSkipFinishLevelQuestion,
} from "@/lib/scopes/resolve-effective-finish";
import { getMissingRequiredFacts } from "@/lib/scopes/missing-facts";
import { calculateFromTemplate } from "@/lib/scope-templates/calculate";
import { getScopeTemplateByWorkAreaType } from "@/lib/scope-templates";

const BATHROOM_PROMPT =
  "New bathroom, around 5m2 floor area, tiling, new shower, vanity and toilet.";

const FULL_PROMPT =
  "New bathroom, around 5m2 floor area, tiling, new shower, vanity, and toilet. Also a new kitchen, including full demolition of existing kitchen.";

function baseQuickEstimateInput(
  overrides: Partial<QuickEstimateInput> = {}
): QuickEstimateInput {
  return {
    project: { id: "proj-1", title: "Test project" },
    organisationId: "org-1",
    quickEstimate: {
      id: "qe-1",
      quality_level: "standard",
      client_budget: null,
      target_margin_percent: 20,
    },
    workAreas: [],
    scopeQuestions: [],
    constraints: [],
    scopeRates: [],
    labourRates: [],
    materialRates: [],
    subcontractorRates: [],
    packageRates: [],
    discovery: null,
    sourceNotesLength: 100,
    siteConstraintsAssessed: true,
    answeredQuestionKeys: new Set(),
    allWorkAreasExcluded: false,
    questionsAnswered: 0,
    questionsTotal: 0,
    targetMarginPercent: 20,
    contingencyPercent: 5,
    ...overrides,
  };
}

describe("Sprint 12B hotfix", () => {
  describe("Test A — bathroom floor area capture", () => {
    it("extracts bathroom.floor_area_m2 = 5 from notes", () => {
      const facts = extractFactsFromNotes(BATHROOM_PROMPT);
      const floorFact = facts.find((f) => f.key === "bathroom.floor_area_m2");
      expect(floorFact?.value).toMatch(/5/);
    });

    it("does not ask for floor area when already captured", () => {
      const missing = getMissingRequiredFacts("Bathroom renovation", {
        "bathroom.floor_area_m2": "5",
        "bathroom.finish_level": "standard",
        "bathroom.layout_changing": "no",
        "bathroom.tile_extent": "full",
      });
      expect(missing.map((f) => f.key)).not.toContain("bathroom.floor_area_m2");
    });
  });

  describe("Test B — bathroom finish dedupe", () => {
    it("skips finish level question when project quality is standard", () => {
      expect(
        shouldSkipFinishLevelQuestion({
          factKey: "bathroom.finish_level",
          scopeTypeKey: "Bathroom renovation",
          answers: {},
          projectQualityLevel: "standard",
        })
      ).toBe(true);

      expect(
        isFinishLevelKnown({
          scopeTypeKey: "Bathroom renovation",
          answers: {},
          projectQualityLevel: "standard",
        })
      ).toBe(true);
    });
  });

  describe("Test C — kitchen detection facts", () => {
    it("extracts demolition_required from kitchen notes", () => {
      const facts = extractFactsFromNotes(FULL_PROMPT);
      const demo = facts.find((f) => f.key === "kitchen.demolition_required");
      expect(demo?.value).toBe("yes");
    });

    it("kitchen scope has required questions", () => {
      const missing = getMissingRequiredFacts("Kitchen renovation", {
        "kitchen.demolition_required": "yes",
      });
      expect(missing.map((f) => f.key)).toEqual(
        expect.arrayContaining([
          "kitchen.kitchen_size_type",
          "kitchen.layout_changing",
          "kitchen.appliances_client_supplied",
          "kitchen.benchtop_type",
          "kitchen.plumbing_changes",
          "kitchen.electrical_changes",
        ])
      );
    });
  });

  describe("Test D — bathroom + kitchen estimate", () => {
    it("produces partial estimate with kitchen rough allowance", () => {
      const bathroomTemplate = getScopeTemplateByWorkAreaType("Bathroom renovation");
      const kitchenTemplate = getScopeTemplateByWorkAreaType("Kitchen renovation");
      expect(bathroomTemplate).toBeDefined();
      expect(kitchenTemplate).toBeDefined();

      const bathroomCalc = calculateFromTemplate(
        bathroomTemplate!,
        {
          "bathroom.floor_area_m2": "5",
          "bathroom.finish_level": "standard",
          "bathroom.layout_changing": "no",
          "bathroom.tile_extent": "full",
        },
        { scopeRates: [], labourRates: [], materialRates: [], subcontractorRates: [], packageRates: [] },
        "standard"
      );

      const kitchenCalc = calculateFromTemplate(
        kitchenTemplate!,
        {
          "kitchen.kitchen_size_type": "medium",
          "kitchen.demolition_required": "yes",
        },
        { scopeRates: [], labourRates: [], materialRates: [], subcontractorRates: [], packageRates: [] },
        "standard"
      );

      expect(bathroomCalc.centralEstimate).toBeGreaterThan(0);
      expect(kitchenCalc.centralEstimate).toBeGreaterThan(0);
      expect(kitchenCalc.assumptions.some((a) => /rough/i.test(a))).toBe(true);

      const result = calculateQuickEstimateV1(
        baseQuickEstimateInput({
          workAreas: [
            {
              scopeId: "b1",
              name: "Bathroom",
              workAreaTypeKey: "Bathroom renovation",
              answeredFromNotes: ["bathroom.floor_area_m2"],
              answers: {
                "bathroom.floor_area_m2": "5",
                "bathroom.finish_level": "standard",
                "bathroom.layout_changing": "no",
                "bathroom.tile_extent": "full",
              },
            },
            {
              scopeId: "k1",
              name: "Kitchen",
              workAreaTypeKey: "Kitchen renovation",
              answeredFromNotes: ["kitchen.demolition_required"],
              answers: {
                "kitchen.kitchen_size_type": "medium",
                "kitchen.demolition_required": "yes",
              },
            },
          ],
        })
      );

      expect(result.canCalculate).toBe(true);
      expect(result.centralEstimate).toBeGreaterThan(bathroomCalc.centralEstimate);
      expect(
        result.rateSourceLines?.some(
          (line) =>
            line.workAreaTypeKey === "Kitchen renovation" &&
            line.rateSourceLabel === "Rough allowance"
        )
      ).toBe(true);
    });
  });

  describe("Test E — question order", () => {
    it("asks scope questions before site constraints", () => {
      const turn = getNextAssistantTurn({
        scopeGroups: [
          {
            scopeId: "b1",
            scopeName: "Bathroom",
            scopeTypeName: "Bathroom renovation",
            questions: [],
          },
          {
            scopeId: "k1",
            scopeName: "Kitchen",
            scopeTypeName: "Kitchen renovation",
            questions: [
              {
                id: "q1",
                project_scope_id: "k1",
                question: "Is this a small, medium or large kitchen?",
                question_key: "kitchen.kitchen_size_type",
                question_type: "select",
                options: [],
                unit: null,
                scope_answers: [],
              },
            ],
          },
        ],
        workAreaTypeKeys: ["Bathroom renovation", "Kitchen renovation"],
        discovery: null,
        scopeQuestions: [
          {
            id: "q1",
            project_scope_id: "k1",
            question: "Is this a small, medium or large kitchen?",
            question_key: "kitchen.kitchen_size_type",
            question_type: "select",
            options: [],
            unit: null,
            scope_answers: [],
          },
        ],
        selectedConstraintSlugs: [],
        declinedConstraintSlugs: new Set(["tight-access", "poor-parking", "occupied-house", "restricted-hours", "rubbish-removal-required"]),
        qualityLevel: "standard",
        answeredQuestionKeys: new Set(["tight-access", "poor-parking", "occupied-house", "restricted-hours", "rubbish-removal-required"]),
      });

      expect(turn?.kind).toBe("scope_batch");
    });

    it("completeness prioritises scope questions over constraints", () => {
      const result = evaluateProjectCompleteness({
        workAreas: [
          {
            scopeId: "k1",
            scopeName: "Kitchen",
            workAreaTypeKey: "Kitchen renovation",
            answers: { "kitchen.demolition_required": "yes" },
            included: true,
          },
        ],
        qualityLevel: "standard",
        selectedConstraintSlugs: [],
        declinedConstraintSlugs: [],
        discoveryConstraintSlugs: ["tight-access"],
      });

      expect(result.nextBestAction.type).toBe("ask_questions");
      expect(result.projectStatus).toBe("needs_questions");
    });
  });

  describe("Test F — unsupported/custom scope", () => {
    it("flags custom scope without fake price", () => {
      const state = resolveScopePricingState({
        workAreaTypeKey: "Custom Scope",
        scopeName: "Wine cellar",
      });
      expect(state.userLabel).toBe("Needs pricing");
      expect(state.canIncludeInEstimate).toBe(false);
    });

    it("builds multi-scope kitchen guidance message", () => {
      const guidance = buildMultiScopePricingGuidance({
        workAreas: [
          { scopeName: "Bathroom", workAreaTypeKey: "Bathroom renovation" },
          { scopeName: "Kitchen", workAreaTypeKey: "Kitchen renovation" },
        ],
      });
      expect(guidance?.message).toMatch(/Bathroom renovation and Kitchen renovation/i);
      expect(guidance?.options).toHaveLength(3);
    });
  });

  describe("Missing information respects global finish", () => {
    it("does not list finish level when project quality is set", () => {
      const missing = buildMissingInformation({
        effectiveQualityLevel: "standard",
        workAreas: [
          {
            scopeId: "b1",
            name: "Bathroom",
            workAreaTypeKey: "Bathroom renovation",
            answeredFromNotes: [],
            answers: {
              "bathroom.floor_area_m2": "5",
              "bathroom.layout_changing": "no",
              "bathroom.tile_extent": "full",
            },
          },
        ],
      });
      expect(missing.some((m) => /finish level/i.test(m))).toBe(false);
    });
  });
});
