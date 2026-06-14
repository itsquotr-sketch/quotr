import { describe, expect, it } from "vitest";
import { calculateQuickEstimateV1 } from "@/lib/cost-engine/calculate-quick-estimate-v1";
import type { QuickEstimateInput } from "@/lib/cost-engine/quick-estimate-input";
import type { ScopeRate } from "@/types/database";

const emptyRates = {
  scopeRates: [] as ScopeRate[],
  packageRates: [],
  labourRates: [],
  materialRates: [],
  subcontractorRates: [],
};

function deckInput(
  overrides: {
    area?: number;
    scopeRates?: ScopeRate[];
    quality?: "budget" | "standard" | "premium";
    workAreas?: QuickEstimateInput["workAreas"];
  } = {}
): QuickEstimateInput {
  return {
    organisationId: "org-test",
    project: { id: "test", title: "Test" },
    quickEstimate: {
      id: "qe-1",
      client_budget: null,
      target_margin_percent: 20,
      quality_level: overrides.quality ?? "standard",
    },
    workAreas: overrides.workAreas ?? [
      {
        scopeId: "s1",
        name: "Deck",
        workAreaTypeKey: "Deck",
        answers: {
          "deck.area_m2": String(overrides.area ?? 50),
          "deck.material_type": "timber",
          "deck.level_type": "ground",
        },
        answeredFromNotes: [],
      },
    ],
    constraints: [{ slug: "tight-access", label: "Tight access" }],
    ...emptyRates,
    scopeRates: overrides.scopeRates ?? [],
    targetMarginPercent: 20,
    contingencyPercent: 5,
    discovery: null,
    questionsAnswered: 2,
    questionsTotal: 2,
    answeredQuestionKeys: new Set(["deck.area_m2", "deck.material_type"]),
    scopeQuestions: [],
    siteConstraintsAssessed: true,
  };
}

function makeDeckScopeRate(
  rates: Partial<
    Pick<ScopeRate, "budget_rate" | "standard_rate" | "premium_rate">
  > & {
    labour_allocation_percent?: number;
    materials_allocation_percent?: number;
    subcontractor_allocation_percent?: number;
    allowance_allocation_percent?: number;
  }
): ScopeRate {
  return {
    id: "scope-deck",
    organisation_id: "org-1",
    scope_type_key: "deck",
    label: "Deck",
    unit: "m²",
    budget_rate: rates.budget_rate ?? 450,
    standard_rate: rates.standard_rate ?? 650,
    premium_rate: rates.premium_rate ?? 900,
    default_rate: null,
    labour_allocation_percent: rates.labour_allocation_percent ?? null,
    materials_allocation_percent: rates.materials_allocation_percent ?? null,
    subcontractor_allocation_percent:
      rates.subcontractor_allocation_percent ?? null,
    allowance_allocation_percent: rates.allowance_allocation_percent ?? null,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

describe("Sprint 10A quick estimate rate behaviour", () => {
  it("Test A — deck benchmark when no saved rates", () => {
    const result = calculateQuickEstimateV1(deckInput({ area: 50 }));

    expect(result.canCalculate).toBe(true);
    expect(result.rateSourceLines[0]?.rateSource).toBe("template_benchmark");
    expect(result.rateSourceLines[0]?.rateSourceLabel).toBe("Quotr benchmark");
    expect(result.benchmarkScopesForOnboarding).toHaveLength(1);
    expect(result.benchmarkScopesForOnboarding[0]?.scopeTypeKey).toBe("deck");
  });

  it("Test B — saved deck scope rate changes estimate and source", () => {
    const benchmark = calculateQuickEstimateV1(deckInput({ area: 50 }));
    const saved = calculateQuickEstimateV1(
      deckInput({
        area: 50,
        scopeRates: [
          makeDeckScopeRate({
            budget_rate: 450,
            standard_rate: 800,
            premium_rate: 900,
          }),
        ],
      })
    );

    expect(saved.rateSourceLines[0]?.rateSource).toBe("scope_rate");
    expect(saved.rateSourceLines[0]?.rateSourceLabel).toBe("Your saved Deck rate");
    expect(saved.benchmarkScopesForOnboarding).toHaveLength(0);
    expect(saved.estimatedCostTypical).toBeGreaterThan(
      benchmark.estimatedCostTypical ?? 0
    );
  });

  it("Test C — finish level uses budget/standard/premium scope rates", () => {
    const scopeRates = [
      makeDeckScopeRate({
        budget_rate: 450,
        standard_rate: 650,
        premium_rate: 900,
      }),
    ];

    const budget = calculateQuickEstimateV1(
      deckInput({ area: 50, scopeRates, quality: "budget" })
    );
    const standard = calculateQuickEstimateV1(
      deckInput({ area: 50, scopeRates, quality: "standard" })
    );
    const premium = calculateQuickEstimateV1(
      deckInput({ area: 50, scopeRates, quality: "premium" })
    );

    expect(budget.estimatedCostTypical).toBeLessThan(
      standard.estimatedCostTypical ?? 0
    );
    expect(standard.estimatedCostTypical).toBeLessThan(
      premium.estimatedCostTypical ?? 0
    );
  });

  it("Test D — mixed saved and benchmark sources across work areas", () => {
    const result = calculateQuickEstimateV1(
      deckInput({
        scopeRates: [makeDeckScopeRate({})],
        workAreas: [
          {
            scopeId: "s1",
            name: "Deck",
            workAreaTypeKey: "Deck",
            answers: {
              "deck.area_m2": "50",
              "deck.material_type": "timber",
            },
            answeredFromNotes: [],
          },
          {
            scopeId: "s2",
            name: "Bathroom",
            workAreaTypeKey: "Bathroom renovation",
            answers: {
              "bathroom.floor_area_m2": "6",
              "bathroom.layout_changing": "no",
            },
            answeredFromNotes: [],
          },
        ],
      })
    );

    expect(result.rateSourceLines).toHaveLength(2);
    expect(result.rateSourceLines[0]?.rateSourceLabel).toBe(
      "Your saved Deck rate"
    );
    expect(result.rateSourceLines[1]?.rateSourceLabel).toBe("Quotr benchmark");
  });

  it("Test E — breakdown uses saved allocation percentages", () => {
    const result = calculateQuickEstimateV1(
      deckInput({
        area: 50,
        scopeRates: [
          makeDeckScopeRate({
            labour_allocation_percent: 45,
            materials_allocation_percent: 40,
            subcontractor_allocation_percent: 5,
            allowance_allocation_percent: 10,
          }),
        ],
      })
    );

    const breakdown = result.estimateTrace.workAreaTraces?.[0]?.allocationBreakdown;
    expect(breakdown?.source).toBe("scope_rate");
    expect(breakdown?.labourPercent).toBe(45);
    expect(result.estimateTrace.costBreakdown?.isIndicative).toBe(true);
  });

  it("Test F — updated scope rate changes estimate output", () => {
    const lower = calculateQuickEstimateV1(
      deckInput({
        area: 50,
        scopeRates: [makeDeckScopeRate({ standard_rate: 600 })],
      })
    );
    const higher = calculateQuickEstimateV1(
      deckInput({
        area: 50,
        scopeRates: [makeDeckScopeRate({ standard_rate: 750 })],
      })
    );

    expect(higher.estimatedCostTypical).toBeGreaterThan(
      lower.estimatedCostTypical ?? 0
    );
  });
});
