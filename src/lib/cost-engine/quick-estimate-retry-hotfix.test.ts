import { describe, expect, it } from "vitest";
import {
  isEstimateFailureMessage,
  mapEstimateFailureUserMessage,
} from "@/lib/cost-engine/estimate-result";
import { resolveEstimatePanelState } from "@/lib/cost-engine/resolve-estimate-panel-state";

describe("Quick estimate retry hotfix", () => {
  it("detects estimate failure chat messages", () => {
    expect(
      isEstimateFailureMessage("Could not update estimate. Try again.")
    ).toBe(true);
    expect(isEstimateFailureMessage("Thanks, noted.")).toBe(false);
  });

  it("maps schema issues to contractor-friendly copy", () => {
    expect(
      mapEstimateFailureUserMessage(
        "Could not find the 'trace' column of 'quick_estimates' in the schema cache"
      )
    ).toBe(
      "Estimate could not be saved because the database is missing a required field. Retry after the update has been applied."
    );
  });

  it("enables retry on stale failed estimate state", () => {
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
        failureReason: "Something went wrong while calculating.",
      }),
      trace: null,
      trace_version: null,
      estimate_status: "failed",
      failure_reason: "Something went wrong while calculating.",
      last_calculated_at: null,
      created_by: null,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    });

    expect(state?.kind).toBe("failed");
    expect(state?.kind === "failed" ? state.canRetry : null).toBe(true);
  });

  it("does not offer retry when no estimate record exists", () => {
    const state = resolveEstimatePanelState(null);
    expect(state?.kind).toBe("empty");
    expect(state?.kind === "empty" ? state.canRetry : null).toBe(false);
  });
});
