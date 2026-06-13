import { describe, expect, it } from "vitest";
import { classifyAssistantIntent } from "@/lib/assistant-v2/intent/classify-assistant-intent";
import {
  CONFIDENCE_CONFIRM_THRESHOLD,
  CONFIDENCE_EXECUTE_THRESHOLD,
} from "@/lib/assistant-v2/intent/types";

const deckScopeId = "11111111-1111-1111-1111-111111111111";
const retainingScopeId = "22222222-2222-2222-2222-222222222222";

type TestContext = {
  hasConfirmedScopes?: boolean;
  workAreaNames?: string[];
  scopes?: {
    scopeId: string;
    scopeName: string;
    workAreaTypeKey: string;
    answers: Record<string, string>;
  }[];
  existingAllowanceKeys?: string[];
};

type CommandTestCase = {
  id: number;
  command: string;
  context?: TestContext;
  expectedIntent: string;
  minConfidence?: number;
  maxConfidence?: number;
  requiresConfirmation?: boolean;
  payloadMatch?: Record<string, unknown>;
  expectedOutcome: "apply" | "confirm" | "clarify" | "answer";
};

function outcomeFromResult(result: {
  intent: string;
  confidence: number;
  requiresConfirmation: boolean;
}): CommandTestCase["expectedOutcome"] {
  if (result.intent === "ask_question" || result.intent === "ask_refinement_question") {
    return "answer";
  }
  if (result.confidence < CONFIDENCE_CONFIRM_THRESHOLD) return "clarify";
  if (result.requiresConfirmation || result.confidence < CONFIDENCE_EXECUTE_THRESHOLD) {
    return "confirm";
  }
  return "apply";
}

const defaultScopeContext: TestContext = {
  hasConfirmedScopes: true,
  workAreaNames: ["Deck", "Retaining Wall"],
  scopes: [
    {
      scopeId: deckScopeId,
      scopeName: "Deck",
      workAreaTypeKey: "Deck",
      answers: { "deck.area_m2": "24.5" },
    },
    {
      scopeId: retainingScopeId,
      scopeName: "Retaining Wall",
      workAreaTypeKey: "Retaining Wall",
      answers: { "retaining_wall.length_m": "10", "retaining_wall.height_m": "1" },
    },
  ],
  existingAllowanceKeys: ["rubbish_removal", "contingency", "engineering"],
};

const COMMAND_TESTS: CommandTestCase[] = [
  { id: 1, command: "Actually the deck is 60m2.", expectedIntent: "update_existing_fact", expectedOutcome: "apply", payloadMatch: { newValue: "60" } },
  { id: 2, command: "Deck size is 60.", expectedIntent: "update_existing_fact", expectedOutcome: "apply", payloadMatch: { newValue: "60" } },
  { id: 3, command: "Change deck to 60 square metres.", expectedIntent: "update_existing_fact", expectedOutcome: "apply", payloadMatch: { newValue: "60" } },
  { id: 4, command: "The wall is 12m long and 1.2m high.", expectedIntent: "update_existing_fact", expectedOutcome: "apply", payloadMatch: { newValue: "12" } },
  { id: 5, command: "Forget the retaining wall.", expectedIntent: "exclude_work_area", expectedOutcome: "apply" },
  { id: 6, command: "Drop the retaining wall.", expectedIntent: "exclude_work_area", expectedOutcome: "apply" },
  { id: 7, command: "Client no longer wants the retaining wall.", expectedIntent: "exclude_work_area", expectedOutcome: "apply" },
  { id: 8, command: "Price it without the deck.", expectedIntent: "exclude_work_area", expectedOutcome: "apply" },
  { id: 9, command: "Add a fence.", expectedIntent: "add_work_area", expectedOutcome: "confirm" },
  { id: 10, command: "There is also a kitchen.", expectedIntent: "add_work_area", expectedOutcome: "confirm" },
  { id: 11, command: "Include painting.", expectedIntent: "include_work_area", expectedOutcome: "confirm" },
  { id: 12, command: "Make it premium.", expectedIntent: "update_finish_level", expectedOutcome: "apply", payloadMatch: { qualityLevel: "premium" } },
  { id: 13, command: "Go upmarket.", expectedIntent: "update_finish_level", expectedOutcome: "confirm", payloadMatch: { qualityLevel: "premium" } },
  { id: 14, command: "Keep it budget.", expectedIntent: "update_finish_level", expectedOutcome: "confirm", payloadMatch: { qualityLevel: "budget" } },
  { id: 15, command: "Just standard quality.", expectedIntent: "update_finish_level", expectedOutcome: "confirm", payloadMatch: { qualityLevel: "standard" } },
  { id: 16, command: "Client supplies tiles.", context: { hasConfirmedScopes: true, workAreaNames: ["Bathroom renovation"], scopes: [{ scopeId: "33333333-3333-3333-3333-333333333333", scopeName: "Bathroom renovation", workAreaTypeKey: "Bathroom renovation", answers: {} }] }, expectedIntent: "update_existing_fact", expectedOutcome: "apply" },
  { id: 17, command: "Labour only for the deck.", expectedIntent: "update_existing_fact", expectedOutcome: "apply" },
  { id: 18, command: "Exclude materials.", expectedIntent: "update_existing_fact", expectedOutcome: "apply" },
  { id: 19, command: "Supply and install everything.", expectedIntent: "update_existing_fact", expectedOutcome: "apply" },
  { id: 20, command: "Increase rubbish to 2k.", expectedIntent: "update_allowance", expectedOutcome: "apply", payloadMatch: { amount: 2000 } },
  { id: 21, command: "Add a $1,500 skip allowance.", expectedIntent: "update_allowance", expectedOutcome: "apply", payloadMatch: { amount: 1500 } },
  { id: 22, command: "Remove engineering allowance.", expectedIntent: "remove_allowance", expectedOutcome: "apply" },
  { id: 23, command: "Make contingency $3,000.", expectedIntent: "update_allowance", expectedOutcome: "apply", payloadMatch: { amount: 3000 } },
  { id: 24, command: "What's included?", expectedIntent: "ask_question", expectedOutcome: "answer", payloadMatch: { questionType: "whats_included" } },
  { id: 25, command: "What's excluded?", expectedIntent: "ask_question", expectedOutcome: "answer", payloadMatch: { questionType: "whats_excluded" } },
  { id: 26, command: "What assumptions are you making?", expectedIntent: "ask_question", expectedOutcome: "answer", payloadMatch: { questionType: "assumptions" } },
  { id: 27, command: "How confident are you?", expectedIntent: "ask_question", expectedOutcome: "answer", payloadMatch: { questionType: "confidence" } },
  { id: 28, command: "How accurate is this?", expectedIntent: "ask_question", expectedOutcome: "answer", payloadMatch: { questionType: "confidence" } },
  { id: 29, command: "Can I trust this number?", expectedIntent: "ask_question", expectedOutcome: "answer", payloadMatch: { questionType: "confidence" } },
  { id: 30, command: "What would change this estimate?", expectedIntent: "ask_question", expectedOutcome: "answer", payloadMatch: { questionType: "sensitivity" } },
  { id: 31, command: "What would make it cheaper?", expectedIntent: "ask_question", expectedOutcome: "answer", payloadMatch: { questionType: "sensitivity", sensitivityMode: "cheaper" } },
  { id: 32, command: "What would make it more expensive?", expectedIntent: "ask_question", expectedOutcome: "answer", payloadMatch: { questionType: "sensitivity", sensitivityMode: "expensive" } },
  { id: 33, command: "What are the biggest cost drivers?", expectedIntent: "ask_question", expectedOutcome: "answer", payloadMatch: { questionType: "sensitivity" } },
  { id: 34, command: "What rates are you using?", expectedIntent: "ask_question", expectedOutcome: "answer", payloadMatch: { questionType: "rates" } },
  { id: 35, command: "Is this based on my rates?", expectedIntent: "ask_question", expectedOutcome: "answer", payloadMatch: { questionType: "rates" } },
  { id: 36, command: "Where did this number come from?", expectedIntent: "ask_question", expectedOutcome: "answer", payloadMatch: { questionType: "rates" } },
  { id: 37, command: "What details would help?", expectedIntent: "ask_refinement_question", expectedOutcome: "answer" },
  { id: 38, command: "What else do you need?", expectedIntent: "ask_refinement_question", expectedOutcome: "answer" },
  { id: 39, command: "Tight access applies.", expectedIntent: "update_constraint", expectedOutcome: "apply" },
  { id: 40, command: "Access is fine.", expectedIntent: "update_constraint", expectedOutcome: "apply" },
  { id: 41, command: "Machine access is available.", expectedIntent: "update_existing_fact", expectedOutcome: "apply" },
  { id: 42, command: "No machine access.", expectedIntent: "update_existing_fact", expectedOutcome: "apply" },
  { id: 43, command: "The client has their own vanity.", context: { hasConfirmedScopes: true, workAreaNames: ["Bathroom renovation"], scopes: [{ scopeId: "33333333-3333-3333-3333-333333333333", scopeName: "Bathroom renovation", workAreaTypeKey: "Bathroom renovation", answers: {} }] }, expectedIntent: "update_existing_fact", expectedOutcome: "apply" },
  { id: 44, command: "Exclude balustrade.", expectedIntent: "update_existing_fact", expectedOutcome: "apply" },
  { id: 45, command: "Include stairs.", expectedIntent: "update_existing_fact", expectedOutcome: "apply" },
  { id: 46, command: "No stairs.", expectedIntent: "update_existing_fact", expectedOutcome: "apply" },
  { id: 47, command: "Add pergola.", expectedIntent: "update_existing_fact", expectedOutcome: "apply" },
  { id: 48, command: "Remove pergola.", expectedIntent: "update_existing_fact", expectedOutcome: "apply" },
  { id: 49, command: "Make margin 20%.", expectedIntent: "update_margin", expectedOutcome: "apply", payloadMatch: { targetMarginPercent: 20 } },
  { id: 50, command: "Change sell margin to 15%.", expectedIntent: "update_margin", expectedOutcome: "apply", payloadMatch: { targetMarginPercent: 15 } },
];

describe("Sprint 11B — 50-command regression suite", () => {
  const results: {
    id: number;
    command: string;
    detectedIntent: string;
    confidence: number;
    actionTaken: string;
    expectedOutcome: string;
    pass: boolean;
  }[] = [];

  for (const testCase of COMMAND_TESTS) {
    it(`#${testCase.id}: ${testCase.command}`, async () => {
      const context = {
        ...defaultScopeContext,
        ...testCase.context,
        scopes: testCase.context?.scopes ?? defaultScopeContext.scopes,
        workAreaNames:
          testCase.context?.workAreaNames ?? defaultScopeContext.workAreaNames,
      };

      const result = await classifyAssistantIntent(testCase.command, context);
      const outcome = outcomeFromResult(result);
      results.push({
        id: testCase.id,
        command: testCase.command,
        detectedIntent: result.intent,
        confidence: result.confidence,
        actionTaken: outcome,
        expectedOutcome: testCase.expectedOutcome,
        pass:
          result.intent === testCase.expectedIntent &&
          outcome === testCase.expectedOutcome,
      });

      expect(result.intent).toBe(testCase.expectedIntent);
      expect(outcome).toBe(testCase.expectedOutcome);

      if (testCase.minConfidence != null) {
        expect(result.confidence).toBeGreaterThanOrEqual(testCase.minConfidence);
      }
      if (testCase.maxConfidence != null) {
        expect(result.confidence).toBeLessThan(testCase.maxConfidence);
      }
      if (testCase.requiresConfirmation != null) {
        expect(result.requiresConfirmation).toBe(testCase.requiresConfirmation);
      }
      if (testCase.payloadMatch) {
        expect(result.extractedPayload).toMatchObject(testCase.payloadMatch);
      }
    });
  }

  it("reports regression summary", () => {
    const passed = results.filter((r) => r.pass).length;
    const failed = results.filter((r) => !r.pass);
    expect(passed).toBe(50);
    if (failed.length > 0) {
      console.table(failed);
    }
  });
});

describe("Sprint 11B — contractor synonym dictionary", () => {
  it("matches remove verb synonyms", async () => {
    for (const cmd of ["Forget the retaining wall.", "Drop the retaining wall.", "Price it without the deck."]) {
      const result = await classifyAssistantIntent(cmd, defaultScopeContext);
      expect(result.intent).toBe("exclude_work_area");
    }
  });

  it("matches add verb synonyms", async () => {
    const result = await classifyAssistantIntent("There is also a fence.", defaultScopeContext);
    expect(result.intent).toBe("add_work_area");
  });

  it("parses numeric formats", async () => {
    const result = await classifyAssistantIntent("Actually the deck is 60m2.", defaultScopeContext);
    expect(result.extractedPayload).toMatchObject({ newValue: "60" });
  });
});

describe("Sprint 11B — confidence thresholds", () => {
  it("applies high-confidence exclude directly", async () => {
    const result = await classifyAssistantIntent("Forget the retaining wall.", defaultScopeContext);
    expect(result.confidence).toBeGreaterThanOrEqual(CONFIDENCE_EXECUTE_THRESHOLD);
    expect(result.requiresConfirmation).toBe(false);
  });

  it("asks confirmation for vague allowance", async () => {
    const result = await classifyAssistantIntent("Make rubbish bigger.", {
      ...defaultScopeContext,
    });
    expect(result.requiresConfirmation).toBe(true);
    expect(result.confidence).toBeLessThan(CONFIDENCE_EXECUTE_THRESHOLD);
    expect(result.confidence).toBeGreaterThanOrEqual(CONFIDENCE_CONFIRM_THRESHOLD);
  });

  it("asks clarification for ambiguous numeric", async () => {
    const result = await classifyAssistantIntent("Change it to 30.", defaultScopeContext);
    expect(result.confidence).toBeLessThan(CONFIDENCE_CONFIRM_THRESHOLD);
  });
});
