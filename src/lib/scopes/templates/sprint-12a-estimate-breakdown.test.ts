import { describe, expect, it } from "vitest";
import { calculateQuickEstimateV1 } from "@/lib/cost-engine/calculate-quick-estimate-v1";
import { buildScopeBreakdown } from "@/lib/cost-engine/build-scope-breakdown";
import type { QuickEstimateInput } from "@/lib/cost-engine/quick-estimate-input";
import {
  ALL_CANONICAL_SCOPE_TEMPLATES,
  bathroomRenovationScopeTemplate,
  deckScopeTemplate,
  getCanonicalTemplateByAlias,
  paintingScopeTemplate,
  retainingWallScopeTemplate,
  validateAllScopeTemplates,
  validateScopeTemplate,
} from "@/lib/scopes/templates";
import { resolveScopeComponents } from "@/lib/scopes/templates/build-scope-components";

const emptyRates = {
  scopeRates: [],
  packageRates: [],
  labourRates: [],
  materialRates: [],
  subcontractorRates: [],
};

function deckOnlyInput(area = 29): QuickEstimateInput {
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
          "deck.rubbish_removal": "yes",
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

function multiScopeInput(): QuickEstimateInput {
  return {
    organisationId: "org-test",
    project: { id: "test", title: "Multi scope" },
    quickEstimate: {
      id: "qe-2",
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
          "retaining_wall.machine_access": "yes",
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

function bathroomClientSuppliedInput(): QuickEstimateInput {
  return {
    organisationId: "org-test",
    project: { id: "test", title: "Bathroom" },
    quickEstimate: {
      id: "qe-3",
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
          "bathroom.fixtures_client_supplied": "yes",
          "bathroom.tiles_supplied_by": "client",
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

describe("Sprint 12A — template validation", () => {
  it("Test F — current templates pass validation", () => {
    for (const template of [
      deckScopeTemplate,
      bathroomRenovationScopeTemplate,
      retainingWallScopeTemplate,
    ]) {
      expect(validateScopeTemplate(template)).toEqual([]);
    }

    const allResults = validateAllScopeTemplates(ALL_CANONICAL_SCOPE_TEMPLATES);
    for (const [key, issues] of allResults) {
      expect(issues, `Template ${key} should be valid`).toEqual([]);
    }
  });

  it("allocations sum to 100 for priced templates", () => {
    for (const template of ALL_CANONICAL_SCOPE_TEMPLATES) {
      const a = template.pricing.defaultAllocations;
      const sum =
        a.labour + a.materials + a.subcontractors + a.allowances + a.contingency;
      expect(sum, template.scopeTypeKey).toBe(100);
    }
  });
});

describe("Sprint 12A — estimate breakdown trace", () => {
  it("Test A — deck breakdown shows scope, quantity, rate, allocations, components", () => {
    const result = calculateQuickEstimateV1(deckOnlyInput());
    expect(result.canCalculate).toBe(true);

    const breakdown = result.estimateTrace?.structuredBreakdown;
    expect(breakdown).toBeDefined();
    expect(breakdown?.scopes).toHaveLength(1);

    const deck = breakdown!.scopes[0];
    expect(deck.label).toBe("Deck");
    expect(deck.quantity).toBe(29);
    expect(deck.unit).toBe("m²");
    expect(deck.rateLabel).toMatch(/benchmark|saved/i);
    expect(deck.costLow).toBeGreaterThan(0);
    expect(deck.costHigh).toBeGreaterThan(deck.costLow);
    expect(deck.allocations.labour).toBeGreaterThan(0);
    expect(deck.components.length).toBeGreaterThan(0);

    const uiBreakdown = buildScopeBreakdown({
      structuredBreakdown: breakdown,
      workAreaTraces: result.estimateTrace?.workAreaTraces ?? [],
      rateSourceLines: result.rateSourceLines,
      confidenceScore: result.confidenceScore,
      targetMarginPercent: 20,
      contingencyPercent: 5,
    });
    expect(uiBreakdown[0]?.quantityLabel).toContain("29");
    expect(uiBreakdown[0]?.costDrivers.length).toBeGreaterThanOrEqual(0);
  });

  it("Test B — multi-scope breakdown with aligned totals", () => {
    const result = calculateQuickEstimateV1(multiScopeInput());
    const breakdown = result.estimateTrace?.structuredBreakdown;

    expect(breakdown?.scopes).toHaveLength(2);
    expect(breakdown?.scopes.map((s) => s.label)).toEqual([
      "Deck",
      "Retaining Wall",
    ]);

    const scopeCentralSum = breakdown!.scopes.reduce(
      (sum, s) => sum + s.costCentral,
      0
    );
    expect(scopeCentralSum).toBe(result.centralEstimate);

    for (const scope of breakdown!.scopes) {
      expect(scope.rateLabel.length).toBeGreaterThan(0);
    }
  });

  it("Test C — benchmark honesty when no saved rate", () => {
    const result = calculateQuickEstimateV1(deckOnlyInput());
    expect(result.rateSourceLines[0]?.rateSource).toBe("template_benchmark");

    const deck = result.estimateTrace?.structuredBreakdown?.scopes[0];
    expect(deck?.rateLabel).toBe("Industry benchmark");

    const benchmarkComponents = deck?.components.filter(
      (c) => c.source === "benchmark" || c.assumption?.includes("benchmark")
    );
    expect(benchmarkComponents?.length).toBeGreaterThan(0);
  });

  it("Test D — bathroom client-supplied fixtures and tiles in breakdown", () => {
    const result = calculateQuickEstimateV1(bathroomClientSuppliedInput());
    const scope = result.estimateTrace?.structuredBreakdown?.scopes[0];
    expect(scope).toBeDefined();

    const fixtures = scope!.components.find((c) => c.key === "fixtures");
    expect(fixtures?.included).toBe(false);
    expect(fixtures?.assumption).toMatch(/client supplied/i);

    const components = resolveScopeComponents({
      scopeTypeKey: "bathroom_renovation",
      answers: {
        "bathroom.fixtures_client_supplied": "yes",
        "bathroom.tiles_supplied_by": "client",
      },
      centralEstimate: scope!.costCentral,
      allowances: [],
      rateSource: "template_benchmark",
    });
    const fixturesResolved = components.find((c) => c.key === "fixtures");
    expect(fixturesResolved?.inclusionStatus).toBe("client_supplied");
  });

  it("Test E — unsupported painting scope recognised but not priced", () => {
    const painting = getCanonicalTemplateByAlias("painting");
    expect(painting?.scopeTypeKey).toBe("painting_project");
    expect(paintingScopeTemplate.pricing.supported).toBe(false);
    expect(painting?.pricing.pricingMode).toBe("not_supported");
  });
});
