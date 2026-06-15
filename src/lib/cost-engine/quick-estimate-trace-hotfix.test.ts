import { describe, expect, it } from "vitest";
import {
  isMissingTraceColumnError,
  mapEstimateFailureUserMessage,
  stripTraceAndStatusFields,
  TRACE_STORAGE_WARNING,
} from "@/lib/cost-engine/estimate-result";
import { calculateQuickEstimateV1 } from "@/lib/cost-engine/calculate-quick-estimate-v1";
import { resolveEstimatePanelState } from "@/lib/cost-engine/resolve-estimate-panel-state";
import type { QuickEstimateInput } from "@/lib/cost-engine/quick-estimate-input";

function baseInput(
  overrides: Partial<QuickEstimateInput> = {}
): QuickEstimateInput {
  return {
    project: { id: "proj-1", title: "Test project" },
    organisationId: "org-1",
    quickEstimate: {
      id: "qe-1",
      quality_level: "standard",
      client_budget: null,
      target_margin_percent: 20,
    },
    workAreas: [],
    scopeQuestions: [],
    constraints: [],
    scopeRates: [],
    labourRates: [],
    materialRates: [],
    subcontractorRates: [],
    packageRates: [],
    discovery: null,
    sourceNotesLength: 100,
    siteConstraintsAssessed: true,
    answeredQuestionKeys: new Set(),
    allWorkAreasExcluded: false,
    questionsAnswered: 0,
    questionsTotal: 0,
    targetMarginPercent: 20,
    contingencyPercent: 5,
    ...overrides,
  };
}

describe("Quick estimate trace hotfix", () => {
  it("detects missing trace column errors", () => {
    expect(
      isMissingTraceColumnError({
        code: "PGRST204",
        message:
          "Could not find the 'trace' column of 'quick_estimates' in the schema cache",
        details: "",
        hint: "",
        name: "PostgrestError",
      })
    ).toBe(true);
  });

  it("strips trace fields for fallback save", () => {
    expect(
      stripTraceAndStatusFields({
        status: "ready",
        trace: { foo: "bar" },
        trace_version: "1.0",
        estimate_status: "ready",
        failure_reason: null,
        last_calculated_at: "2026-01-01T00:00:00.000Z",
        estimated_cost_low: 1000,
      })
    ).toEqual({
      status: "ready",
      estimated_cost_low: 1000,
    });
  });

  it("maps no priced work areas failure message", () => {
    expect(mapEstimateFailureUserMessage("No priced work areas yet.")).toBe(
      "I need at least one priced work area with enough quantity to calculate an estimate."
    );
  });

  it("produces partial estimate when bathroom is priced and custom scope is not", () => {
    const result = calculateQuickEstimateV1(
      baseInput({
        workAreas: [
          {
            scopeId: "b1",
            name: "Bathroom",
            workAreaTypeKey: "Bathroom renovation",
            answeredFromNotes: [],
            answers: {
              "bathroom.floor_area_m2": "5",
              "bathroom.finish_level": "standard",
              "bathroom.layout_changing": "no",
              "bathroom.tile_extent": "full",
            },
          },
          {
            scopeId: "c1",
            name: "Wine cellar",
            workAreaTypeKey: "Custom Scope",
            answeredFromNotes: [],
            answers: {},
          },
        ],
      })
    );

    expect(result.canCalculate).toBe(true);
    expect(result.estimateStatus).toBe("partial");
    expect(result.unpricedWorkAreas?.map((area) => area.name)).toEqual([
      "Wine cellar",
    ]);
  });

  it("fails clearly when only unsupported custom scope exists", () => {
    const result = calculateQuickEstimateV1(
      baseInput({
        workAreas: [
          {
            scopeId: "c1",
            name: "Wine cellar",
            workAreaTypeKey: "Custom Scope",
            answeredFromNotes: [],
            answers: {},
          },
        ],
      })
    );

    expect(result.canCalculate).toBe(false);
    expect(result.estimateStatus).toBe("failed");
    expect(mapEstimateFailureUserMessage(result.reason)).toBe(
      "This work area is not priced yet. Add a rate or include a supported work area."
    );
  });

  it("shows failed panel state instead of silent empty state", () => {
    const state = resolveEstimatePanelState({
      id: "qe-1",
      organisation_id: "org-1",
      project_id: "proj-1",
      status: "in_progress",
      source_notes: null,
      estimated_cost_low: null,
      estimated_cost_high: null,
      recommended_sell_low: null,
      recommended_sell_high: null,
      target_margin_percent: 20,
      expected_margin_percent: null,
      confidence_level: "low",
      budget_fit: null,
      client_budget: null,
      quality_level: "standard",
      notes: JSON.stringify({
        estimateStatus: "failed",
        failureReason: "No priced work areas yet.",
      }),
      trace: null,
      trace_version: null,
      estimate_status: "failed",
      failure_reason: "No priced work areas yet.",
      last_calculated_at: null,
      created_by: null,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    });

    expect(state?.kind).toBe("failed");
    expect(state?.kind === "failed" ? state.reason : null).toBe(
      "I need at least one priced work area with enough quantity to calculate an estimate."
    );
    expect(state?.kind === "failed" ? state.canRetry : null).toBe(true);
  });

  it("exposes trace storage warning constant", () => {
    expect(TRACE_STORAGE_WARNING).toMatch(/breakdown is still being prepared/i);
  });
});
