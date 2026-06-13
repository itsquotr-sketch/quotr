import { describe, expect, it } from "vitest";
import { resolveRateSourceBanner } from "@/lib/cost-engine/resolve-rate-source-banner";
import type { WorkAreaRateSourceLine } from "@/lib/cost-engine/estimate-trace";

function line(
  name: string,
  source: WorkAreaRateSourceLine["rateSource"],
  label: string
): WorkAreaRateSourceLine {
  return {
    workAreaName: name,
    workAreaTypeKey: name,
    scopeTypeKey: name.toLowerCase(),
    label,
    rateSource: source,
    rateSourceLabel: label,
  };
}

describe("resolveRateSourceBanner", () => {
  it("shows all saved message when every scope uses saved rates", () => {
    const banner = resolveRateSourceBanner([
      line("Deck", "scope_rate", "Deck"),
    ]);
    expect(banner?.kind).toBe("all_saved");
    expect(banner?.message).toBe("Using your saved rates.");
  });

  it("shows benchmark warning when all scopes use benchmarks", () => {
    const banner = resolveRateSourceBanner([
      line("Retaining Wall", "template_benchmark", "Retaining Wall"),
    ]);
    expect(banner?.kind).toBe("all_benchmark");
    expect(banner?.message).toMatch(/industry benchmarks/i);
    expect(banner?.perScopeLines[0]?.label).toBe("Industry benchmark");
  });

  it("shows mixed message for saved + benchmark scopes", () => {
    const banner = resolveRateSourceBanner([
      line("Deck", "scope_rate", "Deck"),
      line("Retaining Wall", "template_benchmark", "Retaining Wall"),
    ]);
    expect(banner?.kind).toBe("mixed");
    expect(banner?.message).toMatch(/some scopes use your rates/i);
    expect(banner?.perScopeLines).toHaveLength(2);
  });
});
