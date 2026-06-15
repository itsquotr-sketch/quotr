import { describe, expect, it } from "vitest";
import { mapPostConfirmationEstimateMessage } from "@/lib/assistant-v2/post-confirmation-estimate-message";

describe("mapPostConfirmationEstimateMessage", () => {
  it("returns missing-details copy for typical calc gaps", () => {
    expect(
      mapPostConfirmationEstimateMessage({
        userMessage: "Missing fence height",
      })
    ).toBe(
      "I've saved those work areas. I need a few details before I can price them properly."
    );
  });

  it("returns pricing copy for unpriced scopes", () => {
    expect(
      mapPostConfirmationEstimateMessage({
        userMessage: "Fence is not priced yet",
        unpricedScopeNames: ["Fence"],
      })
    ).toBe(
      "I've saved those work areas. Fence needs pricing support or a rough allowance before it can be included."
    );
  });

  it("returns system error copy for save failures", () => {
    expect(
      mapPostConfirmationEstimateMessage({
        userMessage: "Could not save quick estimate.",
      })
    ).toBe(
      "I've saved the work areas, but estimate refresh failed. You can retry once the details are complete."
    );
  });
});
