import type { ScopeTemplate } from "@/lib/scope-templates/types";
import { getAnswerValue } from "@/lib/question-keys";
import {
  getBaseRateForScope,
  type OrgRatesInput,
  type RateSource,
} from "@/lib/cost-engine/rates/get-base-rate-for-scope";
import { PLACEHOLDER_BASE_RANGES } from "@/lib/constants/quick-estimate";
import type { QualityLevel } from "@/lib/constants/quality-level";

export type TemplateCalculationResult = {
  centralEstimate: number;
  quantity: number;
  unit: string;
  baseRate: number;
  rateSource: RateSource;
  confidenceBonus: number;
  usedPackage: boolean;
  usedTemplate: boolean;
  templateKey: string;
  missing: string[];
  inputs: string[];
  allowances: string[];
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

export function calculateFromTemplate(
  template: ScopeTemplate,
  answers: Record<string, string>,
  orgRates: OrgRatesInput,
  effectiveQualityLevel: QualityLevel = "unknown"
): TemplateCalculationResult {
  const hasAll = checkRequiredFacts(template, answers);
  const inputs: string[] = [];
  const allowances: string[] = [];
  let centralEstimate = 0;
  let quantity = 0;
  const unit = template.benchmarkRates.unit;
  let usedPackage = false;

  const finishLevel = resolveFinishLevel(
    answers,
    effectiveQualityLevel,
    template.key.includes("bathroom")
      ? "bathroom.finish_level"
      : "deck.finish_level"
  );

  const { rate: baseRate, source: rateSource, confidenceBonus } =
    getBaseRateForScope(
      template.key,
      template.workAreaTypeKey,
      unit,
      orgRates,
      finishLevel
    );

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
          const length = 4 * Math.sqrt(area);
          centralEstimate += Math.round(length * 400);
          allowances.push("Balustrade allowance");
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
        centralEstimate = Math.round(wallArea * baseRate);
        inputs.push(
          `${template.name}: ${length}m × ${height}m = ${wallArea.toFixed(1)}m² × $${Math.round(baseRate)}/m² (template: ${template.key})`
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
    ? rateSource === "org_rate" || rateSource === "package_rate"
      ? `${template.name}: measurements provided using ${rateSource === "org_rate" ? "your saved rates" : "package rates"}.`
      : `${template.name}: measurements provided using benchmark template rates.`
    : `${template.name}: missing key facts — placeholder range used.`;

  return {
    centralEstimate: Math.round(centralEstimate),
    quantity,
    unit,
    baseRate,
    rateSource,
    confidenceBonus,
    usedPackage,
    usedTemplate: true,
    templateKey: template.key,
    missing: [],
    inputs,
    allowances,
    confidenceReason,
  };
}
