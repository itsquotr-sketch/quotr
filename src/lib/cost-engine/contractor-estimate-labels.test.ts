import { describe, expect, it } from "vitest";
import {
  buildWhatEstimateCovers,
  formatCoverageLine,
  formatCostDriverLabel,
  formatMissingLabel,
} from "@/lib/cost-engine/contractor-estimate-labels";

describe("contractor-estimate-labels", () => {
  it("cleans question-style constraint labels for coverage", () => {
    expect(formatCoverageLine("Is access tight? +10%")).toBe(
      "Access tight allowance"
    );
    expect(formatCoverageLine("Is rubbish removal required?: Typical +$1,000")).toBe(
      "Rubbish removal allowance: $1,000"
    );
  });

  it("builds what estimate covers with scopes and allowances", () => {
    const covers = buildWhatEstimateCovers({
      scopeNames: ["Deck"],
      allowances: [
        "Stairs allowance",
        "Balustrade allowance",
        "Existing deck removal allowance",
      ],
      constraints: ["Tight access +10%"],
    });
    expect(covers[0]).toBe("Deck");
    expect(covers.some((c) => c.includes("Stairs"))).toBe(true);
    expect(covers.some((c) => c.includes("Tight"))).toBe(true);
  });

  it("formats missing labels without question phrasing", () => {
    expect(formatMissingLabel("Deck: deck length not confirmed", "Deck")).toBe(
      "Deck length"
    );
    expect(formatMissingLabel("Missing: Is site access tight?", "Deck")).not.toMatch(
      /\?/
    );
  });

  it("formats cost drivers without assumed suffix", () => {
    expect(formatCostDriverLabel("Tight site access assumed (+8%)")).toBe(
      "Tight site access allowance"
    );
    expect(formatCostDriverLabel("Elevated deck access assumed (+15%)")).toBe(
      "Elevated deck access allowance"
    );
  });
});
