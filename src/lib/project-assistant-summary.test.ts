import { describe, expect, it } from "vitest";
import { parseQuickEstimateSummary } from "@/lib/project-assistant-summary";

describe("parseQuickEstimateSummary estimate trace normalization", () => {
  it("preserves workAreaTraces and structuredBreakdown from persisted notes", () => {
    const notes = JSON.stringify({
      workAreasIncluded: ["Deck", "Retaining Wall"],
      includedTrades: [],
      estimateTrace: {
        scopeKey: "deck",
        quantity: 29,
        unit: "m²",
        baseRate: 650,
        rateSource: "template_benchmark",
        centralEstimate: 50000,
        finishAdjustments: [],
        constraintAdjustments: [],
        contingencyPercent: 5,
        marginPercent: 20,
        confidenceScore: 55,
        rangeFactor: 0.25,
        finalCostRange: { low: 40000, high: 60000 },
        finalSellRange: { low: 50000, high: 75000 },
        missingCriticalFacts: [],
        workAreaTraces: [
          {
            scopeTypeKey: "deck",
            workAreaName: "Deck",
            workAreaTypeKey: "Deck",
            quantity: 29,
            unit: "m²",
            rate: 650,
            rateSource: "template_benchmark",
            finishLevel: "standard",
            centralEstimate: 20000,
            assumptions: ["Tight site access assumed (+8%)"],
          },
          {
            scopeTypeKey: "retaining_wall",
            workAreaName: "Retaining Wall",
            workAreaTypeKey: "Retaining Wall",
            quantity: 9.8,
            unit: "m²",
            rate: 850,
            rateSource: "template_benchmark",
            finishLevel: "standard",
            centralEstimate: 30000,
            assumptions: ["Drainage allowance"],
          },
        ],
        structuredBreakdown: {
          total: {
            costLow: 40000,
            costHigh: 60000,
            costCentral: 50000,
            sellLow: 50000,
            sellHigh: 75000,
            sellCentral: 55000,
            marginPercent: 20,
            rangeQuality: "fair",
          },
          scopes: [
            {
              scopeId: "deck-1",
              scopeTypeKey: "deck",
              label: "Deck",
              included: true,
              quantity: 29,
              unit: "m²",
              rateSource: "template_benchmark",
              rateLabel: "Industry benchmark",
              rateUsed: 650,
              qualityLevel: "standard",
              costLow: 15000,
              costHigh: 25000,
              costCentral: 20000,
              sellLow: 18000,
              sellHigh: 30000,
              sellCentral: 22000,
              allocations: {
                labour: 9000,
                materials: 8000,
                subcontractors: 1000,
                allowances: 1000,
                contingency: 1000,
              },
              components: [],
              assumptions: ["Tight site access assumed (+8%)"],
              exclusions: [],
              missing: [],
            },
          ],
        },
      },
      rateSourceLines: [
        {
          workAreaName: "Deck",
          workAreaTypeKey: "Deck",
          scopeTypeKey: "deck",
          label: "Deck",
          rateSource: "template_benchmark",
          rateSourceLabel: "Industry benchmark",
        },
      ],
      confidenceScore: 55,
    });

    const summary = parseQuickEstimateSummary(notes);
    expect(summary?.estimateTrace?.workAreaTraces).toHaveLength(2);
    expect(summary?.estimateTrace?.workAreaTraces?.[0]?.workAreaName).toBe(
      "Deck"
    );
    expect(summary?.estimateTrace?.structuredBreakdown?.scopes).toHaveLength(1);
    expect(summary?.estimateTrace?.structuredBreakdown?.scopes[0]?.label).toBe(
      "Deck"
    );
  });
});
