import type { ScopeTemplate } from "@/lib/scope-templates/types";
import { getScopeRateDefinitionByKey } from "@/lib/constants/scope-rates";
import { resolveMaterialCategory } from "@/lib/scopes/material-categories";
import { getAnswerValue } from "@/lib/question-keys";
import {
  getBaseRateForScope,
  type OrgRatesInput,
  type RateSource,
} from "@/lib/cost-engine/rates/get-base-rate-for-scope";
import {
  rateUnitsMatch,
  scopeRateAllocation,
} from "@/lib/cost-engine/rates/scope-rate-utils";
import { templateAllocationPercents } from "@/lib/cost-engine/build-cost-breakdown";
import type { WorkAreaAllocationBreakdown } from "@/lib/cost-engine/estimate-trace";
import { PLACEHOLDER_BASE_RANGES } from "@/lib/constants/quick-estimate";
import { KITCHEN_SIZE_BENCHMARKS } from "@/lib/scopes/kitchen-renovation";
import type { QualityLevel } from "@/lib/constants/quality-level";
import type { ScopeRateAllocation } from "@/lib/cost-engine/rates/scope-rate-utils";
import type { EstimateTraceDriver } from "@/lib/cost-engine/trace/types";
import {
  buildScopeComponentCalcInput,
  calculateScopeFromComponents,
  reconcileComponentsToTotal,
  type EstimateComponent,
} from "@/lib/cost-engine/estimate-components";

export type TemplateCalculationResult = {
  centralEstimate: number;
  quantity: number;
  unit: string;
  baseRate: number;
  rateSource: RateSource;
  /** True when low/typical/high rate was chosen from finish level in getBaseRateForScope. */
  finishEncodedInRate: boolean;
  confidenceBonus: number;
  usedPackage: boolean;
  usedTemplate: boolean;
  templateKey: string;
  scopeTypeKey: string;
  scopeRateId?: string;
  usesDefaultRateOnly?: boolean;
  scopeAllocation?: ScopeRateAllocation | null;
  allocationBreakdown?: WorkAreaAllocationBreakdown;
  missing: string[];
  inputs: string[];
  allowances: string[];
  assumptions: string[];
  confidenceReason: string | null;
  traceDrivers: EstimateTraceDriver[];
  /** Internal component breakdown — foundation for detailed estimates and RFQs. */
  estimateComponents?: EstimateComponent[];
};

function parseNumber(value: string | undefined): number | null {
  if (value === undefined) return null;
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? num : null;
}

function isYes(value: string | undefined): boolean {
  return value === "yes";
}

function applyPercentDriver(
  central: number,
  driver: Omit<EstimateTraceDriver, "amountImpact">,
  percent: number
): { central: number; driver: EstimateTraceDriver } {
  const after = Math.round(central * (1 + percent / 100));
  return {
    central: after,
    driver: {
      ...driver,
      value: percent,
      amountImpact: after - central,
    },
  };
}

function applyFlatDriver(
  central: number,
  driver: Omit<EstimateTraceDriver, "amountImpact">,
  amount: number
): { central: number; driver: EstimateTraceDriver } {
  return {
    central: central + amount,
    driver: {
      ...driver,
      value: amount,
      amountImpact: amount,
    },
  };
}

function checkRequiredFacts(
  template: ScopeTemplate,
  answers: Record<string, string>
): boolean {
  if (template.estimateRules.calculationType === "fence_length") {
    const length = parseNumber(getAnswerValue(answers, "fence.length_m"));
    const height = parseNumber(getAnswerValue(answers, "fence.height_m"));
    const hasType =
      Boolean(getAnswerValue(answers, "fence.fence_type")) ||
      Boolean(getAnswerValue(answers, "fence.material_type"));
    return Boolean(length && height && hasType);
  }

  return template.estimateRules.requiredFactKeys.every((key) =>
    Boolean(parseNumber(getAnswerValue(answers, key)))
  );
}

function resolveDeckMaterial(
  answers: Record<string, string>,
  effectiveQualityLevel: QualityLevel
): string | null {
  const resolved = resolveMaterialCategory({
    scopeTypeKey: "deck",
    answers,
  });
  if (resolved) return resolved.categoryValue;

  const material = getAnswerValue(answers, "deck.material_type");
  if (material && material !== "unknown") return material;
  if (effectiveQualityLevel === "budget") return "treated_pine";
  if (effectiveQualityLevel === "premium") return "composite";
  return null;
}

function resolveFinishLevel(
  answers: Record<string, string>,
  effectiveQualityLevel: QualityLevel,
  scopeFinishKey: string
): "budget" | "standard" | "premium" | "unknown" {
  if (effectiveQualityLevel !== "unknown") return effectiveQualityLevel;
  const scopeFinish = getAnswerValue(answers, scopeFinishKey) ?? "standard";
  if (scopeFinish === "budget" || scopeFinish === "premium") return scopeFinish;
  if (scopeFinish === "standard") return "standard";
  return "unknown";
}

function applyMaterialRateAdjustment(
  baseRate: number,
  material: string | null,
  rates: { low: number; typical: number; high: number },
  source: RateSource
): number {
  if (source !== "template_benchmark" && source !== "regional_fallback") {
    return baseRate;
  }
  if (!material) return baseRate;

  const resolved = resolveMaterialCategory({
    scopeTypeKey: "deck",
    answers: { "deck.material_type": material },
  });

  if (resolved) {
    if (resolved.benchmarkTier === "premium") return rates.high;
    if (resolved.benchmarkTier === "budget") return rates.low;
    return rates.typical;
  }

  if (material === "composite") return rates.high;
  if (material === "treated_pine" || material === "timber") return rates.low;
  if (material === "hardwood_timber") return rates.typical;
  return baseRate;
}

function resolveAllocationBreakdown(
  scopeAllocation: ScopeRateAllocation | null | undefined,
  workAreaTypeKey: string
): WorkAreaAllocationBreakdown {
  if (scopeAllocation) {
    return {
      labourPercent: Math.round(scopeAllocation.labour * 100),
      materialsPercent: Math.round(scopeAllocation.materials * 100),
      subcontractorsPercent: Math.round(scopeAllocation.subcontractors * 100),
      allowancesPercent: Math.round(scopeAllocation.allowances * 100),
      source: "scope_rate",
    };
  }
  return templateAllocationPercents(workAreaTypeKey);
}

function findActiveScopeRate(
  orgRates: OrgRatesInput,
  scopeTypeKey: string,
  unit: string
) {
  return orgRates.scopeRates.find(
    (rate) =>
      rate.is_active &&
      rate.scope_type_key === scopeTypeKey &&
      rateUnitsMatch(rate.unit, unit)
  );
}

export function calculateFromTemplate(
  template: ScopeTemplate,
  answers: Record<string, string>,
  orgRates: OrgRatesInput,
  effectiveQualityLevel: QualityLevel = "unknown"
): TemplateCalculationResult {
  const hasAll = checkRequiredFacts(template, answers);
  const inputs: string[] = [];
  const allowances: string[] = [];
  const assumptions: string[] = [];
  const traceDrivers: EstimateTraceDriver[] = [];
  let centralEstimate = 0;
  let quantity = 0;
  let unit = template.benchmarkRates.unit;
  let usedPackage = false;
  const scopeDef = getScopeRateDefinitionByKey(template.key);
  const scopeTypeKey = scopeDef?.scopeTypeKey ?? template.key;

  const finishLevel = resolveFinishLevel(
    answers,
    effectiveQualityLevel,
    template.key.includes("bathroom")
      ? "bathroom.finish_level"
      : "deck.finish_level"
  );

  const {
    rate: baseRate,
    source: rateSource,
    confidenceBonus,
    scopeRateId,
    usesDefaultRateOnly,
  } = getBaseRateForScope(
    template.key,
    template.workAreaTypeKey,
    unit,
    orgRates,
    finishLevel
  );

  const matchedScopeRate = findActiveScopeRate(orgRates, scopeTypeKey, unit);
  const scopeAllocation = matchedScopeRate
    ? scopeRateAllocation(matchedScopeRate)
    : null;
  const allocationBreakdown = resolveAllocationBreakdown(
    scopeAllocation,
    template.workAreaTypeKey
  );

  const finishEncodedInRate =
    finishLevel !== "unknown" &&
    (rateSource === "template_benchmark" || rateSource === "scope_rate");

  usedPackage = rateSource === "package_rate";

  switch (template.estimateRules.calculationType) {
    case "deck_area": {
      const area = parseNumber(getAnswerValue(answers, "deck.area_m2"));
      const deckMaterial = resolveDeckMaterial(answers, effectiveQualityLevel);

      if (area) {
        quantity = area;
        const rate = applyMaterialRateAdjustment(
          baseRate,
          deckMaterial,
          template.benchmarkRates,
          rateSource
        );
        centralEstimate = area * rate;
        inputs.push(
          `${template.name}: ${area} m² × $${Math.round(rate)}/m² (template: ${template.key})`
        );

        if (getAnswerValue(answers, "deck.level_type") === "elevated") {
          const mod = template.estimateRules.elevatedModifier ?? 1.15;
          const pct = Math.round((mod - 1) * 100);
          const adjusted = applyPercentDriver(
            centralEstimate,
            {
              key: "elevated_deck",
              label: "Elevated deck",
              type: "percentage_adjustment",
              value: pct,
              explanation:
                "Elevated decks usually require more labour and framing.",
              source: "template",
            },
            pct
          );
          centralEstimate = adjusted.central;
          traceDrivers.push(adjusted.driver);
          inputs.push("Elevated deck (+15%)");
          assumptions.push("Elevated deck access assumed (+15%)");

          const height = parseNumber(getAnswerValue(answers, "deck.height_m"));
          if (height && height > 1.5) {
            const heightAdj = applyPercentDriver(
              centralEstimate,
              {
                key: "extra_height",
                label: "Extra height",
                type: "percentage_adjustment",
                value: 8,
                explanation: "Extra height above 1.5m adds scaffolding and framing.",
                source: "template",
              },
              8
            );
            centralEstimate = heightAdj.central;
            traceDrivers.push(heightAdj.driver);
            inputs.push("Extra height allowance (+8%)");
          }
        }
        if (isYes(getAnswerValue(answers, "deck.has_existing_deck"))) {
          const demoAdj = applyFlatDriver(
            centralEstimate,
            {
              key: "existing_deck_removal",
              label: "Existing deck removal",
              type: "flat_allowance",
              value: 1800,
              explanation: "Allowance for removing the existing deck.",
              source: "template",
            },
            1800
          );
          centralEstimate = demoAdj.central;
          traceDrivers.push(demoAdj.driver);
          allowances.push("Existing deck removal allowance");
        }
        if (isYes(getAnswerValue(answers, "deck.tight_access"))) {
          const accessAdj = applyPercentDriver(
            centralEstimate,
            {
              key: "tight_access",
              label: "Tight access",
              type: "percentage_adjustment",
              value: 8,
              explanation: "Tight access increases carting and labour time.",
              source: "template",
            },
            8
          );
          centralEstimate = accessAdj.central;
          traceDrivers.push(accessAdj.driver);
          inputs.push("Tight access (+8%)");
          assumptions.push("Tight site access assumed (+8%)");
        }
        if (isYes(getAnswerValue(answers, "deck.has_stairs"))) {
          const stairsAdj = applyFlatDriver(
            centralEstimate,
            {
              key: "stairs",
              label: "Stairs",
              type: "flat_allowance",
              value: 2500,
              explanation: "Allowance included for stairs.",
              source: "template",
            },
            2500
          );
          centralEstimate = stairsAdj.central;
          traceDrivers.push(stairsAdj.driver);
          allowances.push("Stairs allowance");
        } else {
          traceDrivers.push({
            key: "stairs",
            label: "Stairs",
            type: "exclusion",
            value: false,
            explanation: "Stairs excluded — not included in scope.",
            source: "user",
          });
        }
        if (isYes(getAnswerValue(answers, "deck.has_pergola"))) {
          const pergolaAdj = applyFlatDriver(
            centralEstimate,
            {
              key: "pergola",
              label: "Pergola",
              type: "flat_allowance",
              value: 6000,
              explanation: "Allowance included for pergola.",
              source: "template",
            },
            6000
          );
          centralEstimate = pergolaAdj.central;
          traceDrivers.push(pergolaAdj.driver);
          allowances.push("Pergola allowance");
        }
        if (isYes(getAnswerValue(answers, "deck.has_balustrade"))) {
          const balustradeSupply = getAnswerValue(answers, "deck.balustrade_supply");
          if (balustradeSupply !== "excluded") {
            const length = 4 * Math.sqrt(area);
            const balustradeCost =
              balustradeSupply === "client_supplied"
                ? Math.round(length * 180)
                : Math.round(length * 400);
            const balAdj = applyFlatDriver(
              centralEstimate,
              {
                key: "balustrade",
                label: "Balustrade",
                type: "flat_allowance",
                value: balustradeCost,
                explanation:
                  balustradeSupply === "client_supplied"
                    ? "Balustrade install only — client supplying materials."
                    : "Balustrade supply and install allowance.",
                source: "template",
              },
              balustradeCost
            );
            centralEstimate = balAdj.central;
            traceDrivers.push(balAdj.driver);
            allowances.push(
              balustradeSupply === "client_supplied"
                ? "Balustrade install allowance"
                : "Balustrade allowance"
            );
          } else {
            traceDrivers.push({
              key: "balustrade",
              label: "Balustrade",
              type: "exclusion",
              value: true,
              explanation: "Balustrade excluded from this estimate.",
              source: "user",
            });
          }
        } else {
          traceDrivers.push({
            key: "balustrade",
            label: "Balustrade",
            type: "exclusion",
            value: false,
            explanation: "Balustrade excluded — not included in scope.",
            source: "user",
          });
        }
        const materialSupply = getAnswerValue(answers, "deck.material_supply");
        if (materialSupply === "labour_only") {
          const labourAdj = applyPercentDriver(
            centralEstimate,
            {
              key: "labour_only",
              label: "Labour only",
              type: "exclusion",
              value: -35,
              explanation: "Material allowance reduced — labour only scope.",
              source: "user",
            },
            -35
          );
          centralEstimate = labourAdj.central;
          traceDrivers.push(labourAdj.driver);
          inputs.push("Labour only (-35% materials)");
          assumptions.push("Labour only — decking materials excluded");
        } else if (materialSupply === "client_supplied") {
          const supplyAdj = applyPercentDriver(
            centralEstimate,
            {
              key: "client_supplied_materials",
              label: "Client-supplied materials",
              type: "exclusion",
              value: -25,
              explanation:
                "Material allowance reduced because client is supplying materials.",
              source: "user",
            },
            -25
          );
          centralEstimate = supplyAdj.central;
          traceDrivers.push(supplyAdj.driver);
          inputs.push("Client-supplied decking (-25%)");
          assumptions.push("Client-supplied decking materials");
        }
      } else {
        const base = PLACEHOLDER_BASE_RANGES.deck;
        centralEstimate = Math.round((base.low + base.high) / 2);
        quantity = 0;
      }
      break;
    }
    case "wall_area": {
      const length = parseNumber(
        getAnswerValue(answers, "retaining_wall.length_m")
      );
      const height = parseNumber(
        getAnswerValue(answers, "retaining_wall.height_m")
      );
      const wallArea = length && height ? length * height : null;

      if (wallArea) {
        quantity = wallArea;
        let rate = baseRate;
        const resolved = resolveMaterialCategory({
          scopeTypeKey: "retaining_wall",
          answers,
        });
        if (resolved) {
          rate = Math.round(baseRate * resolved.rateMultiplier);
          if (resolved.source === "assumed") {
            assumptions.push(
              `Material category assumed: ${resolved.categoryLabel} (default benchmark)`
            );
          }
        } else {
          const material = getAnswerValue(answers, "retaining_wall.material");
          if (material === "timber") rate = Math.round(baseRate * 0.9);
          if (material === "concrete" || material === "concrete_sleeper") {
            rate = Math.round(baseRate * 1.15);
          }
        }
        centralEstimate = Math.round(wallArea * rate);
        inputs.push(
          `${template.name}: ${length}m × ${height}m = ${wallArea.toFixed(1)}m² × $${Math.round(rate)}/m² (template: ${template.key})`
        );

        if (isYes(getAnswerValue(answers, "retaining_wall.has_drainage"))) {
          const drainageAdj = applyFlatDriver(
            centralEstimate,
            {
              key: "drainage",
              label: "Drainage",
              type: "flat_allowance",
              value: 2000,
              explanation: "Allowance included for drainage behind the wall.",
              source: "template",
            },
            2000
          );
          centralEstimate = drainageAdj.central;
          traceDrivers.push(drainageAdj.driver);
          allowances.push("Drainage allowance");
        }
        if (isYes(getAnswerValue(answers, "retaining_wall.has_backfill"))) {
          const backfillAdj = applyFlatDriver(
            centralEstimate,
            {
              key: "backfill",
              label: "Backfill",
              type: "flat_allowance",
              value: 2500,
              explanation: "Allowance included for backfill material and labour.",
              source: "template",
            },
            2500
          );
          centralEstimate = backfillAdj.central;
          traceDrivers.push(backfillAdj.driver);
          allowances.push("Backfill allowance");
        }
        if (isYes(getAnswerValue(answers, "retaining_wall.has_spoil_removal"))) {
          const spoilAdj = applyFlatDriver(
            centralEstimate,
            {
              key: "spoil_removal",
              label: "Spoil removal",
              type: "flat_allowance",
              value: 2000,
              explanation: "Allowance for spoil removal off site.",
              source: "template",
            },
            2000
          );
          centralEstimate = spoilAdj.central;
          traceDrivers.push(spoilAdj.driver);
          allowances.push("Spoil removal allowance");
        }
        if (isYes(getAnswerValue(answers, "retaining_wall.surcharge_loading"))) {
          const surchargeAdj = applyPercentDriver(
            centralEstimate,
            {
              key: "surcharge_loading",
              label: "Surcharge / loading",
              type: "percentage_adjustment",
              value: 12,
              explanation: "Loading above the wall increases structural requirements.",
              source: "template",
            },
            12
          );
          centralEstimate = surchargeAdj.central;
          traceDrivers.push(surchargeAdj.driver);
          inputs.push("Surcharge/loading risk (+12%)");
          assumptions.push("Surcharge or loading above wall assumed (+12%)");
        }
      } else {
        const base = PLACEHOLDER_BASE_RANGES.other;
        centralEstimate = Math.round((base.low + base.high) / 2);
      }
      break;
    }
    case "fence_length": {
      const length = parseNumber(getAnswerValue(answers, "fence.length_m"));
      const height = parseNumber(getAnswerValue(answers, "fence.height_m"));

      if (length && height) {
        quantity = length;
        let rate = baseRate;
        const resolved = resolveMaterialCategory({
          scopeTypeKey: "fence",
          answers,
        });
        if (resolved) {
          rate = Math.round(baseRate * resolved.rateMultiplier);
          if (resolved.source === "assumed") {
            assumptions.push(
              `Material category assumed: ${resolved.categoryLabel} (default benchmark)`
            );
          }
        }

        const heightFactor =
          height <= 1.2 ? 0.95 : height <= 1.8 ? 1 : height <= 2.1 ? 1.08 : 1.15;
        rate = Math.round(rate * heightFactor);
        centralEstimate = Math.round(length * rate);
        inputs.push(
          `${template.name}: ${length}m × $${Math.round(rate)}/m at ${height}m height (template: ${template.key})`
        );

        if (isYes(getAnswerValue(answers, "fence.gate_included"))) {
          const gateAdj = applyFlatDriver(
            centralEstimate,
            {
              key: "gate",
              label: "Gate",
              type: "flat_allowance",
              value: 850,
              explanation: "Allowance for a standard gate.",
              source: "template",
            },
            850
          );
          centralEstimate = gateAdj.central;
          traceDrivers.push(gateAdj.driver);
          allowances.push("Gate allowance");
        }
        if (isYes(getAnswerValue(answers, "fence.demolition_existing"))) {
          const demoAdj = applyFlatDriver(
            centralEstimate,
            {
              key: "fence_demolition",
              label: "Existing fence removal",
              type: "flat_allowance",
              value: 600,
              explanation: "Allowance for removing existing fencing.",
              source: "template",
            },
            600
          );
          centralEstimate = demoAdj.central;
          traceDrivers.push(demoAdj.driver);
          allowances.push("Existing fence removal allowance");
        }
        if (isYes(getAnswerValue(answers, "fence.ground_conditions"))) {
          const groundAdj = applyPercentDriver(
            centralEstimate,
            {
              key: "difficult_ground",
              label: "Difficult ground",
              type: "percentage_adjustment",
              value: 10,
              explanation: "Difficult ground increases post setting time.",
              source: "template",
            },
            10
          );
          centralEstimate = groundAdj.central;
          traceDrivers.push(groundAdj.driver);
          inputs.push("Difficult ground (+10%)");
        }
      } else {
        const base = PLACEHOLDER_BASE_RANGES.other;
        centralEstimate = Math.round((base.low + base.high) / 2);
      }
      break;
    }
    case "floor_area": {
      const area = parseNumber(
        getAnswerValue(answers, "bathroom.floor_area_m2")
      );

      if (area) {
        quantity = area;
        centralEstimate = Math.round(area * baseRate);
        inputs.push(
          `${template.name}: ${area} m² × $${Math.round(baseRate)}/m² (template: ${template.key})`
        );

        if (isYes(getAnswerValue(answers, "bathroom.layout_changing"))) {
          const mod = template.estimateRules.layoutChangeModifier ?? 1.2;
          centralEstimate = Math.round(centralEstimate * mod);
          inputs.push("Layout changing (+20%)");
          assumptions.push("Bathroom layout change assumed (+20%)");
        }
        const tileExtent =
          getAnswerValue(answers, "bathroom.tile_extent") ??
          getAnswerValue(answers, "bathroom.tile_height");
        if (tileExtent === "full") {
          centralEstimate = Math.round(centralEstimate * 1.15);
          inputs.push("Full-height tiling (+15%)");
        }
        if (isYes(getAnswerValue(answers, "bathroom.waterproofing_included"))) {
          const wpAdj = applyFlatDriver(
            centralEstimate,
            {
              key: "waterproofing",
              label: "Waterproofing",
              type: "flat_allowance",
              value: 1400,
              explanation: "Waterproofing allowance included.",
              source: "template",
            },
            1400
          );
          centralEstimate = wpAdj.central;
          traceDrivers.push(wpAdj.driver);
          allowances.push("Waterproofing allowance");
        }
        if (isYes(getAnswerValue(answers, "bathroom.demolition_included"))) {
          const demoAdj = applyFlatDriver(
            centralEstimate,
            {
              key: "demolition",
              label: "Demolition",
              type: "flat_allowance",
              value: 2200,
              explanation: "Demolition allowance included.",
              source: "template",
            },
            2200
          );
          centralEstimate = demoAdj.central;
          traceDrivers.push(demoAdj.driver);
          allowances.push("Demolition allowance");
        }
        if (isYes(getAnswerValue(answers, "bathroom.plumbing_relocation"))) {
          const plumbAdj = applyFlatDriver(
            centralEstimate,
            {
              key: "plumbing_relocation",
              label: "Plumbing relocation",
              type: "flat_allowance",
              value: 3500,
              explanation: "Plumbing relocation allowance included.",
              source: "template",
            },
            3500
          );
          centralEstimate = plumbAdj.central;
          traceDrivers.push(plumbAdj.driver);
          allowances.push("Plumbing relocation allowance");
        }
        if (isYes(getAnswerValue(answers, "bathroom.electrical_allowance"))) {
          const elecAdj = applyFlatDriver(
            centralEstimate,
            {
              key: "electrical",
              label: "Electrical",
              type: "flat_allowance",
              value: 1800,
              explanation: "Electrical allowance included.",
              source: "template",
            },
            1800
          );
          centralEstimate = elecAdj.central;
          traceDrivers.push(elecAdj.driver);
          allowances.push("Electrical allowance");
        }
        if (isYes(getAnswerValue(answers, "bathroom.occupied_home"))) {
          const occAdj = applyPercentDriver(
            centralEstimate,
            {
              key: "occupied_home",
              label: "Occupied home",
              type: "percentage_adjustment",
              value: 6,
              explanation: "Working in an occupied home adds coordination time.",
              source: "template",
            },
            6
          );
          centralEstimate = occAdj.central;
          traceDrivers.push(occAdj.driver);
          inputs.push("Occupied home (+6%)");
        }
        const fixturesSupply = getAnswerValue(
          answers,
          "bathroom.fixtures_client_supplied"
        );
        if (fixturesSupply === "yes") {
          const fixAdj = applyPercentDriver(
            centralEstimate,
            {
              key: "client_supplied_fixtures",
              label: "Client-supplied fixtures",
              type: "exclusion",
              value: -12,
              explanation: "Fixture material allowance reduced — client supplying vanity and fittings.",
              source: "user",
            },
            -12
          );
          centralEstimate = fixAdj.central;
          traceDrivers.push(fixAdj.driver);
          inputs.push("Client-supplied fixtures (-12%)");
          assumptions.push("Fixtures client-supplied — material allowance reduced");
        } else if (fixturesSupply === "partial") {
          const partialAdj = applyPercentDriver(
            centralEstimate,
            {
              key: "partial_client_supplied_fixtures",
              label: "Partial client-supplied fixtures",
              type: "exclusion",
              value: -6,
              explanation: "Some fixtures client-supplied.",
              source: "user",
            },
            -6
          );
          centralEstimate = partialAdj.central;
          traceDrivers.push(partialAdj.driver);
          inputs.push("Partial client-supplied fixtures (-6%)");
          assumptions.push("Some fixtures client-supplied");
        }
        const tilesSupply = getAnswerValue(answers, "bathroom.tiles_supplied_by");
        if (tilesSupply === "client") {
          const tilesAdj = applyPercentDriver(
            centralEstimate,
            {
              key: "client_supplied_tiles",
              label: "Client-supplied tiles",
              type: "exclusion",
              value: -8,
              explanation: "Tile material excluded — client supplying tiles.",
              source: "user",
            },
            -8
          );
          centralEstimate = tilesAdj.central;
          traceDrivers.push(tilesAdj.driver);
          inputs.push("Client-supplied tiles (-8%)");
          assumptions.push("Tiles client-supplied — tile material excluded");
        }
      } else {
        const base = PLACEHOLDER_BASE_RANGES["bathroom-renovation"];
        centralEstimate = Math.round((base.low + base.high) / 2);
      }
      break;
    }
    case "kitchen_size": {
      const sizeType =
        getAnswerValue(answers, "kitchen.kitchen_size_type") ?? "unknown";
      const sizeKey =
        sizeType === "small" ||
        sizeType === "medium" ||
        sizeType === "large"
          ? sizeType
          : "medium";

      const sizeRates = KITCHEN_SIZE_BENCHMARKS[sizeKey];
      const central =
        finishLevel === "budget"
          ? sizeRates.low
          : finishLevel === "premium"
            ? sizeRates.high
            : sizeRates.typical;

      quantity = 1;
      unit = "kitchen";
      centralEstimate = central;
      inputs.push(
        `${template.name}: ${sizeKey} kitchen rough allowance $${Math.round(central).toLocaleString("en-NZ")}`
      );
      assumptions.push(
        "Kitchen pricing is rough — confirm rates before relying on this."
      );

      if (isYes(getAnswerValue(answers, "kitchen.demolition_required"))) {
        const demoAdj = applyFlatDriver(
          centralEstimate,
          {
            key: "demolition",
            label: "Demolition",
            type: "flat_allowance",
            value: 3500,
            explanation: "Existing kitchen demolition allowance included.",
            source: "template",
          },
          3500
        );
        centralEstimate = demoAdj.central;
        traceDrivers.push(demoAdj.driver);
        allowances.push("Kitchen demolition allowance");
      }

      if (isYes(getAnswerValue(answers, "kitchen.layout_changing"))) {
        const mod = template.estimateRules.layoutChangeModifier ?? 1.15;
        const pct = Math.round((mod - 1) * 100);
        const layoutAdj = applyPercentDriver(
          centralEstimate,
          {
            key: "layout_change",
            label: "Layout changing",
            type: "percentage_adjustment",
            value: pct,
            explanation: "Layout changes add services and coordination.",
            source: "template",
          },
          pct
        );
        centralEstimate = layoutAdj.central;
        traceDrivers.push(layoutAdj.driver);
        inputs.push(`Layout changing (+${pct}%)`);
      }

      if (sizeType === "unknown") {
        assumptions.push("Kitchen size assumed medium until confirmed.");
        inputs.push("Kitchen size not confirmed — medium allowance used");
      }

      const benchtop = getAnswerValue(answers, "kitchen.benchtop_type");
      if (!benchtop || benchtop === "not_sure") {
        inputs.push("Kitchen benchtop not confirmed");
      }

      if (
        !getAnswerValue(answers, "kitchen.cabinetry_length_m") &&
        !getAnswerValue(answers, "kitchen.floor_area_m2")
      ) {
        inputs.push("Kitchen size/linear cabinetry not confirmed");
      }
      break;
    }
    default: {
      const base = PLACEHOLDER_BASE_RANGES.other;
      centralEstimate = Math.round((base.low + base.high) / 2);
    }
  }

  const confidenceReason = hasAll
    ? rateSource === "scope_rate"
      ? `${template.name}: measurements provided using your saved ${template.name.toLowerCase()} rate.`
      : rateSource === "org_rate" || rateSource === "package_rate"
        ? `${template.name}: measurements provided using ${rateSource === "org_rate" ? "your trade/material rates" : "your package rate"}.`
        : `${template.name}: measurements provided using Quotr benchmark rates.`
    : `${template.name}: missing key facts — placeholder range used.`;

  const componentInput = buildScopeComponentCalcInput(
    template.workAreaTypeKey,
    answers,
    orgRates,
    effectiveQualityLevel
  );
  const componentResult = calculateScopeFromComponents(componentInput);
  const estimateComponents = componentResult
    ? reconcileComponentsToTotal(
        componentResult.components,
        Math.round(centralEstimate)
      )
    : undefined;

  return {
    centralEstimate: Math.round(centralEstimate),
    quantity,
    unit,
    baseRate,
    rateSource,
    finishEncodedInRate,
    confidenceBonus,
    usedPackage,
    usedTemplate: true,
    templateKey: template.key,
    scopeTypeKey,
    scopeRateId,
    usesDefaultRateOnly,
    scopeAllocation,
    allocationBreakdown,
    missing: [],
    inputs,
    allowances,
    assumptions,
    confidenceReason,
    traceDrivers,
    estimateComponents,
  };
}
