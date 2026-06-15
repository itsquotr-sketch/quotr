import { describe, expect, it } from "vitest";
import { buildEstimateInsight } from "@/lib/cost-engine/build-estimate-insight";
import {
  allocateScopeComponents,
  groupAllocatedComponents,
  resolveAllocationComponentIncluded,
} from "@/lib/cost-engine/component-allocation/allocate-scope-components";
import type { ScopeBreakdownItem } from "@/lib/cost-engine/build-scope-breakdown";
import { bathroomRenovationScopeTemplate } from "@/lib/scopes/templates/bathroom-renovation";
import { deckScopeTemplate } from "@/lib/scopes/templates/deck";
import { kitchenRenovationScopeTemplate } from "@/lib/scopes/templates/kitchen-renovation";
import { retainingWallScopeTemplate } from "@/lib/scopes/templates/retaining-wall";
import { fenceScopeTemplate } from "@/lib/scopes/templates/stubs";

function scopeItem(
  scopeName: string,
  workAreaTypeKey: string,
  central: number,
  allocations: ScopeBreakdownItem["allocations"]
): ScopeBreakdownItem {
  return {
    scopeName,
    workAreaTypeKey,
    costLow: Math.round(central * 0.9),
    costHigh: Math.round(central * 1.1),
    sellLow: Math.round(central * 1.15),
    sellHigh: Math.round(central * 1.25),
    quantityLabel: null,
    rateSourceLabel: "Benchmark rate",
    costDrivers: [],
    missing: [],
    assumptions: [],
    exclusions: [],
    allocations,
  };
}

function assertAllCategoriesPopulated(
  groups: ReturnType<typeof groupAllocatedComponents>,
  scopeLabel: string
) {
  const categories = ["labour", "materials", "subcontractors", "allowances"] as const;
  for (const category of categories) {
    const group = groups.find((row) => row.key === category);
    expect(group, `${scopeLabel} missing ${category}`).toBeDefined();
    expect(group!.components.length, `${scopeLabel} ${category} empty`).toBeGreaterThan(
      0
    );
    expect(group!.totalAmount, `${scopeLabel} ${category} amount`).toBeGreaterThan(0);
  }

  const labels = groups.flatMap((group) =>
    group.components.map((component) => component.label.toLowerCase())
  );
  expect(new Set(labels).size, `${scopeLabel} duplicate component labels`).toBe(
    labels.length
  );
}

describe("Sprint 13B.1 — component allocation engine", () => {
  it("includes baseline bathroom trades without explicit user answers", () => {
    const allocated = allocateScopeComponents({
      workAreaTypeKey: bathroomRenovationScopeTemplate.workAreaTypeKey,
      scopeCentral: 25000,
      answers: {},
    });
    const groups = groupAllocatedComponents(allocated);
    const subcontractorLabels = groups
      .find((group) => group.key === "subcontractors")
      ?.components.map((component) => component.label);

    expect(subcontractorLabels).toEqual(
      expect.arrayContaining(["Plumber", "Electrician", "Waterproofer", "Tiler"])
    );
  });

  it("splits waterproofing across subcontractor and materials", () => {
    const allocated = allocateScopeComponents({
      workAreaTypeKey: bathroomRenovationScopeTemplate.workAreaTypeKey,
      scopeCentral: 25000,
      answers: {},
      pricedComponents: [
        { key: "waterproofing", amount: 5000, label: "Waterproofing" },
      ],
    });

    const labels = allocated.map((row) => row.label);
    expect(labels).toContain("Waterproofer");
    expect(labels).toContain("Waterproofing materials");
    expect(labels).not.toContain("Waterproofing");
    expect(
      allocated.find((row) => row.label === "Waterproofer")?.category
    ).toBe("subcontractors");
    expect(
      allocated.find((row) => row.label === "Waterproofing materials")?.category
    ).toBe("materials");
  });

  it("QA — bathroom breakdown populated across categories", () => {
    const insight = buildEstimateInsight({
      scopeBreakdownItems: [
        scopeItem("Bathroom Renovation", "Bathroom renovation", 25000, {
          labour: 5000,
          materials: 7500,
          subcontractors: 8750,
          allowances: 1250,
          contingency: 1250,
        }),
      ],
      confidenceScore: 80,
      costLow: 23000,
      costHigh: 27000,
      totalAllocations: {
        labour: 5000,
        materials: 7500,
        subcontractors: 8750,
        allowances: 1250,
        contingency: 1250,
      },
      workAreaContexts: [
        {
          scopeName: "Bathroom Renovation",
          workAreaTypeKey: "Bathroom renovation",
          answers: {},
        },
      ],
    });

    assertAllCategoriesPopulated(insight.componentGroups, "Bathroom");
    expect(
      insight.componentGroups
        .find((group) => group.key === "subcontractors")
        ?.components.map((component) => component.label)
    ).toEqual(expect.arrayContaining(["Plumber", "Electrician", "Waterproofer", "Tiler"]));
  });

  it.each([
    ["Kitchen", kitchenRenovationScopeTemplate.workAreaTypeKey, 38000],
    ["Deck", deckScopeTemplate.workAreaTypeKey, 15000],
    ["Retaining Wall", retainingWallScopeTemplate.workAreaTypeKey, 18000],
    ["Fence", fenceScopeTemplate.workAreaTypeKey, 8000],
  ])("QA — %s breakdown populated across categories", (label, workAreaTypeKey, central) => {
    const allocated = allocateScopeComponents({
      workAreaTypeKey,
      scopeCentral: central,
      answers: {},
    });
    assertAllCategoriesPopulated(groupAllocatedComponents(allocated), label);
  });

  it("respects exclusion facts for fixtures", () => {
    const fixtureDef =
      bathroomRenovationScopeTemplate.pricing.componentAllocation!.materials.find(
        (row) => row.key === "fixtures_allowance"
      )!;

    expect(
      resolveAllocationComponentIncluded(fixtureDef, {
        "bathroom.fixtures_client_supplied": "yes",
      })
    ).toBe(false);
  });
});
