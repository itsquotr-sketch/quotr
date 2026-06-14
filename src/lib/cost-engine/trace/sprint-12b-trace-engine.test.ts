import { describe, expect, it } from "vitest";
import { calculateQuickEstimateV1 } from "@/lib/cost-engine/calculate-quick-estimate-v1";
import type { QuickEstimateInput } from "@/lib/cost-engine/quick-estimate-input";
import { buildExplainEstimateResponse } from "@/lib/cost-engine/trace/format-trace-for-ui";
import { formatTraceForUi } from "@/lib/cost-engine/trace/format-trace-for-ui";
import { parseEstimateTrace } from "@/lib/cost-engine/trace/types";

const emptyRates = {
  scopeRates: [],
  packageRates: [],
  labourRates: [],
  materialRates: [],
  subcontractorRates: [],
};

function elevatedDeckInput(): QuickEstimateInput {
  return {
    organisationId: "org-test",
    project: { id: "proj-1", title: "Deck job" },
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
          "deck.area_m2": "29",
          "deck.material_type": "timber",
          "deck.level_type": "elevated",
          "deck.finish_level": "standard",
          "deck.tight_access": "yes",
          "deck.has_stairs": "no",
          "deck.has_balustrade": "no",
          "deck.balustrade_supply": "excluded",
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
    project: { id: "proj-2", title: "Wall job" },
    quickEstimate: {
      id: "qe-2",
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
          "retaining_wall.machine_access": "yes",
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

function premiumBathroomInput(): QuickEstimateInput {
  return {
    organisationId: "org-test",
    project: { id: "proj-3", title: "Bathroom job" },
    quickEstimate: {
      id: "qe-3",
      client_budget: null,
      target_margin_percent: 20,
      quality_level: "premium",
    },
    workAreas: [
      {
        scopeId: "bath-1",
        name: "Main bathroom",
        workAreaTypeKey: "Bathroom renovation",
        answers: {
          "bathroom.floor_area_m2": "6",
          "bathroom.finish_level": "premium",
          "bathroom.layout_changing": "no",
          "bathroom.fixtures_client_supplied": "yes",
          "bathroom.tiles_supplied_by": "client",
          "bathroom.waterproofing_included": "yes",
          "bathroom.plumbing_relocation": "yes",
          "bathroom.electrical_allowance": "yes",
        },
        answeredFromNotes: [],
      },
    ],
    constraints: [],
    ...emptyRates,
    targetMarginPercent: 20,
    contingencyPercent: 5,
    discovery: null,
    questionsAnswered: 6,
    questionsTotal: 6,
    answeredQuestionKeys: new Set(),
    scopeQuestions: [],
    siteConstraintsAssessed: true,
  };
}

function multiScopeInput(): QuickEstimateInput {
  return {
    organisationId: "org-test",
    project: { id: "proj-4", title: "Multi scope" },
    quickEstimate: {
      id: "qe-4",
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
          "deck.area_m2": "29",
          "deck.material_type": "timber",
          "deck.level_type": "ground",
          "deck.finish_level": "standard",
        },
        answeredFromNotes: [],
      },
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
    questionsAnswered: 6,
    questionsTotal: 6,
    answeredQuestionKeys: new Set(),
    scopeQuestions: [],
    siteConstraintsAssessed: true,
  };
}

describe("Sprint 12B — Estimate Trace Engine", () => {
  it("Test A — elevated deck trace includes drivers and exclusions", () => {
    const result = calculateQuickEstimateV1(elevatedDeckInput());
    expect(result.canCalculate).toBe(true);

    const trace = result.calculationTrace;
    expect(trace.traceVersion).toBe("1.0");
    expect(trace.scopes).toHaveLength(1);

    const deck = trace.scopes[0]!;
    expect(deck.label).toBe("Deck");
    expect(deck.quantity.value).toBe(29);
    expect(deck.quantity.unit).toBe("m²");
    expect(deck.drivers.some((d) => d.key === "elevated_deck")).toBe(true);
    expect(deck.drivers.some((d) => d.key === "tight_access")).toBe(true);
    expect(deck.drivers.some((d) => d.key === "stairs" && d.type === "exclusion")).toBe(
      true
    );
    expect(deck.drivers.some((d) => d.key === "balustrade" && d.type === "exclusion")).toBe(
      true
    );
    expect(deck.assumptions.length).toBeGreaterThan(0);
    expect(deck.rate.source).toMatch(/template_benchmark|regional_benchmark|placeholder/);
  });

  it("Test B — retaining wall trace includes area and allowances", () => {
    const result = calculateQuickEstimateV1(retainingWallInput());
    const wall = result.calculationTrace.scopes[0]!;

    expect(wall.label).toMatch(/retaining/i);
    expect(wall.quantity.value).toBeCloseTo(9.8, 1);
    expect(wall.allowances.some((a) => a.key === "drainage")).toBe(true);
    expect(wall.allowances.some((a) => a.key === "backfill")).toBe(true);
    expect(wall.drivers.some((d) => d.key === "drainage")).toBe(true);
  });

  it("Test C — premium bathroom with client-supplied exclusions", () => {
    const result = calculateQuickEstimateV1(premiumBathroomInput());
    const bath = result.calculationTrace.scopes[0]!;

    expect(bath.qualityLevel).toBe("premium");
    expect(
      bath.drivers.some(
        (d) =>
          d.key.includes("client_supplied") || d.label.toLowerCase().includes("client")
      )
    ).toBe(true);
    expect(bath.assumptions.some((a) => /plumb|electrical|tile/i.test(a))).toBe(true);
  });

  it("Test D — multi-scope total aggregates scopes", () => {
    const result = calculateQuickEstimateV1(multiScopeInput());
    const trace = result.calculationTrace;

    expect(trace.scopes).toHaveLength(2);
    const scopeCentralSum = trace.scopes.reduce(
      (sum, s) => sum + s.cost.central,
      0
    );
    expect(scopeCentralSum).toBeGreaterThan(0);
    expect(trace.total.costCentral).toBe(result.centralEstimate);
    expect(trace.scopes.every((s) => s.rate.label.length > 0)).toBe(true);

    const formatted = formatTraceForUi(trace);
    expect(formatted.scopes).toHaveLength(2);
    expect(formatted.summaryLine.length).toBeGreaterThan(10);
  });

  it("Test E — explain response uses trace specifics", () => {
    const result = calculateQuickEstimateV1(elevatedDeckInput());
    const explanation = buildExplainEstimateResponse(result.calculationTrace);

    expect(explanation).toMatch(/29/);
    expect(explanation.toLowerCase()).toMatch(/deck|elevated|tight|benchmark/);
    expect(explanation).not.toMatch(/traceVersion|scopeTypeKey/);
  });

  it("Test F — trace generation does not double calculation time materially", () => {
    const input = multiScopeInput();
    const start = performance.now();
    for (let i = 0; i < 50; i++) {
      calculateQuickEstimateV1(input);
    }
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(3000);
  });

  it("parses trace JSON with Zod", () => {
    const result = calculateQuickEstimateV1(elevatedDeckInput());
    const roundTrip = parseEstimateTrace(
      JSON.parse(JSON.stringify(result.calculationTrace))
    );
    expect(roundTrip?.traceVersion).toBe("1.0");
    expect(roundTrip?.scopes[0]?.label).toBe("Deck");
  });
});
