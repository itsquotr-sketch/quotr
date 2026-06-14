import type { EstimateChangeEvent } from "@/lib/cost-engine/recalculate-quick-estimate";
import type { EstimateQualityFactor } from "@/lib/cost-engine/estimate-quality";
import type { CostBreakdown } from "@/lib/cost-engine/build-cost-breakdown";
import type { StructuredEstimateBreakdown } from "@/lib/cost-engine/build-structured-estimate-breakdown";
import type {
  EstimateTrace,
  WorkAreaEstimateTrace,
  WorkAreaRateSourceLine,
} from "@/lib/cost-engine/estimate-trace";
import type { RangeQuality } from "@/lib/cost-engine/range-quality";
import type { RateSource } from "@/lib/cost-engine/rates/get-base-rate-for-scope";
import type { EstimateTrace as CalculationTrace } from "@/lib/cost-engine/trace/types";
import { parseEstimateTrace } from "@/lib/cost-engine/trace/types";

import type { QuickEstimate } from "@/types/database";

export function resolveCalculationTrace(
  quickEstimate:
    | Pick<QuickEstimate, "notes" | "trace">
    | null
    | undefined
): CalculationTrace | undefined {
  if (!quickEstimate) return undefined;
  const fromColumn = parseEstimateTrace(quickEstimate.trace);
  if (fromColumn) return fromColumn;
  return parseQuickEstimateSummary(quickEstimate.notes ?? null)?.calculationTrace;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function normalizeCostBreakdown(value: unknown): CostBreakdown | undefined {
  if (!value || typeof value !== "object") return undefined;

  const row = value as Partial<CostBreakdown>;
  const byWorkArea = Array.isArray(row.byWorkArea)
    ? row.byWorkArea
        .filter(
          (area): area is CostBreakdown["byWorkArea"][number] =>
            Boolean(area) &&
            typeof area === "object" &&
            typeof (area as { name?: unknown }).name === "string" &&
            typeof (area as { total?: unknown }).total === "number"
        )
        .map((area) => ({
          name: area.name,
          workAreaTypeKey: area.workAreaTypeKey ?? "",
          total: area.total,
          labour: Number(area.labour ?? 0),
          materials: Number(area.materials ?? 0),
          subcontractors: Number(area.subcontractors ?? 0),
          allowances: Number(area.allowances ?? 0),
          contingency: Number(area.contingency ?? 0),
        }))
    : [];

  if (byWorkArea.length === 0 && row.labour == null) {
    return undefined;
  }

  return {
    labour: Number(row.labour ?? 0),
    materials: Number(row.materials ?? 0),
    subcontractors: Number(row.subcontractors ?? 0),
    allowances: Number(row.allowances ?? 0),
    contingency: Number(row.contingency ?? 0),
    byWorkArea,
    isIndicative: row.isIndicative ?? true,
  };
}

function normalizeWorkAreaTraces(value: unknown): WorkAreaEstimateTrace[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter(
      (row): row is WorkAreaEstimateTrace =>
        Boolean(row) &&
        typeof row === "object" &&
        typeof (row as { workAreaName?: unknown }).workAreaName === "string"
    )
    .map((row) => ({
      scopeTypeKey: row.scopeTypeKey ?? "generic",
      workAreaName: row.workAreaName,
      workAreaTypeKey: row.workAreaTypeKey ?? "",
      quantity: Number(row.quantity ?? 0),
      unit: row.unit ?? "each",
      rate: Number(row.rate ?? 0),
      rateSource: (row.rateSource ?? "placeholder") as RateSource,
      finishLevel: row.finishLevel ?? "unknown",
      centralEstimate: Number(row.centralEstimate ?? 0),
      allocationBreakdown: row.allocationBreakdown,
      assumptions: Array.isArray(row.assumptions)
        ? row.assumptions.filter((item): item is string => typeof item === "string")
        : [],
    }));
}

function normalizeStructuredBreakdown(
  value: unknown
): StructuredEstimateBreakdown | undefined {
  if (!value || typeof value !== "object") return undefined;

  const row = value as Partial<StructuredEstimateBreakdown>;
  if (!Array.isArray(row.scopes) || row.scopes.length === 0) return undefined;

  const total = row.total;
  if (!total || typeof total !== "object") return undefined;

  return {
    total: {
      costLow: Number(total.costLow ?? 0),
      costHigh: Number(total.costHigh ?? 0),
      costCentral: Number(total.costCentral ?? 0),
      sellLow: Number(total.sellLow ?? 0),
      sellHigh: Number(total.sellHigh ?? 0),
      sellCentral: Number(total.sellCentral ?? 0),
      marginPercent: Number(total.marginPercent ?? 0),
      rangeQuality: total.rangeQuality ?? "rough",
    },
    scopes: row.scopes.map((scope) => ({
      scopeId: scope.scopeId ?? "",
      scopeTypeKey: scope.scopeTypeKey ?? "generic",
      label: scope.label ?? "Work area",
      included: scope.included ?? true,
      quantity: Number(scope.quantity ?? 0),
      unit: scope.unit ?? "each",
      rateSource: scope.rateSource ?? "placeholder",
      rateLabel: scope.rateLabel ?? "",
      rateUsed: Number(scope.rateUsed ?? 0),
      qualityLevel: scope.qualityLevel ?? "unknown",
      costLow: Number(scope.costLow ?? 0),
      costHigh: Number(scope.costHigh ?? 0),
      costCentral: Number(scope.costCentral ?? 0),
      sellLow: Number(scope.sellLow ?? 0),
      sellHigh: Number(scope.sellHigh ?? 0),
      sellCentral: Number(scope.sellCentral ?? 0),
      allocations: {
        labour: Number(scope.allocations?.labour ?? 0),
        materials: Number(scope.allocations?.materials ?? 0),
        subcontractors: Number(scope.allocations?.subcontractors ?? 0),
        allowances: Number(scope.allocations?.allowances ?? 0),
        contingency: Number(scope.allocations?.contingency ?? 0),
      },
      components: Array.isArray(scope.components)
        ? scope.components.map((component) => ({
            key: component.key ?? "",
            label: component.label ?? "",
            category: component.category ?? "other",
            amount:
              component.amount == null ? null : Number(component.amount),
            source: component.source ?? "none",
            included: component.included ?? false,
            assumption: component.assumption ?? null,
          }))
        : [],
      assumptions: Array.isArray(scope.assumptions)
        ? scope.assumptions.filter((item): item is string => typeof item === "string")
        : [],
      exclusions: Array.isArray(scope.exclusions)
        ? scope.exclusions.filter((item): item is string => typeof item === "string")
        : [],
      missing: Array.isArray(scope.missing)
        ? scope.missing.filter((item): item is string => typeof item === "string")
        : [],
    })),
  };
}

function normalizeEstimateTrace(value: unknown): EstimateTrace | undefined {
  if (!value || typeof value !== "object") return undefined;

  const row = value as Partial<EstimateTrace>;
  const emptyRange = { low: 0, high: 0 };

  return {
    scopeKey: row.scopeKey ?? "",
    quantity: Number(row.quantity ?? 0),
    unit: row.unit ?? "each",
    baseRate: Number(row.baseRate ?? 0),
    rateSource: row.rateSource ?? "placeholder",
    centralEstimate: Number(row.centralEstimate ?? 0),
    finishAdjustments: Array.isArray(row.finishAdjustments)
      ? row.finishAdjustments
      : [],
    constraintAdjustments: Array.isArray(row.constraintAdjustments)
      ? row.constraintAdjustments
      : [],
    contingencyPercent: Number(row.contingencyPercent ?? 5),
    marginPercent: Number(row.marginPercent ?? 20),
    confidenceScore: Number(row.confidenceScore ?? 0),
    rangeFactor: Number(row.rangeFactor ?? 0.3),
    finalCostRange: row.finalCostRange ?? emptyRange,
    finalSellRange: row.finalSellRange ?? emptyRange,
    missingCriticalFacts: Array.isArray(row.missingCriticalFacts)
      ? row.missingCriticalFacts.filter(
          (item): item is string => typeof item === "string"
        )
      : [],
    costBreakdown: normalizeCostBreakdown(row.costBreakdown),
    workAreaTraces: normalizeWorkAreaTraces(row.workAreaTraces),
    structuredBreakdown: normalizeStructuredBreakdown(row.structuredBreakdown),
    workAreas: Array.isArray(row.workAreas) ? row.workAreas : [],
    extractedFacts: Array.isArray(row.extractedFacts) ? row.extractedFacts : [],
    missingFacts: Array.isArray(row.missingFacts) ? row.missingFacts : [],
    baseCalculation: row.baseCalculation,
    riskAdjustments: Array.isArray(row.riskAdjustments)
      ? row.riskAdjustments
      : [],
    marginApplied: row.marginApplied,
    qualityLevel: row.qualityLevel,
    finishLevel: row.finishLevel,
    rangeWidthPercent: row.rangeWidthPercent ?? null,
  };
}

function normalizeLastEstimateChange(
  value: unknown
): EstimateChangeEvent | null {
  if (!value || typeof value !== "object") return null;

  const row = value as Partial<EstimateChangeEvent>;
  if (
    typeof row.previousLow !== "number" ||
    typeof row.previousHigh !== "number" ||
    typeof row.newLow !== "number" ||
    typeof row.newHigh !== "number"
  ) {
    return null;
  }

  return {
    kind: row.kind ?? "unchanged",
    previousLow: row.previousLow,
    previousHigh: row.previousHigh,
    newLow: row.newLow,
    newHigh: row.newHigh,
    reason: row.reason ?? null,
    at: row.at ?? new Date().toISOString(),
  };
}

export function parseQuickEstimateSummary(notes: string | null): {
  workAreasIncluded: string[];
  workAreasExcluded?: string[];
  questionsAnswered: number;
  questionsTotal: number;
  constraintsIncluded: string[];
  includedTrades: string[];
  allowances: string[];
  assumptions: string[];
  risks: string[];
  missingInformation: string[];
  inputsUsed: string[];
  ratesSource: "saved" | "fallback" | null;
  constraintsApplied: string[];
  qualityLevel?: string;
  qualityLevelNote?: string | null;
  templatesUsed?: string[];
  keyFactsUsed?: string[];
  confidenceReason?: string | null;
  rangeQuality?: RangeQuality;
  rangeQualityLabel?: string;
  rangeQualityReason?: string | null;
  rangeWidthPercent?: number | null;
  tightenSuggestions?: string[];
  rangeLowDrivers?: string[];
  rangeHighDrivers?: string[];
  qualityFactors?: EstimateQualityFactor[];
  estimateTrace?: EstimateTrace;
  calculationTrace?: CalculationTrace;
  confidenceScore?: number;
  confidenceLevelLabel?: string;
  confidenceReasons?: string[];
  questionsToHigh?: number;
  centralEstimate?: number | null;
  contingencyPercent?: number;
  rateSourceDetail?: string;
  stagedRatePrompt?: string | null;
  rateSourceLines?: WorkAreaRateSourceLine[];
  benchmarkScopesForOnboarding?: {
    scopeTypeKey: string;
    label: string;
    workAreaTypeKey: string;
    unit: string;
    benchmarkLow: number;
    benchmarkStandard: number;
    benchmarkPremium: number;
  }[];
  rangeFactor?: number | null;
  rangeChangedMessage?: string | null;
  lastEstimateChange?: EstimateChangeEvent | null;
  costBreakdown?: CostBreakdown;
} | null {
  if (!notes) return null;
  try {
    const parsed = JSON.parse(notes) as {
      workAreasIncluded?: string[];
      workAreasExcluded?: string[];
      questionsAnswered?: number;
      questionsTotal?: number;
      constraintsIncluded?: string[];
      includedTrades?: string[];
      allowances?: string[];
      assumptions?: string[];
      risks?: string[];
      missingInformation?: string[];
      inputsUsed?: string[];
      ratesSource?: "saved" | "fallback";
      constraintsApplied?: string[];
      qualityLevel?: string;
      qualityLevelNote?: string | null;
      templatesUsed?: string[];
      keyFactsUsed?: string[];
      confidenceReason?: string | null;
      rangeQuality?: RangeQuality;
      rangeQualityLabel?: string;
      rangeQualityReason?: string | null;
      rangeWidthPercent?: number | null;
      tightenSuggestions?: string[];
      rangeLowDrivers?: string[];
      rangeHighDrivers?: string[];
      qualityFactors?: EstimateQualityFactor[];
      estimateTrace?: EstimateTrace;
      calculationTrace?: CalculationTrace;
      confidenceScore?: number;
      confidenceLevelLabel?: string;
      confidenceReasons?: string[];
      questionsToHigh?: number;
      centralEstimate?: number | null;
      contingencyPercent?: number;
      rateSourceDetail?: string;
      rateSourceLines?: WorkAreaRateSourceLine[];
      benchmarkScopesForOnboarding?: {
        scopeTypeKey: string;
        label: string;
        workAreaTypeKey: string;
        unit: string;
        benchmarkLow: number;
        benchmarkStandard: number;
        benchmarkPremium: number;
      }[];
      rangeFactor?: number | null;
      rangeChangedMessage?: string | null;
      lastEstimateChange?: EstimateChangeEvent | null;
    };
    if (Array.isArray(parsed.includedTrades) || Array.isArray(parsed.workAreasIncluded)) {
      const estimateTrace = normalizeEstimateTrace(parsed.estimateTrace);

      return {
        workAreasIncluded: asStringArray(parsed.workAreasIncluded),
        workAreasExcluded: asStringArray(parsed.workAreasExcluded),
        questionsAnswered: parsed.questionsAnswered ?? 0,
        questionsTotal: parsed.questionsTotal ?? 0,
        constraintsIncluded: asStringArray(
          parsed.constraintsApplied ?? parsed.constraintsIncluded
        ),
        includedTrades: asStringArray(parsed.includedTrades),
        allowances: asStringArray(parsed.allowances),
        assumptions: asStringArray(parsed.assumptions),
        risks: asStringArray(parsed.risks),
        missingInformation: asStringArray(parsed.missingInformation),
        inputsUsed: asStringArray(parsed.inputsUsed),
        ratesSource: parsed.ratesSource ?? null,
        constraintsApplied: asStringArray(
          parsed.constraintsApplied ?? parsed.constraintsIncluded
        ),
        qualityLevel: parsed.qualityLevel,
        qualityLevelNote: parsed.qualityLevelNote ?? null,
        templatesUsed: asStringArray(parsed.templatesUsed),
        keyFactsUsed: asStringArray(parsed.keyFactsUsed),
        confidenceReason: parsed.confidenceReason ?? null,
        rangeQuality: parsed.rangeQuality,
        rangeQualityLabel: parsed.rangeQualityLabel,
        rangeQualityReason: parsed.rangeQualityReason ?? null,
        rangeWidthPercent: parsed.rangeWidthPercent ?? null,
        tightenSuggestions: asStringArray(parsed.tightenSuggestions),
        rangeLowDrivers: asStringArray(parsed.rangeLowDrivers),
        rangeHighDrivers: asStringArray(parsed.rangeHighDrivers),
        qualityFactors: Array.isArray(parsed.qualityFactors)
          ? parsed.qualityFactors
          : [],
        estimateTrace,
        calculationTrace:
          parseEstimateTrace(parsed.calculationTrace) ??
          parseEstimateTrace(
            (parsed as { estimateTrace?: { calculationTrace?: unknown } })
              .estimateTrace?.calculationTrace
          ) ??
          undefined,
        confidenceScore: parsed.confidenceScore,
        confidenceLevelLabel: parsed.confidenceLevelLabel,
        confidenceReasons: asStringArray(parsed.confidenceReasons),
        questionsToHigh: parsed.questionsToHigh,
        centralEstimate: parsed.centralEstimate ?? null,
        contingencyPercent: parsed.contingencyPercent,
        rateSourceDetail: parsed.rateSourceDetail,
        stagedRatePrompt:
          typeof (parsed as { stagedRatePrompt?: unknown }).stagedRatePrompt ===
          "string"
            ? (parsed as { stagedRatePrompt: string }).stagedRatePrompt
            : null,
        rateSourceLines: Array.isArray(parsed.rateSourceLines)
          ? parsed.rateSourceLines
          : [],
        benchmarkScopesForOnboarding: Array.isArray(
          parsed.benchmarkScopesForOnboarding
        )
          ? parsed.benchmarkScopesForOnboarding
          : [],
        rangeFactor: parsed.rangeFactor ?? null,
        rangeChangedMessage: parsed.rangeChangedMessage ?? null,
        lastEstimateChange: normalizeLastEstimateChange(parsed.lastEstimateChange),
        costBreakdown:
          estimateTrace?.costBreakdown ??
          normalizeCostBreakdown(
            (parsed as { costBreakdown?: unknown }).costBreakdown
          ),
      };
    }
  } catch {
    return null;
  }
  return null;
}
