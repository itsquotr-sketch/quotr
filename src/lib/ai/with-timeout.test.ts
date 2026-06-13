import { describe, expect, it } from "vitest";
import { isTimeoutError, TimeoutError, withTimeout } from "@/lib/ai/with-timeout";

describe("withTimeout", () => {
  it("resolves when promise completes in time", async () => {
    const result = await withTimeout(Promise.resolve("ok"), 1000, "test");
    expect(result).toBe("ok");
  });

  it("rejects with TimeoutError when promise is slow", async () => {
    await expect(
      withTimeout(
        new Promise((resolve) => setTimeout(() => resolve("late"), 200)),
        50,
        "slow operation"
      )
    ).rejects.toBeInstanceOf(TimeoutError);
  });

  it("identifies timeout errors", () => {
    expect(isTimeoutError(new TimeoutError("x"))).toBe(true);
    expect(isTimeoutError(new Error("other"))).toBe(false);
  });
});
