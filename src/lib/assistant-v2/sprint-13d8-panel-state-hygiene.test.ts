import { describe, expect, it } from "vitest";
import {
  getCriticalOrUsefulMissing,
  getCurrentMissingItems,
} from "@/lib/assistant-v2/missing/get-current-missing-items";
import { resolveFlowPanelAction } from "@/lib/assistant-v2/flow/resolve-flow-panel-action";
import { resolveAssistantFlowState } from "@/lib/assistant-v2/flow/resolve-assistant-flow-state";
import { evaluateConfidence } from "@/lib/assistant-v2/confidence/evaluate-confidence";
import { isScopeFactKnown } from "@/lib/scopes/resolve-effective-finish";

const KITCHEN_BATHROOM_PROMPT_AREAS = [
  {
    scopeId: "kitchen-1",
    scopeName: "Kitchen",
    workAreaTypeKey: "Kitchen renovation",
    included: true,
    answers: {
      "kitchen.floor_area_m2": "10",
      "kitchen.kitchen_size_type": "medium",
      "kitchen.layout_changing": "no",
      "kitchen.appliances_client_supplied": "no",
      "kitchen.benchtop_type": "laminate",
      "kitchen.plumbing_changes": "no",
      "kitchen.electrical_changes": "yes",
    },
  },
  {
    scopeId: "bathroom-1",
    scopeName: "Bathroom",
    workAreaTypeKey: "Bathroom renovation",
    included: true,
    answers: {
      "bathroom.floor_area_m2": "5",
      "bathroom.layout_changing": "no",
      "bathroom.tile_extent": "full",
      "bathroom.plumbing_relocation": "no",
      "bathroom.fixtures_client_supplied": "no",
    },
  },
] as const;

describe("Sprint 13D.8 — panel state hygiene", () => {
  it("isScopeFactKnown treats global premium as bathroom finish_level", () => {
    expect(
      isScopeFactKnown(
        "Bathroom renovation",
        "bathroom.finish_level",
        {},
        "premium"
      )
    ).toBe(true);
    expect(
      isScopeFactKnown(
        "Kitchen renovation",
        "kitchen.finish_level",
        {},
        "premium"
      )
    ).toBe(true);
  });

  it("does not show bathroom finish level missing when global quality is premium", () => {
    const items = getCurrentMissingItems({
      workAreas: [...KITCHEN_BATHROOM_PROMPT_AREAS],
      projectQualityLevel: "premium",
    });

    const labels = getCriticalOrUsefulMissing(items).map((i) => i.label);
    expect(labels.some((l) => /bathroom.*finish/i.test(l))).toBe(false);
    expect(labels.some((l) => /kitchen.*finish/i.test(l))).toBe(false);
    expect(
      items.some((i) => i.factKey.includes("finish_level") && i.status === "missing")
    ).toBe(false);
  });

  it("removes answered facts from missing lists", () => {
    const items = getCurrentMissingItems({
      workAreas: [...KITCHEN_BATHROOM_PROMPT_AREAS],
      projectQualityLevel: "premium",
    });

    const factKeys = items
      .filter((i) => i.status === "missing")
      .map((i) => i.factKey);

    expect(factKeys).not.toContain("kitchen.floor_area_m2");
    expect(factKeys).not.toContain("bathroom.floor_area_m2");
    expect(factKeys).not.toContain("bathroom.plumbing_relocation");
    expect(factKeys).not.toContain("kitchen.layout_changing");
  });

  it("resolves next panel action to optional details or view estimate after required flow", () => {
    const evaluation = evaluateConfidence({
      workAreas: [...KITCHEN_BATHROOM_PROMPT_AREAS],
      qualityLevel: "premium",
      siteConstraintsAssessed: true,
    });

    const flow = resolveAssistantFlowState({
      workAreas: [...KITCHEN_BATHROOM_PROMPT_AREAS],
      qualityLevel: "premium",
      selectedConstraintSlugs: ["steep_access"],
      declinedConstraintSlugs: [],
      hasEstimate: true,
      estimateReady: true,
      confidenceEvaluation: evaluation,
      siteConstraintsAssessed: true,
    });

    expect([
      "optional_refinement",
      "estimate_ready",
      "needs_confidence_refinement",
    ]).toContain(flow.state);

    const action = resolveFlowPanelAction(flow);
    expect(action?.label).toMatch(
      /Add optional details|View estimate detail|Add your rates|Improve estimate/
    );
  });

  it("regression: global quality suppresses deck finish missing", () => {
    const items = getCurrentMissingItems({
      workAreas: [
        {
          scopeId: "deck-1",
          scopeName: "Deck",
          workAreaTypeKey: "Deck",
          included: true,
          answers: { "deck.area_m2": "20" },
        },
      ],
      projectQualityLevel: "standard",
    });

    expect(
      items.some(
        (i) => i.factKey === "deck.finish_level" && i.status === "missing"
      )
    ).toBe(false);
  });
});
