import { describe, expect, it } from "vitest";
import {
  buildAutopilotInputFromAssistantData,
  getNextRequiredAssistantStep,
} from "@/lib/assistant-v2/autopilot/get-next-required-assistant-step";
import {
  collectAnsweredQuestionKeys,
  getNextAssistantTurn,
} from "@/lib/assistant-v2/get-next-assistant-turn";
import { resolveAssistantFlowState } from "@/lib/assistant-v2/flow/resolve-assistant-flow-state";

const kitchenAnswers: Record<string, string> = {
  "kitchen.floor_area_m2": "10",
  "kitchen.demolition_required": "yes",
  "kitchen.electrical_work": "yes",
  "kitchen.plumbing_work": "yes",
};

const bathroomAnswers: Record<string, string> = {
  "bathroom.floor_area_m2": "5",
  "bathroom.demolition_required": "yes",
  "bathroom.tiling_included": "yes",
  "bathroom.vanity_included": "yes",
  "bathroom.shower_included": "yes",
  "bathroom.toilet_included": "yes",
  "bathroom.waterproofing_included": "yes",
};

function bathroomKitchenInput(qualityLevel: "unknown" | "standard" = "unknown") {
  const workAreas = [
    {
      scopeId: "kitchen-1",
      scopeName: "Kitchen renovation",
      workAreaTypeKey: "Kitchen renovation",
      answers: kitchenAnswers,
      included: true as const,
    },
    {
      scopeId: "bathroom-1",
      scopeName: "Bathroom renovation",
      workAreaTypeKey: "Bathroom renovation",
      answers: bathroomAnswers,
      included: true as const,
    },
  ];

  const scopeGroups = workAreas.map((a) => ({
    scopeId: a.scopeId,
    scopeName: a.scopeName,
    scopeTypeName: a.workAreaTypeKey,
    questions: [],
    answers: a.answers,
  }));

  return {
    workAreas,
    scopeGroups,
    autopilot: buildAutopilotInputFromAssistantData({
      confirmedScopes: workAreas.map((a) => ({
        id: a.scopeId,
        name: a.scopeName,
        scope_types: { name: a.workAreaTypeKey },
      })),
      scopeGroups,
      scopeQuestions: [],
      discovery: null,
      qualityLevel,
      selectedConstraintSlugs: [],
      declinedConstraintSlugs: [],
      answeredQuestionKeys: new Set(),
      quickEstimate: {
        estimated_cost_low: 1000,
        estimated_cost_high: 2000,
        estimate_status: "ready",
      },
    }),
  };
}

describe("Assistant autopilot — bathroom + kitchen MVP flow", () => {
  it("Test A — asks quality after work areas even when estimate exists", () => {
    const { autopilot, workAreas } = bathroomKitchenInput("unknown");
    const step = getNextRequiredAssistantStep(autopilot);

    expect(step.shouldContinue).toBe(true);
    expect(step.step).toBe("ask_quality");
    expect(step.message).toMatch(/spec level/i);

    const flow = resolveAssistantFlowState({
      workAreas,
      qualityLevel: "unknown",
      selectedConstraintSlugs: [],
      declinedConstraintSlugs: [],
      hasEstimate: true,
      estimateReady: true,
    });
    expect(flow.state).toBe("needs_quality_confirmation");

    const turn = getNextAssistantTurn({
      scopeGroups: bathroomKitchenInput().scopeGroups,
      workAreaTypeKeys: ["Kitchen renovation", "Bathroom renovation"],
      discovery: null,
      scopeQuestions: [],
      selectedConstraintSlugs: [],
      declinedConstraintSlugs: new Set(),
      qualityLevel: "unknown",
      answeredQuestionKeys: new Set(),
      hasEstimate: true,
      estimateReady: true,
    });
    expect(turn?.kind).toBe("quality");
  });

  it("Test B — after quality selected, asks required scope questions", () => {
    const { autopilot } = bathroomKitchenInput("standard");
    const step = getNextRequiredAssistantStep(autopilot);

    expect(step.shouldContinue).toBe(true);
    expect(step.step).toBe("ask_required_scope_questions");
    expect(step.questions.length).toBeGreaterThan(0);
    expect(step.questions.length).toBeLessThanOrEqual(8);
    expect(step.message).toMatch(/before pricing this properly/i);

    const turn = getNextAssistantTurn({
      scopeGroups: bathroomKitchenInput("standard").scopeGroups,
      workAreaTypeKeys: ["Kitchen renovation", "Bathroom renovation"],
      discovery: null,
      scopeQuestions: [],
      selectedConstraintSlugs: [],
      declinedConstraintSlugs: new Set(),
      qualityLevel: "standard",
      answeredQuestionKeys: new Set(),
      hasEstimate: true,
      estimateReady: true,
    });
    expect(turn?.kind).toBe("scope_batch");
    if (turn?.kind === "scope_batch") {
      expect(turn.hasRequired).toBe(true);
    }
  });

  it("Test E — never returns ready while required scope questions remain", () => {
    const { autopilot } = bathroomKitchenInput("standard");
    const step = getNextRequiredAssistantStep(autopilot);

    expect(step.step).not.toBe("ready");
    expect(step.message).not.toMatch(/Ready for a draft quick estimate/i);

    const flow = resolveAssistantFlowState({
      workAreas: bathroomKitchenInput("standard").workAreas,
      qualityLevel: "standard",
      selectedConstraintSlugs: [],
      declinedConstraintSlugs: [],
      hasEstimate: true,
      estimateReady: true,
    });
    expect(flow.state).toBe("needs_required_scope_details");
  });

  it("Test F — collectAnsweredQuestionKeys only marks saved answers", () => {
    const answeredKeys = collectAnsweredQuestionKeys([
      {
        id: "q1",
        question_key: "bathroom.floor_area_m2",
        scope_answers: [{ id: "a1", answer: "5", source: "user", updated_at: "" }],
      } as never,
      {
        id: "q2",
        question_key: "bathroom.layout_changing",
        scope_answers: [],
      } as never,
    ]);

    expect(answeredKeys.has("bathroom.floor_area_m2")).toBe(true);
    expect(answeredKeys.has("bathroom.layout_changing")).toBe(false);
    expect(answeredKeys.size).toBe(1);
  });
});
