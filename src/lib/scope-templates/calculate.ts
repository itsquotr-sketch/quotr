import type { ScopeTemplate } from "@/lib/scope-templates/types";
import { getScopeRateDefinitionByKey } from "@/lib/constants/scope-rates";
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
import type { QualityLevel } from "@/lib/constants/quality-level";
import type { ScopeRateAllocation } from "@/lib/cost-engine/rates/scope-rate-utils";

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
};

function parseNumber(value: string | undefined): number | null {
  if (value === undefined) return null;
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? num : null;
}

function isYes(value: string | undefined): boolean {
  return value === "yes";
}

function checkRequiredFacts(
  template: ScopeTemplate,
  answers: Record<string, string>
): boolean {
  return template.estimateRules.requiredFactKeys.every((key) =>
    Boolean(parseNumber(getAnswerValue(answers, key)))
  );
}

function resolveDeckMaterial(
  answers: Record<string, string>,
  effectiveQualityLevel: QualityLevel
): string | null {
  const material = getAnswerValue(answers, "deck.material_type");
  if (material && material !== "unknown") return material;
  if (effectiveQualityLevel === "budget") return "timber";
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
  if (material === "composite") return rates.high;
  if (material === "timber") return rates.low;
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
  let centralEstimate = 0;
  let quantity = 0;
  const unit = template.benchmarkRates.unit;
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
          centralEstimate = Math.round(centralEstimate * mod);
          inputs.push("Elevated deck (+15%)");
          assumptions.push("Elevated deck access assumed (+15%)");

          const height = parseNumber(getAnswerValue(answers, "deck.height_m"));
          if (height && height > 1.5) {
            centralEstimate = Math.round(centralEstimate * 1.08);
            inputs.push("Extra height allowance (+8%)");
          }
        }
        if (isYes(getAnswerValue(answers, "deck.has_existing_deck"))) {
          centralEstimate += 1800;
          allowances.push("Existing deck removal allowance");
        }
        if (isYes(getAnswerValue(answers, "deck.tight_access"))) {
          centralEstimate = Math.round(centralEstimate * 1.08);
          inputs.push("Tight access (+8%)");
          assumptions.push("Tight site access assumed (+8%)");
        }
        if (isYes(getAnswerValue(answers, "deck.has_stairs"))) {
          centralEstimate += 2500;
          allowances.push("Stairs allowance");
        }
        if (isYes(getAnswerValue(answers, "deck.has_pergola"))) {
          centralEstimate += 6000;
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
            centralEstimate += balustradeCost;
            allowances.push(
              balustradeSupply === "client_supplied"
                ? "Balustrade install allowance"
                : "Balustrade allowance"
            );
          }
        }
        const materialSupply = getAnswerValue(answers, "deck.material_supply");
        if (materialSupply === "labour_only") {
          centralEstimate = Math.round(centralEstimate * 0.65);
          inputs.push("Labour only (-35% materials)");
          assumptions.push("Labour only — decking materials excluded");
        } else if (materialSupply === "client_supplied") {
          centralEstimate = Math.round(centralEstimate * 0.75);
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
        const material = getAnswerValue(answers, "retaining_wall.material");
        if (material === "timber") rate = Math.round(baseRate * 0.9);
        if (material === "concrete") rate = Math.round(baseRate * 1.15);
        centralEstimate = Math.round(wallArea * rate);
        inputs.push(
          `${template.name}: ${length}m × ${height}m = ${wallArea.toFixed(1)}m² × $${Math.round(rate)}/m² (template: ${template.key})`
        );

        if (isYes(getAnswerValue(answers, "retaining_wall.has_drainage"))) {
          centralEstimate += 2000;
          allowances.push("Drainage allowance");
        }
        if (isYes(getAnswerValue(answers, "retaining_wall.has_backfill"))) {
          centralEstimate += 2500;
          allowances.push("Backfill allowance");
        }
        if (isYes(getAnswerValue(answers, "retaining_wall.has_spoil_removal"))) {
          centralEstimate += 2000;
          allowances.push("Spoil removal allowance");
        }
        if (isYes(getAnswerValue(answers, "retaining_wall.surcharge_loading"))) {
          centralEstimate = Math.round(centralEstimate * 1.12);
          inputs.push("Surcharge/loading risk (+12%)");
          assumptions.push("Surcharge or loading above wall assumed (+12%)");
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
          centralEstimate += 1400;
          allowances.push("Waterproofing allowance");
        }
        if (isYes(getAnswerValue(answers, "bathroom.demolition_included"))) {
          centralEstimate += 2200;
          allowances.push("Demolition allowance");
        }
        if (isYes(getAnswerValue(answers, "bathroom.plumbing_relocation"))) {
          centralEstimate += 3500;
          allowances.push("Plumbing relocation allowance");
        }
        if (isYes(getAnswerValue(answers, "bathroom.electrical_allowance"))) {
          centralEstimate += 1800;
          allowances.push("Electrical allowance");
        }
        if (isYes(getAnswerValue(answers, "bathroom.occupied_home"))) {
          centralEstimate = Math.round(centralEstimate * 1.06);
          inputs.push("Occupied home (+6%)");
        }
        const fixturesSupply = getAnswerValue(
          answers,
          "bathroom.fixtures_client_supplied"
        );
        if (fixturesSupply === "yes") {
          centralEstimate = Math.round(centralEstimate * 0.88);
          inputs.push("Client-supplied fixtures (-12%)");
          assumptions.push("Fixtures client-supplied — material allowance reduced");
        } else if (fixturesSupply === "partial") {
          centralEstimate = Math.round(centralEstimate * 0.94);
          inputs.push("Partial client-supplied fixtures (-6%)");
          assumptions.push("Some fixtures client-supplied");
        }
        const tilesSupply = getAnswerValue(answers, "bathroom.tiles_supplied_by");
        if (tilesSupply === "client") {
          centralEstimate = Math.round(centralEstimate * 0.92);
          inputs.push("Client-supplied tiles (-8%)");
          assumptions.push("Tiles client-supplied — tile material excluded");
        }
      } else {
        const base = PLACEHOLDER_BASE_RANGES["bathroom-renovation"];
        centralEstimate = Math.round((base.low + base.high) / 2);
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
  };
}
