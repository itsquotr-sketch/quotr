import { describe, expect, it } from "vitest";
import {
  rankCandidateMatches,
  resolveAllowanceKeyHint,
  scoreCandidateMatch,
} from "@/lib/assistant-v2/item-resolution/match-candidates";
import type { EstimateItemCandidate } from "@/lib/assistant-v2/item-resolution/types";

const rubbishAllowance: EstimateItemCandidate = {
  itemType: "allowance",
  itemId: "abc-123",
  itemKey: "rubbish_removal",
  label: "Rubbish removal",
  currentAmount: 1000,
  source: "project_allowance",
};

describe("resolveAllowanceKeyHint", () => {
  it("maps trash removal to rubbish cluster", () => {
    expect(resolveAllowanceKeyHint("trash removal")).toBe("rubbish_removal");
  });

  it("maps skip bin to skip_bin key", () => {
    expect(resolveAllowanceKeyHint("skip bin hire")).toBe("skip_bin");
  });

  it("maps spoil removal separately", () => {
    expect(resolveAllowanceKeyHint("spoil removal")).toBe("spoil_removal");
  });
});

describe("scoreCandidateMatch", () => {
  it("scores high confidence for rubbish removal update", () => {
    const result = scoreCandidateMatch(
      "increase rubbish removal to 2000",
      rubbishAllowance
    );
    expect(result.confidence).toBeGreaterThanOrEqual(0.8);
  });

  it("scores cluster match for trash removal against rubbish allowance", () => {
    const result = scoreCandidateMatch("trash removal", rubbishAllowance);
    expect(result.confidence).toBeGreaterThanOrEqual(0.8);
  });

  it("scores cluster match for skip bin against existing rubbish allowance", () => {
    const result = scoreCandidateMatch("reduce skip bin to 500", rubbishAllowance);
    expect(result.confidence).toBeGreaterThanOrEqual(0.8);
  });
});

describe("rankCandidateMatches", () => {
  it("prefers rubbish removal over unrelated allowance", () => {
    const candidates: EstimateItemCandidate[] = [
      rubbishAllowance,
      {
        itemType: "allowance",
        itemKey: "engineering_allowance",
        label: "Engineering allowance",
        currentAmount: 3000,
        source: "project_allowance",
      },
    ];

    const ranked = rankCandidateMatches("change rubbish removal to 2000", candidates);
    expect(ranked[0].candidate.itemKey).toBe("rubbish_removal");
    expect(ranked[0].confidence).toBeGreaterThanOrEqual(0.8);
  });
});
