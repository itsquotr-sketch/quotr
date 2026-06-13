import { describe, expect, it } from "vitest";
import { calculateQuickEstimateV1 } from "@/lib/cost-engine/calculate-quick-estimate-v1";
import type { QuickEstimateInput } from "@/lib/cost-engine/quick-estimate-input";
import type { ProjectAllowance, ScopeRate } from "@/types/database";

const emptyRates = {
  scopeRates: [] as ScopeRate[],
  packageRates: [],
  labourRates: [],
  materialRates: [],
  subcontractorRates: [],
};

function deckInput(
  userAllowances: ProjectAllowance[] = []
): QuickEstimateInput {
  return {
    project: { id: "test", title: "Test" },
    quickEstimate: {
      id: "qe-1",
      client_budget: null,
      target_margin_percent: 20,
      quality_level: "standard",
    },
    workAreas: [
      {
        scopeId: "s1",
        name: "Deck",
        workAreaTypeKey: "Deck",
        answers: {
          "deck.area_m2": "50",
          "deck.material_type": "timber",
          "deck.level_type": "ground",
        },
        answeredFromNotes: [],
      },
    ],
    constraints: [],
    ...emptyRates,
    targetMarginPercent: 20,
    contingencyPercent: 5,
    discovery: null,
    questionsAnswered: 2,
    questionsTotal: 2,
    answeredQuestionKeys: new Set(["deck.area_m2"]),
    scopeQuestions: [],
    siteConstraintsAssessed: true,
    userAllowances,
  };
}

function makeAllowance(amount: number): ProjectAllowance {
  return {
    id: "allow-1",
    organisation_id: "org-1",
    project_id: "test",
    project_scope_id: null,
    allowance_key: "rubbish_removal",
    label: "Rubbish removal",
    amount,
    source: "user",
    note: null,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

describe("user allowances in estimate", () => {
  it("adds user allowance to central estimate", () => {
    const without = calculateQuickEstimateV1(deckInput());
    const withAllowance = calculateQuickEstimateV1(
      deckInput([makeAllowance(2000)])
    );

    expect(without.centralEstimate).not.toBeNull();
    expect(withAllowance.centralEstimate).not.toBeNull();
    expect(withAllowance.centralEstimate!).toBe(
      (without.centralEstimate ?? 0) + 2000
    );
    expect(withAllowance.allowances.some((a) => a.includes("user allowance"))).toBe(
      true
    );
  });

  it("includes user allowances in cost breakdown", () => {
    const result = calculateQuickEstimateV1(deckInput([makeAllowance(2000)]));

    expect(result.estimateTrace.costBreakdown?.allowances).toBeGreaterThan(0);
    expect(
      result.estimateTrace.costBreakdown?.byWorkArea.some(
        (row) => row.name === "User allowances"
      )
    ).toBe(true);
  });
});
