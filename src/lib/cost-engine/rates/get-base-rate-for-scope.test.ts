import { describe, expect, it } from "vitest";
import {
  getBaseRateForScope,
  isBenchmarkRateSource,
  primaryRateSource,
  rateSourceLabel,
} from "@/lib/cost-engine/rates/get-base-rate-for-scope";
import {
  pickScopeRateValue,
  rateUnitsMatch,
} from "@/lib/cost-engine/rates/scope-rate-utils";
import type { ScopeRate } from "@/types/database";

const emptyOrgRates = {
  scopeRates: [] as ScopeRate[],
  labourRates: [],
  materialRates: [],
  subcontractorRates: [],
  packageRates: [],
};

function makeScopeRate(
  overrides: Partial<ScopeRate> = {}
): ScopeRate {
  return {
    id: "scope-rate-1",
    organisation_id: "org-1",
    scope_type_key: "deck",
    label: "Deck",
    unit: "m²",
    budget_rate: 450,
    standard_rate: 650,
    premium_rate: 900,
    default_rate: null,
    labour_allocation_percent: 45,
    materials_allocation_percent: 40,
    subcontractor_allocation_percent: 5,
    allowance_allocation_percent: 10,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

describe("getBaseRateForScope", () => {
  it("uses scope_rate first when saved", () => {
    const result = getBaseRateForScope(
      "deck",
      "Deck",
      "m²",
      {
        ...emptyOrgRates,
        scopeRates: [makeScopeRate()],
      },
      "standard"
    );

    expect(result.source).toBe("scope_rate");
    expect(result.rate).toBe(650);
  });

  it("selects finish-specific scope rates", () => {
    const scopeRates = [makeScopeRate()];
    expect(
      getBaseRateForScope("deck", "Deck", "m²", { ...emptyOrgRates, scopeRates }, "budget")
        .rate
    ).toBe(450);
    expect(
      getBaseRateForScope("deck", "Deck", "m²", { ...emptyOrgRates, scopeRates }, "premium")
        .rate
    ).toBe(900);
  });

  it("falls back to Quotr benchmark when no saved rate", () => {
    const result = getBaseRateForScope(
      "deck",
      "Deck",
      "m²",
      emptyOrgRates,
      "standard"
    );

    expect(result.source).toBe("template_benchmark");
    expect(result.rate).toBe(650);
  });

  it("prefers scope_rate over package and org rates", () => {
    const result = getBaseRateForScope("deck", "Deck", "m²", {
      scopeRates: [makeScopeRate({ standard_rate: 700 })],
      labourRates: [
        {
          id: "labour-1",
          organisation_id: "org-1",
          name: "Deck labour",
          category: "Carpentry",
          cost_rate: 500,
          charge_rate: 700,
          unit: "m²",
          is_active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ],
      materialRates: [],
      subcontractorRates: [],
      packageRates: [
        {
          id: "pkg-1",
          organisation_id: "org-1",
          package_name: "Deck package",
          work_area_type: "Deck",
          description: null,
          unit: "m²",
          base_cost: 600,
          base_sell: 800,
          low_base_cost: 500,
          typical_base_cost: 600,
          high_base_cost: 700,
          low_base_sell: 650,
          typical_base_sell: 800,
          high_base_sell: 950,
          default_margin: null,
          is_active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ],
    });

    expect(result.source).toBe("scope_rate");
    expect(result.rate).toBe(700);
  });
});

describe("rate source labels", () => {
  it("uses contractor-friendly labels", () => {
    expect(rateSourceLabel("template_benchmark")).toBe("Quotr benchmark");
    expect(
      rateSourceLabel("scope_rate", { scopeLabel: "Deck" })
    ).toBe("Your saved Deck rate");
    expect(rateSourceLabel("org_rate")).toBe("Your trade/material rates");
  });

  it("prioritises scope_rate in primaryRateSource", () => {
    expect(
      primaryRateSource(["template_benchmark", "scope_rate", "placeholder"])
    ).toBe("scope_rate");
  });

  it("identifies benchmark sources for onboarding", () => {
    expect(isBenchmarkRateSource("template_benchmark")).toBe(true);
    expect(isBenchmarkRateSource("scope_rate")).toBe(false);
  });
});

describe("scope rate utilities", () => {
  it("matches m² unit variants", () => {
    expect(rateUnitsMatch("m²", "m2")).toBe(true);
    expect(rateUnitsMatch("m² wall face", "m²")).toBe(true);
  });

  it("picks default rate when finish unknown", () => {
    expect(
      pickScopeRateValue(
        {
          budget_rate: 450,
          standard_rate: null,
          premium_rate: 900,
          default_rate: 600,
        },
        "unknown"
      )
    ).toBe(600);
  });
});
