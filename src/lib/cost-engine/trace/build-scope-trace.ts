import type { QualityLevel } from "@/lib/constants/quality-level";
import type { CostBreakdown } from "@/lib/cost-engine/build-cost-breakdown";
import { contractorRateSourceLabel } from "@/lib/cost-engine/contractor-rate-source-label";
import type { QuickEstimateWorkAreaInput } from "@/lib/cost-engine/quick-estimate-input";
import { buildRange } from "@/lib/cost-engine/range-builder";
import type { RateSource } from "@/lib/cost-engine/rates/get-base-rate-for-scope";
import {
  buildScopeExclusionsFromComponents,
  resolveScopeComponents,
} from "@/lib/scopes/templates/build-scope-components";
import {
  getCanonicalScopeTemplate,
  getCanonicalScopeTemplateByWorkAreaType,
} from "@/lib/scopes/templates";
import type { ScopeTemplate } from "@/lib/scopes/templates/types";
import { getMissingFactsForWorkArea } from "@/lib/scopes/missing-facts";
import { getAnswerValue } from "@/lib/question-keys";
import { hasPositiveAnswer } from "@/lib/scope-answer-state";
import type {
  EstimateTraceAllowance,
  EstimateTraceComponent,
  EstimateTraceDriver,
  EstimateTraceMissingItem,
  EstimateTraceRateSource,
  EstimateTraceScope,
} from "@/lib/cost-engine/trace/types";

export type ScopeCalcTraceInput = {
  workArea: QuickEstimateWorkAreaInput;
  scopeTypeKey: string;
  templateKey?: string;
  quantity: number;
  unit: string;
  baseRate: number;
  rateSource: RateSource;
  usesDefaultRateOnly?: boolean;
  centralEstimate: number;
  scaledCentral: number;
  effectiveQualityLevel: QualityLevel;
  confidenceScore: number;
  contingencyPercent: number;
  marginPercent: number;
  inputs: string[];
  allowances: string[];
  assumptions: string[];
  traceDrivers?: EstimateTraceDriver[];
  costBreakdown?: CostBreakdown;
};

function mapRateSource(
  source: RateSource,
  usesDefaultRateOnly?: boolean
): EstimateTraceRateSource {
  switch (source) {
    case "scope_rate":
      return usesDefaultRateOnly ? "scope_rate" : "user_rate";
    case "package_rate":
    case "org_rate":
      return "user_rate";
    case "template_benchmark":
      return "template_benchmark";
    case "regional_fallback":
      return "regional_benchmark";
    case "placeholder":
      return "placeholder";
    default:
      return "unknown";
  }
}

function buildRateExplanation(
  source: EstimateTraceRateSource,
  scopeLabel: string,
  usesDefaultRateOnly?: boolean
): string {
  const legacySource: RateSource =
    source === "user_rate"
      ? "scope_rate"
      : source === "regional_benchmark"
        ? "regional_fallback"
        : (source as RateSource);
  const label = contractorRateSourceLabel(legacySource, {
    scopeLabel,
    usesDefaultRateOnly,
  });

  switch (source) {
    case "user_rate":
    case "scope_rate":
      return `Using your saved ${scopeLabel} rate.`;
    case "template_benchmark":
      return `Using Quotr benchmark rate because no saved ${scopeLabel} rate exists.`;
    case "regional_benchmark":
      return `Using regional benchmark rate for ${scopeLabel}.`;
    case "placeholder":
      return "Using rough placeholder rate. Add your rate before relying on this estimate.";
    default:
      return label;
  }
}

function parseNumber(value: string | undefined): number | null {
  if (!value?.trim()) return null;
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? num : null;
}

function resolveQuantityTrace(
  template: ScopeTemplate | null,
  answers: Record<string, string>,
  quantity: number,
  unit: string
): EstimateTraceScope["quantity"] {
  if (quantity > 0) {
    const primaryKey = template?.quantity.requiredFields[0];
    if (primaryKey && hasPositiveAnswer(answers, primaryKey)) {
      const direct = parseNumber(getAnswerValue(answers, primaryKey));
      if (direct != null && Math.abs(direct - quantity) < 0.5) {
        return {
          value: quantity,
          unit,
          source: "user",
          explanation: "Provided by user.",
        };
      }
    }

    for (const derived of template?.quantity.derivedFields ?? []) {
      const sources = derived.sourceFields
        .map((key) => parseNumber(getAnswerValue(answers, key)))
        .filter((n): n is number => n != null);
      if (sources.length === derived.sourceFields.length) {
        const parts = derived.sourceFields
          .map((key) => {
            const val = parseNumber(getAnswerValue(answers, key));
            return val != null ? `${val}m` : null;
          })
          .filter(Boolean);
        if (parts.length >= 2) {
          const explanation =
            derived.formula.includes("×") && parts.length === 2
              ? `Calculated from ${parts[0]} × ${parts[1]}.`
              : `Calculated from ${parts.join(" × ")}.`;
          return {
            value: quantity,
            unit,
            source: "derived",
            explanation,
          };
        }
        return {
          value: quantity,
          unit,
          source: "derived",
          explanation: `Calculated from ${derived.label.toLowerCase()}.`,
        };
      }
    }

    return {
      value: quantity,
      unit,
      source: "user",
      explanation: "Provided by user.",
    };
  }

  return {
    value: null,
    unit: unit || null,
    source: "benchmark",
    explanation: "Quantity not confirmed. Estimate uses benchmark assumption.",
  };
}

const FLAT_ALLOWANCE_AMOUNTS: Record<string, number> = {
  "existing deck removal allowance": 1800,
  "stairs allowance": 2500,
  "pergola allowance": 6000,
  "drainage allowance": 2000,
  "backfill allowance": 2500,
  "spoil removal allowance": 2000,
  "waterproofing allowance": 1400,
  "demolition allowance": 2200,
  "plumbing relocation allowance": 3500,
  "electrical allowance": 1800,
};

function parseDriversFromCalc(input: ScopeCalcTraceInput): EstimateTraceDriver[] {
  if (input.traceDrivers?.length) {
    return input.traceDrivers;
  }

  const drivers: EstimateTraceDriver[] = [];
  const baseAmount = input.quantity > 0 && input.baseRate > 0
    ? input.quantity * input.baseRate
    : input.scaledCentral;

  if (input.quantity > 0 && input.baseRate > 0) {
    drivers.push({
      key: "base_quantity_rate",
      label: `${input.quantity}${input.unit} at $${Math.round(input.baseRate)}/${input.unit}`,
      type: "base_rate",
      value: input.baseRate,
      amountImpact: Math.round(baseAmount),
      explanation: "Base cost from quantity × rate.",
      source: "template",
    });
  }

  for (const line of input.inputs) {
    const pctMatch = line.match(/\(([+-]?\d+)%\)/);
    if (pctMatch) {
      const pct = Number(pctMatch[1]);
      const label = line.replace(/\s*\([+-]?\d+%\)/, "").trim();
      const impact = Math.round(baseAmount * (Math.abs(pct) / 100));
      drivers.push({
        key: label.toLowerCase().replace(/\s+/g, "_"),
        label,
        type: pct < 0 ? "exclusion" : "percentage_adjustment",
        value: pct,
        amountImpact: pct < 0 ? -impact : impact,
        explanation: describeDriverExplanation(label, pct),
        source: "template",
      });
      continue;
    }

    if (/client-supplied|labour only/i.test(line)) {
      const pctMatch2 = line.match(/([+-]?\d+)%/);
      const pct = pctMatch2 ? Number(pctMatch2[1]) : -25;
      drivers.push({
        key: "client_supplied_materials",
        label: "Client-supplied materials",
        type: "exclusion",
        value: true,
        amountImpact: Math.round(baseAmount * (Math.abs(pct) / 100)) * -1,
        explanation: "Material allowance reduced because client is supplying materials.",
        source: "user",
      });
    }
  }

  for (const allowance of input.allowances) {
    const normalized = allowance.toLowerCase();
    const amount =
      FLAT_ALLOWANCE_AMOUNTS[normalized] ??
      (() => {
        const m = allowance.match(/\$([\d,]+)/);
        return m ? Number(m[1].replace(/,/g, "")) : 0;
      })();
    const label = allowance.replace(/\s*allowance$/i, "").trim();
    drivers.push({
      key: label.toLowerCase().replace(/\s+/g, "_"),
      label,
      type: "flat_allowance",
      value: amount,
      amountImpact: amount > 0 ? amount : undefined,
      explanation: `Allowance included for ${label.toLowerCase()}.`,
      source: "template",
    });
  }

  return drivers;
}

function describeDriverExplanation(label: string, pct: number): string {
  const lower = label.toLowerCase();
  if (lower.includes("elevated")) {
    return "Elevated decks usually require more labour and framing.";
  }
  if (lower.includes("tight access") || lower.includes("access")) {
    return "Tight access increases carting and labour time.";
  }
  if (lower.includes("layout")) {
    return "Layout changes increase plumbing, electrical, and labour.";
  }
  if (lower.includes("occupied")) {
    return "Working in an occupied home adds coordination and protection time.";
  }
  if (pct < 0) {
    return `${label} reduces the estimate.`;
  }
  return `${label} increases the estimate.`;
}

function buildScopeAllowances(allowanceStrings: string[]): EstimateTraceAllowance[] {
  return allowanceStrings.map((raw) => {
    const label = raw.replace(/\s*allowance$/i, "").trim();
    const normalized = raw.toLowerCase();
    const amount =
      FLAT_ALLOWANCE_AMOUNTS[normalized] ??
      (() => {
        const m = raw.match(/\$([\d,]+)/);
        return m ? Number(m[1].replace(/,/g, "")) : 0;
      })();
    return {
      key: label.toLowerCase().replace(/\s+/g, "_"),
      label,
      amount,
      source: "template_default" as const,
      editable: false,
      explanation: `Included allowance for ${label.toLowerCase()}.`,
    };
  });
}

function mapComponentCategory(
  category: string
): EstimateTraceComponent["category"] {
  if (
    category === "labour" ||
    category === "materials" ||
    category === "subcontractors" ||
    category === "allowances" ||
    category === "contingency"
  ) {
    return category;
  }
  if (category === "allowance") return "allowances";
  return "allowances";
}

function resolveAllocations(
  workAreaName: string,
  scopeTypeKey: string,
  workAreaTypeKey: string,
  central: number,
  costBreakdown?: CostBreakdown
): EstimateTraceScope["allocations"] {
  const areaRow = costBreakdown?.byWorkArea.find((a) => a.name === workAreaName);
  if (areaRow && areaRow.total > 0) {
    return {
      labour: areaRow.labour,
      materials: areaRow.materials,
      subcontractors: areaRow.subcontractors,
      allowances: areaRow.allowances,
      contingency: areaRow.contingency,
    };
  }

  const template =
    getCanonicalScopeTemplate(scopeTypeKey) ??
    getCanonicalScopeTemplateByWorkAreaType(workAreaTypeKey);
  const alloc = template?.pricing.defaultAllocations ?? {
    labour: 40,
    materials: 40,
    subcontractors: 10,
    allowances: 5,
    contingency: 5,
  };
  const scale = central / 100;
  return {
    labour: Math.round(alloc.labour * scale),
    materials: Math.round(alloc.materials * scale),
    subcontractors: Math.round(alloc.subcontractors * scale),
    allowances: Math.round(alloc.allowances * scale),
    contingency: Math.round(alloc.contingency * scale),
  };
}

function mapMissingFact(
  fact: { key: string; label: string; required: boolean; affectsEstimate: boolean },
  scopeLabel: string
): EstimateTraceMissingItem {
  return {
    key: fact.key,
    label: fact.label,
    importance: fact.required ? "critical" : "useful",
    affectsEstimate: fact.affectsEstimate,
    explanation: `${fact.label} not confirmed for ${scopeLabel}.`,
  };
}

export function buildScopeTrace(input: ScopeCalcTraceInput): EstimateTraceScope {
  const template =
    getCanonicalScopeTemplate(input.scopeTypeKey) ??
    getCanonicalScopeTemplateByWorkAreaType(input.workArea.workAreaTypeKey);
  const scopeLabel = template?.label ?? input.workArea.name;
  const [costLow, costHigh] = buildRange(input.scaledCentral, input.confidenceScore);
  const sellMultiplier =
    (1 + input.contingencyPercent / 100) * (1 + input.marginPercent / 100);
  const sellCentral = Math.round(input.scaledCentral * sellMultiplier);

  const mappedRateSource = mapRateSource(
    input.rateSource,
    input.usesDefaultRateOnly
  );
  const rateLabel = contractorRateSourceLabel(input.rateSource, {
    scopeLabel,
    usesDefaultRateOnly: input.usesDefaultRateOnly,
  });

  const resolvedComponents = resolveScopeComponents({
    scopeTypeKey: input.scopeTypeKey,
    answers: input.workArea.answers,
    centralEstimate: input.scaledCentral,
    allowances: input.allowances,
    rateSource: input.rateSource,
  });
  const exclusions = buildScopeExclusionsFromComponents(
    resolvedComponents,
    template?.exclusions.default ?? []
  );
  const componentSource: EstimateTraceComponent["source"] =
    input.rateSource === "scope_rate" ||
    input.rateSource === "org_rate" ||
    input.rateSource === "package_rate"
      ? "user_rate"
      : input.rateSource === "template_benchmark" ||
          input.rateSource === "regional_fallback"
        ? "benchmark"
        : "assumed";
  const components: EstimateTraceComponent[] = resolvedComponents.map((c) => ({
    key: c.key,
    label: c.label,
    category: mapComponentCategory(c.category),
    amount: c.amount ?? 0,
    source: c.amount != null ? componentSource : "assumed",
    included: c.included,
    explanation:
      c.assumption ??
      (c.included
        ? `${c.label} included in estimate.`
        : `${c.label} not included.`),
  }));

  const missingFromAnswers = getMissingFactsForWorkArea(
    input.workArea.workAreaTypeKey,
    input.workArea.answers
  )
    .slice(0, 5)
    .map((fact) => mapMissingFact(fact, scopeLabel));

  const assumptions = [
    ...new Set([
      ...input.assumptions,
      ...(template?.assumptions.default ?? []),
    ]),
  ].slice(0, 8);

  return {
    scopeId: input.workArea.scopeId,
    scopeTypeKey: input.scopeTypeKey,
    label: scopeLabel,
    included: true,
    quantity: resolveQuantityTrace(
      template ?? null,
      input.workArea.answers,
      input.quantity,
      input.unit
    ),
    rate: {
      value: input.baseRate > 0 ? input.baseRate : null,
      unit: input.unit || null,
      source: mappedRateSource,
      label: rateLabel,
      explanation: buildRateExplanation(
        mappedRateSource,
        scopeLabel,
        input.usesDefaultRateOnly
      ),
    },
    qualityLevel: input.effectiveQualityLevel,
    cost: {
      central: input.scaledCentral,
      low: costLow,
      high: costHigh,
    },
    sell: {
      central: sellCentral,
      low: Math.round(costLow * sellMultiplier),
      high: Math.round(costHigh * sellMultiplier),
    },
    allocations: resolveAllocations(
      input.workArea.name,
      input.scopeTypeKey,
      input.workArea.workAreaTypeKey,
      input.scaledCentral,
      input.costBreakdown
    ),
    drivers: parseDriversFromCalc(input),
    allowances: buildScopeAllowances(input.allowances),
    components,
    assumptions,
    exclusions,
    missing: missingFromAnswers,
  };
}
