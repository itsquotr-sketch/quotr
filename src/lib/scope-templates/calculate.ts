import type { ScopeTemplate } from "@/lib/scope-templates/types";
import { getAnswerValue } from "@/lib/question-keys";
import type { PackageRate } from "@/types/database";
import { PLACEHOLDER_BASE_RANGES } from "@/lib/constants/quick-estimate";

type CostBand = { low: number; typical: number; high: number };

export type TemplateCalculationResult = {
  band: CostBand;
  usedPackage: boolean;
  usedTemplate: boolean;
  templateKey: string;
  missing: string[];
  inputs: string[];
  allowances: string[];
  confidenceReason: string | null;
};

function parseNumber(value: string | undefined): number | null {
  if (!value?.trim()) return null;
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? num : null;
}

function isYes(value: string | undefined): boolean {
  return value === "yes";
}

function findPackageRate(
  packageRates: PackageRate[],
  workAreaTypeKey: string
): PackageRate | undefined {
  return packageRates.find(
    (rate) =>
      rate.is_active &&
      rate.work_area_type?.toLowerCase() === workAreaTypeKey.toLowerCase()
  );
}

function checkRequiredFacts(
  template: ScopeTemplate,
  answers: Record<string, string>
): { missing: string[]; hasAll: boolean } {
  const missing: string[] = [];
  for (const key of template.estimateRules.requiredFactKeys) {
    if (!parseNumber(getAnswerValue(answers, key))) {
      const fact =
        template.requiredFacts.find((f) => f.key === key) ??
        template.questions.find((q) => q.questionKey === key);
      missing.push(`${fact?.label ?? key} not provided`);
    }
  }
  return { missing, hasAll: missing.length === 0 };
}

export function calculateFromTemplate(
  template: ScopeTemplate,
  answers: Record<string, string>,
  packageRates: PackageRate[]
): TemplateCalculationResult {
  const pkg = findPackageRate(packageRates, template.workAreaTypeKey);
  const { missing, hasAll } = checkRequiredFacts(template, answers);
  const inputs: string[] = [];
  const allowances: string[] = [];
  let low = 0;
  let typical = 0;
  let high = 0;
  let usedPackage = false;

  const rules = template.estimateRules;
  const rates = template.benchmarkRates;

  switch (rules.calculationType) {
    case "deck_area": {
      const area = parseNumber(getAnswerValue(answers, "deck.area_m2"));
      if (area) {
        const rate = pkg
          ? Number(pkg.typical_base_cost ?? pkg.base_cost)
          : rates.typical;
        typical = area * rate;
        low = typical * rules.lowMultiplier;
        high = typical * rules.highMultiplier;
        usedPackage = Boolean(pkg);
        inputs.push(
          `${template.name}: ${area} m² × $${Math.round(rate)}/m² typical (template: ${template.key})`
        );

        if (getAnswerValue(answers, "deck.level_type") === "elevated") {
          const mod = rules.elevatedModifier ?? 1.15;
          low *= mod;
          typical *= mod;
          high *= mod;
          inputs.push("Elevated deck (+15%)");
        }
        if (isYes(getAnswerValue(answers, "deck.has_stairs"))) {
          low += 1500;
          typical += 2500;
          high += 4000;
          allowances.push("Stairs allowance");
        }
        if (isYes(getAnswerValue(answers, "deck.has_pergola"))) {
          low += 3000;
          typical += 6000;
          high += 9000;
          allowances.push("Pergola allowance");
        }
        if (isYes(getAnswerValue(answers, "deck.has_balustrade"))) {
          const length = 4 * Math.sqrt(area);
          low += length * 200;
          typical += length * 400;
          high += length * 600;
          allowances.push("Balustrade allowance");
        }
      } else {
        const base = PLACEHOLDER_BASE_RANGES.deck;
        low = base.low;
        typical = (base.low + base.high) / 2;
        high = base.high;
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
        const rate = pkg
          ? Number(pkg.typical_base_cost ?? pkg.base_cost)
          : rates.typical;
        typical = wallArea * rate;
        low = typical * rules.lowMultiplier;
        high = typical * rules.highMultiplier;
        usedPackage = Boolean(pkg);
        inputs.push(
          `${template.name}: ${length}m × ${height}m = ${wallArea.toFixed(1)}m² × $${Math.round(rate)}/m² typical (template: ${template.key})`
        );

        if (isYes(getAnswerValue(answers, "retaining_wall.has_drainage"))) {
          low += 1000;
          typical += 2000;
          high += 3000;
          allowances.push("Drainage allowance");
        }
        if (isYes(getAnswerValue(answers, "retaining_wall.has_backfill"))) {
          low += 1000;
          typical += 2500;
          high += 4000;
          allowances.push("Backfill allowance");
        }
        if (isYes(getAnswerValue(answers, "retaining_wall.has_spoil_removal"))) {
          low += 800;
          typical += 2000;
          high += 3500;
          allowances.push("Spoil removal allowance");
        }
      } else {
        const base = PLACEHOLDER_BASE_RANGES.other;
        low = base.low;
        typical = (base.low + base.high) / 2;
        high = base.high;
      }
      break;
    }
    case "floor_area": {
      const area = parseNumber(
        getAnswerValue(answers, "bathroom.floor_area_m2")
      );
      if (area) {
        const finishLevel =
          getAnswerValue(answers, "bathroom.finish_level") ?? "standard";
        let rate = pkg
          ? Number(pkg.typical_base_cost ?? pkg.base_cost)
          : rates.typical;

        if (finishLevel === "budget") rate = rates.low;
        if (finishLevel === "premium") rate = rates.high;

        typical = area * rate;
        low = typical * rules.lowMultiplier;
        high = typical * rules.highMultiplier;
        usedPackage = Boolean(pkg);
        inputs.push(
          `${template.name}: ${area} m² × $${Math.round(rate)}/m² typical (template: ${template.key})`
        );

        if (isYes(getAnswerValue(answers, "bathroom.layout_changing"))) {
          const mod = rules.layoutChangeModifier ?? 1.2;
          low *= mod;
          typical *= mod;
          high *= mod;
          inputs.push("Layout changing (+20%)");
        }
        const tileExtent =
          getAnswerValue(answers, "bathroom.tile_extent") ??
          getAnswerValue(answers, "bathroom.tile_height");
        if (tileExtent === "full") {
          low *= 1.15;
          typical *= 1.15;
          high *= 1.15;
          inputs.push("Full-height tiling (+15%)");
        }
        if (isYes(getAnswerValue(answers, "bathroom.waterproofing_included"))) {
          low += 800;
          typical += 1400;
          high += 2000;
          allowances.push("Waterproofing allowance");
        }
      } else {
        const base = PLACEHOLDER_BASE_RANGES["bathroom-renovation"];
        low = base.low;
        typical = (base.low + base.high) / 2;
        high = base.high;
      }
      break;
    }
    default: {
      const base = PLACEHOLDER_BASE_RANGES.other;
      low = base.low;
      typical = (base.low + base.high) / 2;
      high = base.high;
    }
  }

  const confidenceReason = hasAll
    ? `Key measurements provided for ${template.name} template.`
    : `Missing key facts for ${template.name} template — range kept wider.`;

  return {
    band: {
      low: Math.round(low),
      typical: Math.round(typical),
      high: Math.round(high),
    },
    usedPackage,
    usedTemplate: true,
    templateKey: template.key,
    missing,
    inputs,
    allowances,
    confidenceReason: hasAll ? confidenceReason : confidenceReason,
  };
}
