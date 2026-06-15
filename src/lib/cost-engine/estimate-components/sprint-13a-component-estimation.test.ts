import { describe, expect, it } from "vitest";
import { calculateQuickEstimateV1 } from "@/lib/cost-engine/calculate-quick-estimate-v1";
import type { QuickEstimateInput } from "@/lib/cost-engine/quick-estimate-input";
import {
  calculateScopeFromComponents,
  buildScopeComponentCalcInput,
  formatComponentTraceSummary,
  reconcileComponentsToTotal,
} from "@/lib/cost-engine/estimate-components";
import { resolveComponentRate } from "@/lib/cost-engine/estimate-components/resolve-component-rate";
import { DECK_COMPONENT_BENCHMARKS } from "@/lib/cost-engine/estimate-components/benchmark-rates";
import type { ScopeRate } from "@/types/database";

const emptyRates = {
  scopeRates: [] as ScopeRate[],
  packageRates: [],
  labourRates: [],
  materialRates: [],
  subcontractorRates: [],
};

function deckInput(area = 24): QuickEstimateInput {
  return {
    organisationId: "org-test",
    project: { id: "test", title: "Deck project" },
    quickEstimate: {
      id: "qe-1",
      client_budget: null,
      target_margin_percent: 20,
      quality_level: "standard",
    },
    workAreas: [
      {
        scopeId: "deck-1",
        name: "Deck",
        workAreaTypeKey: "Deck",
        answers: {
          "deck.area_m2": String(area),
          "deck.material_type": "timber",
          "deck.level_type": "ground",
          "deck.finish_level": "standard",
          "deck.tight_access": "yes",
        },
        answeredFromNotes: [],
      },
    ],
    constraints: [],
    ...emptyRates,
    targetMarginPercent: 20,
    contingencyPercent: 5,
    discovery: null,
    questionsAnswered: 4,
    questionsTotal: 4,
    answeredQuestionKeys: new Set(),
    scopeQuestions: [],
    siteConstraintsAssessed: true,
  };
}

function bathroomInput(): QuickEstimateInput {
  return {
    organisationId: "org-test",
    project: { id: "test", title: "Bathroom" },
    quickEstimate: {
      id: "qe-2",
      client_budget: null,
      target_margin_percent: 20,
      quality_level: "standard",
    },
    workAreas: [
      {
        scopeId: "bath-1",
        name: "Main bathroom",
        workAreaTypeKey: "Bathroom renovation",
        answers: {
          "bathroom.floor_area_m2": "6",
          "bathroom.finish_level": "standard",
          "bathroom.layout_changing": "no",
          "bathroom.tile_extent": "partial",
          "bathroom.waterproofing_included": "yes",
          "bathroom.demolition_included": "yes",
        },
        answeredFromNotes: [],
      },
    ],
    constraints: [],
    ...emptyRates,
    targetMarginPercent: 20,
    contingencyPercent: 5,
    discovery: null,
    questionsAnswered: 5,
    questionsTotal: 5,
    answeredQuestionKeys: new Set(),
    scopeQuestions: [],
    siteConstraintsAssessed: true,
  };
}

function retainingWallInput(): QuickEstimateInput {
  return {
    organisationId: "org-test",
    project: { id: "test", title: "Wall" },
    quickEstimate: {
      id: "qe-3",
      client_budget: null,
      target_margin_percent: 20,
      quality_level: "standard",
    },
    workAreas: [
      {
        scopeId: "wall-1",
        name: "Retaining Wall",
        workAreaTypeKey: "Retaining Wall",
        answers: {
          "retaining_wall.length_m": "7",
          "retaining_wall.height_m": "1.4",
          "retaining_wall.material": "block",
          "retaining_wall.has_drainage": "yes",
          "retaining_wall.has_backfill": "yes",
        },
        answeredFromNotes: [],
      },
    ],
    constraints: [],
    ...emptyRates,
    targetMarginPercent: 20,
    contingencyPercent: 5,
    discovery: null,
    questionsAnswered: 4,
    questionsTotal: 4,
    answeredQuestionKeys: new Set(),
    scopeQuestions: [],
    siteConstraintsAssessed: true,
  };
}

describe("Sprint 13A — component model", () => {
  it("generates estimate components with required fields", () => {
    const input = buildScopeComponentCalcInput(
      "Deck",
      {
        "deck.area_m2": "24",
        "deck.material_type": "timber",
        "deck.level_type": "ground",
        "deck.finish_level": "standard",
      },
      emptyRates,
      "standard"
    );
    const result = calculateScopeFromComponents(input);
    expect(result).not.toBeNull();
    expect(result!.components.length).toBeGreaterThan(0);

    for (const component of result!.components) {
      expect(component).toMatchObject({
        id: expect.any(String),
        scope_type: "deck",
        component_type: expect.any(String),
        quantity: expect.any(Number),
        unit: expect.any(String),
        source: expect.any(String),
        estimated_cost: expect.any(Number),
        confidence: expect.any(Number),
      });
    }
  });

  it("reconciled components sum to scope total", () => {
    const result = calculateQuickEstimateV1(deckInput(24));
    const trace = result.calculationTrace.scopes[0]!;
    const componentSum = trace.components.reduce((sum, c) => sum + c.amount, 0);
    expect(componentSum).toBe(trace.cost.central);
    expect(trace.components.length).toBeGreaterThan(2);
  });
});

describe("Sprint 13A — cost source priority", () => {
  it("uses benchmark component rate when no contractor rates", () => {
    const resolved = resolveComponentRate({
      scopeTypeKey: "deck",
      scopeTemplateKey: "deck",
      workAreaTypeKey: "Deck",
      componentType: "substructure",
      componentUnit: "m²",
      rateWeight: 0.32,
      orgRates: emptyRates,
      finishLevel: "standard",
      scopeUnit: "m²",
      componentBenchmarks: DECK_COMPONENT_BENCHMARKS,
    });
    expect(resolved.source).toBe("benchmark_component_rate");
    expect(resolved.rate).toBe(DECK_COMPONENT_BENCHMARKS.substructure.standard);
  });

  it("uses contractor scope rate when saved scope rate exists", () => {
    const scopeRates: ScopeRate[] = [
      {
        id: "sr-1",
        organisation_id: "org-1",
        scope_type_key: "deck",
        label: "Deck",
        unit: "m²",
        budget_rate: 450,
        standard_rate: 800,
        premium_rate: 900,
        default_rate: null,
        labour_allocation_percent: null,
        materials_allocation_percent: null,
        subcontractor_allocation_percent: null,
        allowance_allocation_percent: null,
        is_active: true,
        created_at: "",
        updated_at: "",
      },
    ];
    const resolved = resolveComponentRate({
      scopeTypeKey: "deck",
      scopeTemplateKey: "deck",
      workAreaTypeKey: "Deck",
      componentType: "decking_boards",
      componentUnit: "m²",
      rateWeight: 0.48,
      orgRates: { ...emptyRates, scopeRates },
      finishLevel: "standard",
      scopeUnit: "m²",
      componentBenchmarks: DECK_COMPONENT_BENCHMARKS,
    });
    expect(resolved.source).toBe("contractor_scope_rate");
    expect(resolved.rate).toBe(Math.round(800 * 0.48));
  });
});

describe("Sprint 13A — trace upgrade", () => {
  it("deck trace shows priced component breakdown", () => {
    const result = calculateQuickEstimateV1(deckInput(24));
    const deck = result.calculationTrace.scopes[0]!;

    const priced = deck.components.filter((c) => c.amount > 0);
    expect(priced.length).toBeGreaterThan(2);
    expect(priced.some((c) => /substructure|decking|frame/i.test(c.label))).toBe(
      true
    );

    const summary = formatComponentTraceSummary("Deck", [
      {
        id: "deck:substructure",
        scope_type: "deck",
        component_type: "substructure",
        quantity: 24,
        unit: "m²",
        source: "benchmark_component_rate",
        estimated_cost: 4000,
        confidence: 55,
      },
      {
        id: "deck:decking_boards",
        scope_type: "deck",
        component_type: "decking_boards",
        quantity: 24,
        unit: "m²",
        source: "benchmark_component_rate",
        estimated_cost: 8000,
        confidence: 55,
      },
    ]);
    expect(summary).toMatch(/Deck = .+\+/);
    expect(summary).toMatch(/\$4/);
    expect(summary).toMatch(/\$8/);
  });

  it("structured breakdown includes component amounts", () => {
    const result = calculateQuickEstimateV1(deckInput());
    const scope = result.estimateTrace.structuredBreakdown?.scopes[0];
    const withAmounts = scope?.components.filter((c) => (c.amount ?? 0) > 0);
    expect(withAmounts?.length).toBeGreaterThan(0);
  });
});

describe("Sprint 13A — QA no regression", () => {
  it("deck estimate still calculates", () => {
    const result = calculateQuickEstimateV1(deckInput());
    expect(result.canCalculate).toBe(true);
    expect(result.centralEstimate).toBeGreaterThan(0);
    expect(result.rateSourceLines[0]?.rateSource).toBe("template_benchmark");
  });

  it("bathroom estimate still calculates", () => {
    const result = calculateQuickEstimateV1(bathroomInput());
    expect(result.canCalculate).toBe(true);
    expect(result.centralEstimate).toBeGreaterThan(0);
  });

  it("retaining wall estimate still calculates", () => {
    const result = calculateQuickEstimateV1(retainingWallInput());
    expect(result.canCalculate).toBe(true);
    expect(result.centralEstimate).toBeGreaterThan(0);
    expect(result.calculationTrace.scopes[0]?.components.length).toBeGreaterThan(
      0
    );
  });

  it("reconcileComponentsToTotal preserves total", () => {
    const reconciled = reconcileComponentsToTotal(
      [
        {
          id: "deck:a",
          scope_type: "deck",
          component_type: "a",
          quantity: 1,
          unit: "each",
          source: "benchmark_component_rate",
          estimated_cost: 100,
          confidence: 55,
        },
        {
          id: "deck:b",
          scope_type: "deck",
          component_type: "b",
          quantity: 1,
          unit: "each",
          source: "benchmark_component_rate",
          estimated_cost: 200,
          confidence: 55,
        },
      ],
      450
    );
    expect(reconciled.reduce((s, c) => s + c.estimated_cost, 0)).toBe(450);
  });
});
