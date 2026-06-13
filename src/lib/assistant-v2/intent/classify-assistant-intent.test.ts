import { describe, expect, it } from "vitest";
import { classifyAssistantIntent } from "@/lib/assistant-v2/intent/classify-assistant-intent";

describe("classifyAssistantIntent", () => {
  it("classifies allowance update with high confidence", async () => {
    const result = await classifyAssistantIntent(
      "Increase rubbish removal allowance from 1000 to 2000",
      { existingAllowanceKeys: ["rubbish_removal"] }
    );

    expect(result.intent).toBe("update_allowance");
    expect(result.confidence).toBeGreaterThanOrEqual(0.8);
    expect(result.requiresConfirmation).toBe(false);
    expect(result.extractedPayload).toMatchObject({
      allowanceKey: "rubbish_removal",
      amount: 2000,
    });
  });

  it("asks for confirmation on vague allowance command", async () => {
    const result = await classifyAssistantIntent("Make rubbish bigger", {
      existingAllowanceKeys: ["rubbish_removal"],
    });

    expect(result.intent).toBe("update_allowance");
    expect(result.requiresConfirmation).toBe(true);
    expect(result.confirmationMessage).toMatch(/rubbish removal allowance/i);
  });

  it("classifies finish level update", async () => {
    const result = await classifyAssistantIntent("Actually make it premium");

    expect(result.intent).toBe("update_finish_level");
    expect(result.confidence).toBeGreaterThanOrEqual(0.8);
    expect(result.extractedPayload).toMatchObject({ qualityLevel: "premium" });
  });

  it("classifies work area exclusion", async () => {
    const result = await classifyAssistantIntent(
      "Remove the retaining wall from this estimate",
      { workAreaNames: ["Retaining wall", "Deck"] }
    );

    expect(result.intent).toBe("exclude_work_area");
    expect(result.confidence).toBeGreaterThanOrEqual(0.8);
  });

  it("classifies add work area with confirmation for custom scope", async () => {
    const result = await classifyAssistantIntent("Add landscaping", {
      workAreaNames: ["Deck"],
    });

    expect(result.intent).toBe("add_work_area");
    expect(result.requiresConfirmation).toBe(true);
    expect(result.confirmationMessage).toMatch(/custom work area/i);
  });

  it("classifies breakdown question", async () => {
    const result = await classifyAssistantIntent("Show me the cost breakdown");

    expect(result.intent).toBe("ask_question");
    expect(result.extractedPayload).toMatchObject({ questionType: "breakdown" });
  });

  it("classifies what's included question", async () => {
    const result = await classifyAssistantIntent(
      "What is included in this estimate?"
    );

    expect(result.intent).toBe("ask_question");
    expect(result.extractedPayload).toMatchObject({
      questionType: "whats_included",
    });
  });

  it("classifies tight access constraint", async () => {
    const result = await classifyAssistantIntent("Tight access applies");

    expect(result.intent).toBe("update_constraint");
    expect(result.extractedPayload).toMatchObject({ slug: "tight-access" });
  });

  it("classifies remove allowance command", async () => {
    const result = await classifyAssistantIntent("Remove rubbish removal", {
      existingAllowanceKeys: ["rubbish_removal"],
    });

    expect(result.intent).toBe("remove_allowance");
    expect(result.confidence).toBeGreaterThanOrEqual(0.8);
    expect(result.extractedPayload).toMatchObject({
      allowanceKey: "rubbish_removal",
    });
  });

  it("classifies sharpen estimate question as ask_refinement_question", async () => {
    const result = await classifyAssistantIntent(
      "What other information can I give you to refine the pricing?"
    );

    expect(result.intent).toBe("ask_refinement_question");
    expect(result.confidence).toBeGreaterThanOrEqual(0.8);
  });

  it("classifies what details do you need", async () => {
    const result = await classifyAssistantIntent("What details do you need?");

    expect(result.intent).toBe("ask_refinement_question");
  });

  it("classifies how do I improve confidence", async () => {
    const result = await classifyAssistantIntent("How do I improve confidence?");

    expect(result.intent).toBe("ask_refinement_question");
  });

  it("classifies scope-specific refinement question", async () => {
    const result = await classifyAssistantIntent(
      "What details would improve Deck?",
      { workAreaNames: ["Deck", "Retaining wall"] }
    );

    expect(result.intent).toBe("ask_refinement_question");
    expect(result.extractedPayload).toMatchObject({ scopeName: "Deck" });
  });

  it("classifies deck area update as update_existing_fact", async () => {
    const result = await classifyAssistantIntent(
      "Update the deck area to 29m²",
      {
        hasConfirmedScopes: true,
        workAreaNames: ["Deck"],
        scopes: [
          {
            scopeId: "11111111-1111-1111-1111-111111111111",
            scopeName: "Deck",
            workAreaTypeKey: "Deck",
            answers: { "deck.area_m2": "24.5" },
          },
        ],
      }
    );

    expect(result.intent).toBe("update_existing_fact");
    expect(result.confidence).toBeGreaterThanOrEqual(0.8);
    expect(result.extractedPayload).toMatchObject({
      factKey: "deck.area_m2",
      newValue: "29",
    });
  });

  it("classifies client no longer wants retaining wall as exclude", async () => {
    const result = await classifyAssistantIntent(
      "Client no longer wants a retaining wall, remove it",
      { workAreaNames: ["Retaining wall", "Deck"], hasConfirmedScopes: true }
    );

    expect(result.intent).toBe("exclude_work_area");
    expect(result.confidence).toBeGreaterThanOrEqual(0.8);
  });

  it("classifies ambiguous area update with confirmation", async () => {
    const result = await classifyAssistantIntent("Change the area to 30m²", {
      hasConfirmedScopes: true,
      workAreaNames: ["Deck", "Bathroom renovation"],
      scopes: [
        {
          scopeId: "11111111-1111-1111-1111-111111111111",
          scopeName: "Deck",
          workAreaTypeKey: "Deck",
          answers: { "deck.area_m2": "24.5" },
        },
        {
          scopeId: "33333333-3333-3333-3333-333333333333",
          scopeName: "Bathroom renovation",
          workAreaTypeKey: "Bathroom renovation",
          answers: { "bathroom.floor_area_m2": "6" },
        },
      ],
    });

    expect(result.intent).toBe("update_existing_fact");
    expect(result.requiresConfirmation).toBe(true);
    expect(result.confirmationMessage).toMatch(/deck|bathroom/i);
  });

  it("routes scope notes to discovery", async () => {
    const result = await classifyAssistantIntent(
      "50m² timber deck at the back, standard finish, tight access to site"
    );

    expect(result.intent).toBe("new_scope_notes");
  });

  it("routes deck and retaining wall project description to discovery", async () => {
    const result = await classifyAssistantIntent(
      "Build a timber pine deck 7m x 3.5m, elevated 0.8m with piles. Also a retaining wall 7m long and 1.4m high requiring drainage and backfill."
    );

    expect(result.intent).toBe("new_scope_notes");
    expect(result.intent).not.toBe("unknown");
  });

  it("does not treat deck description as remove allowance command", async () => {
    const result = await classifyAssistantIntent(
      "Build a timber pine deck 7m x 3.5m and a retaining wall 7m long."
    );

    expect(result.intent).not.toBe("remove_allowance");
    expect(result.intent).not.toBe("unknown");
  });
});
