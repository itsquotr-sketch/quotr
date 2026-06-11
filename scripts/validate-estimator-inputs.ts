/**
 * Sprint 6A — validates estimate engine behaviour.
 * Run: npx tsx scripts/validate-estimator-inputs.ts
 */
import { calculateQuickEstimateV1 } from "../src/lib/cost-engine/calculate-quick-estimate-v1";
import type { QuickEstimateInput } from "../src/lib/cost-engine/quick-estimate-input";

const emptyRates = {
  packageRates: [],
  labourRates: [],
  materialRates: [],
  subcontractorRates: [],
};

function baseInput(
  workAreaTypeKey: string,
  name: string,
  answers: Record<string, string>,
  overrides: Partial<QuickEstimateInput> = {}
): QuickEstimateInput {
  return {
    project: { id: "test", title: "Test" },
    quickEstimate: {
      id: "qe-1",
      client_budget: null,
      target_margin_percent: overrides.targetMarginPercent ?? 20,
      quality_level: overrides.quickEstimate?.quality_level ?? "standard",
    },
    workAreas: [
      {
        scopeId: "s1",
        name,
        workAreaTypeKey,
        answers,
        answeredFromNotes: [],
      },
    ],
    constraints: overrides.constraints ?? [],
    ...emptyRates,
    targetMarginPercent: overrides.targetMarginPercent ?? 20,
    contingencyPercent: overrides.contingencyPercent ?? 5,
    discovery: null,
    questionsAnswered: Object.keys(answers).length,
    questionsTotal: Object.keys(answers).length,
    answeredQuestionKeys: new Set(Object.keys(answers)),
    scopeQuestions: [],
    ...overrides,
  };
}

function deckInput(
  overrides: Partial<QuickEstimateInput> & {
    area: number;
    answers?: Record<string, string>;
    quality?: QuickEstimateInput["quickEstimate"]["quality_level"];
    margin?: number;
    constraints?: QuickEstimateInput["constraints"];
  }
): QuickEstimateInput {
  const answers = {
    "deck.area_m2": String(overrides.area),
    "deck.material_type": "timber",
    "deck.level_type": "ground",
    "deck.finish_level": "standard",
    ...overrides.answers,
  };

  return baseInput("Deck", "Deck", answers, {
    targetMarginPercent: overrides.margin ?? 20,
    quickEstimate: {
      id: "qe-1",
      client_budget: null,
      target_margin_percent: overrides.margin ?? 20,
      quality_level: overrides.quality ?? "standard",
    },
    constraints: overrides.constraints ?? [],
  });
}

function assertDifferent(
  label: string,
  a: number | null,
  b: number | null,
  minPct = 5
) {
  if (a == null || b == null) throw new Error(`${label}: null estimate`);
  const pct = (Math.abs(a - b) / ((a + b) / 2)) * 100;
  if (pct < minPct) {
    throw new Error(`${label}: only ${pct.toFixed(1)}% diff (${a} vs ${b})`);
  }
  console.log(`✓ ${label}: ${pct.toFixed(1)}% difference`);
}

function assertMaxRangeWidth(
  label: string,
  low: number | null,
  high: number | null,
  central: number | null,
  maxPct: number
) {
  if (low == null || high == null || central == null || central <= 0) {
    throw new Error(`${label}: missing range values`);
  }
  const widthPct = ((high - low) / central) * 100;
  if (widthPct > maxPct + 1) {
    throw new Error(`${label}: range ${widthPct.toFixed(1)}% exceeds max ${maxPct}%`);
  }
  console.log(`✓ ${label}: range width ${widthPct.toFixed(1)}% (max ${maxPct}%)`);
}

// Area scaling
const e20 = calculateQuickEstimateV1(deckInput({ area: 20 }));
const e50 = calculateQuickEstimateV1(deckInput({ area: 50 }));
const e100 = calculateQuickEstimateV1(deckInput({ area: 100 }));
assertDifferent("Area 20 vs 50", e20.estimatedCostTypical, e50.estimatedCostTypical, 50);
assertDifferent("Area 50 vs 100", e50.estimatedCostTypical, e100.estimatedCostTypical, 50);

// Finish level
const budget = calculateQuickEstimateV1(
  deckInput({ area: 50, quality: "budget", answers: { "deck.material_type": "unknown" } })
);
const premium = calculateQuickEstimateV1(
  deckInput({ area: 50, quality: "premium", answers: { "deck.material_type": "unknown" } })
);
assertDifferent("Finish budget vs premium", budget.estimatedCostTypical, premium.estimatedCostTypical, 10);

// Constraints
const noConstraint = calculateQuickEstimateV1(deckInput({ area: 50 }));
const tightAccess = calculateQuickEstimateV1(
  deckInput({
    area: 50,
    constraints: [{ slug: "deck-restricted-access", label: "Restricted access" }],
  })
);
assertDifferent(
  "Tight access constraint",
  noConstraint.estimatedCostTypical,
  tightAccess.estimatedCostTypical,
  3
);

// Margin on sell
const m10 = calculateQuickEstimateV1(deckInput({ area: 50, margin: 10 }));
const m30 = calculateQuickEstimateV1(deckInput({ area: 50, margin: 30 }));
assertDifferent("Margin 10% vs 30% sell", m10.recommendedSellHigh, m30.recommendedSellHigh, 15);

// Sprint 6A — Deck test case (50m² timber, tight access, no balustrade)
const deckCase = calculateQuickEstimateV1(
  deckInput({
    area: 50,
    answers: {
      "deck.material_type": "timber",
      "deck.finish_level": "standard",
      "deck.has_balustrade": "no",
    },
    constraints: [{ slug: "tight-access", label: "Tight access" }],
  })
);
assertMaxRangeWidth(
  "Deck 50m² key facts",
  deckCase.estimatedCostLow,
  deckCase.estimatedCostHigh,
  deckCase.centralEstimate,
  25
);

// Retaining wall — 15m × 3m = 45m²
const wallCase = calculateQuickEstimateV1(
  baseInput("Retaining Wall", "Retaining wall", {
    "retaining_wall.length_m": "15",
    "retaining_wall.height_m": "3",
    "retaining_wall.has_drainage": "yes",
    "retaining_wall.carting_distance_m": "20",
  }, {
    constraints: [{ slug: "retaining-carting-distance", label: "Carting distance", metres: 20 }],
  })
);
assertMaxRangeWidth(
  "Retaining wall key facts",
  wallCase.estimatedCostLow,
  wallCase.estimatedCostHigh,
  wallCase.centralEstimate,
  25
);

// Bathroom — 6m² premium
const bathCase = calculateQuickEstimateV1(
  baseInput("Bathroom renovation", "Bathroom", {
    "bathroom.floor_area_m2": "6",
    "bathroom.finish_level": "premium",
    "bathroom.layout_changing": "no",
    "bathroom.tile_extent": "full",
  }, {
    quickEstimate: {
      id: "qe-1",
      client_budget: null,
      target_margin_percent: 20,
      quality_level: "premium",
    },
  })
);
assertMaxRangeWidth(
  "Bathroom key facts",
  bathCase.estimatedCostLow,
  bathCase.estimatedCostHigh,
  bathCase.centralEstimate,
  25
);

console.log("\nAll estimator input validations passed.");
