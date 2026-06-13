import type { EstimateChangeEvent } from "@/lib/cost-engine/recalculate-quick-estimate";
import type { EstimateQualityFactor } from "@/lib/cost-engine/estimate-quality";
import type { CostBreakdown } from "@/lib/cost-engine/build-cost-breakdown";
import type {
  EstimateTrace,
  WorkAreaRateSourceLine,
} from "@/lib/cost-engine/estimate-trace";
import type { RangeQuality } from "@/lib/cost-engine/range-quality";

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
