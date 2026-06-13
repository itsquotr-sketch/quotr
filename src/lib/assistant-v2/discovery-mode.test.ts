import { describe, expect, it } from "vitest";
import { ruleBasedDiscoveryProvider } from "@/lib/ai/discovery/rule-based-core";
import {
  buildDiscoveryAssistantText,
  shouldEnterDiscoveryMode,
  type AssistantProjectContext,
} from "@/lib/assistant-v2/discovery-mode";

function baseContext(
  overrides: Partial<AssistantProjectContext> = {}
): AssistantProjectContext {
  return {
    workAreaNames: [],
    existingAllowanceKeys: [],
    qualityLevel: "unknown",
    confirmedWorkAreaCount: 0,
    pendingSuggestionCount: 0,
    hasDiscoveryRun: false,
    ...overrides,
  };
}

describe("shouldEnterDiscoveryMode", () => {
  it("enters discovery when no confirmed work areas", () => {
    expect(shouldEnterDiscoveryMode(baseContext())).toBe(true);
  });

  it("enters discovery when work areas are pending confirmation", () => {
    expect(
      shouldEnterDiscoveryMode(
        baseContext({ pendingSuggestionCount: 2, hasDiscoveryRun: true })
      )
    ).toBe(true);
  });

  it("enters assistant mode when work areas are confirmed", () => {
    expect(
      shouldEnterDiscoveryMode(
        baseContext({
          confirmedWorkAreaCount: 2,
          hasDiscoveryRun: true,
        })
      )
    ).toBe(false);
  });
});

describe("buildDiscoveryAssistantText", () => {
  it("uses low-confidence fallback without blocking", () => {
    expect(
      buildDiscoveryAssistantText({
        pendingSuggestions: [
          { suggested_name: "Deck", confidence: 0.35 },
          { suggested_name: "Retaining Wall", confidence: 0.4 },
        ],
        analyseSuccess: true,
        needsClarification: false,
      })
    ).toBe("I found possible work areas. Please confirm.");
  });

  it("uses standard confirmation when confidence is adequate", () => {
    expect(
      buildDiscoveryAssistantText({
        pendingSuggestions: [
          { suggested_name: "Deck", confidence: 0.85 },
          { suggested_name: "Retaining Wall", confidence: 0.9 },
        ],
        analyseSuccess: true,
        needsClarification: false,
      })
    ).toBe(
      "I found these work areas. Confirm what should be included in this estimate."
    );
  });

  it("never returns assistant fallback prompts", () => {
    const text = buildDiscoveryAssistantText({
      pendingSuggestions: [],
      analyseSuccess: false,
      needsClarification: false,
    });

    expect(text).not.toMatch(/allowance/i);
    expect(text).not.toMatch(/add a work area/i);
    expect(text).toMatch(/possible work areas/i);
  });
});

describe("discovery scope extraction QA", () => {
  const qaInput =
    "Build a timber pine deck 7m x 3.5m, elevated 0.8m with piles. Also a retaining wall 7m long and 1.4m high requiring drainage and backfill.";

  it("extracts deck and retaining wall work areas from project description", () => {
    const result = ruleBasedDiscoveryProvider.discoverProject(qaInput);
    const names = result.workAreas.map((area) => area.name.toLowerCase());

    expect(names.some((name) => name.includes("deck"))).toBe(true);
    expect(names.some((name) => name.includes("retaining"))).toBe(true);
  });
});
