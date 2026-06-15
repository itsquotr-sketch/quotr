import { describe, expect, it } from "vitest";
import {
  buildEstimateInsight,
  formatEstimateInsightForExport,
} from "@/lib/cost-engine/build-estimate-insight";
import type { ScopeBreakdownItem } from "@/lib/cost-engine/build-scope-breakdown";

const bathroomScope: ScopeBreakdownItem = {
  scopeName: "Bathroom Renovation",
  workAreaTypeKey: "Bathroom renovation",
  costLow: 23000,
  costHigh: 27000,
  sellLow: 26655,
  sellHigh: 31185,
  quantityLabel: "8m²",
  rateSourceLabel: "Your bathroom rate",
  costDrivers: ["Full-height tiling", "Waterproofing", "Demolition"],
  missing: ["Fixture quality"],
  assumptions: ["Existing plumbing assumed reusable"],
  exclusions: [],
  allocations: {
    labour: 6000,
    materials: 7000,
    subcontractors: 8000,
    allowances: 1000,
    contingency: 1000,
  },
};

describe("Sprint 13B — estimate insight", () => {
  it("builds insight data with allocation and components", () => {
    const insight = buildEstimateInsight({
      scopeBreakdownItems: [bathroomScope],
      confidenceScore: 80,
      costLow: 23000,
      costHigh: 27000,
      sellLow: 26655,
      sellHigh: 31185,
      totalAllocations: bathroomScope.allocations,
      workAreaContexts: [
        {
          scopeName: "Bathroom Renovation",
          workAreaTypeKey: "Bathroom renovation",
          answers: {},
        },
      ],
      actionableMissingItems: [
        {
          scopeId: "scope-1",
          scopeLabel: "Bathroom Renovation",
          factKey: "bathroom.finish_level",
          label: "Bathroom Renovation: fixture quality not confirmed",
          status: "missing",
          importance: "useful",
          affectsEstimate: true,
        },
      ],
    });

    expect(insight.workAreasIncluded).toEqual(["Bathroom Renovation"]);
    expect(insight.confidenceLabel).toBe("High");
    expect(insight.rateSourceSummary).toBe("Your bathroom rate");
    expect(insight.costAllocation.length).toBeGreaterThan(0);
    expect(insight.componentGroups.length).toBe(4);
    expect(insight.costDrivers.length).toBeGreaterThan(0);
    expect(insight.assumptions.length).toBeGreaterThan(0);
    expect(insight.missingDetailGroups[0]?.scopeName).toBe(
      "Bathroom Renovation"
    );
  });

  it("formats PDF-ready export summary", () => {
    const insight = buildEstimateInsight({
      scopeBreakdownItems: [bathroomScope],
      confidenceScore: 80,
      costLow: 23000,
      costHigh: 27000,
      sellLow: 26655,
      sellHigh: 31185,
      totalAllocations: bathroomScope.allocations,
      workAreaContexts: [
        {
          scopeName: "Bathroom Renovation",
          workAreaTypeKey: "Bathroom renovation",
          answers: {},
        },
      ],
    });

    const exported = formatEstimateInsightForExport("Smith Bathroom", insight);
    expect(exported).toMatch(/ESTIMATE SUMMARY/);
    expect(exported).toMatch(/Smith Bathroom/);
    expect(exported).toMatch(/Bathroom Renovation/);
    expect(exported).toMatch(/COST ALLOCATION/);
    expect(exported).toMatch(/Not a client quote/i);
  });
});
