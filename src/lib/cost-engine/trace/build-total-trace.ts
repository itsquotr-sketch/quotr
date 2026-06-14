import type { QualityLevel } from "@/lib/constants/quality-level";
import type { RangeQuality } from "@/lib/cost-engine/range-quality";
import { computeRangeWidthPercent } from "@/lib/cost-engine/range-quality";
import type {
  EstimateTrace,
  EstimateTraceAllowance,
  EstimateTraceConfidenceLevel,
  EstimateTraceDriver,
  EstimateTraceRangeQuality,
  EstimateTraceRateWarning,
  EstimateTraceScope,
} from "@/lib/cost-engine/trace/types";
import { TRACE_VERSION } from "@/lib/cost-engine/trace/types";
import type { ProjectAllowance } from "@/types/database";

export type BuildTotalTraceInput = {
  projectId: string;
  organisationId: string;
  scopeTraces: EstimateTraceScope[];
  costCentral: number;
  costLow: number;
  costHigh: number;
  sellLow: number;
  sellHigh: number;
  marginPercent: number;
  contingencyPercent: number;
  rangeQuality: RangeQuality | string;
  rangeWidthPercent: number | null;
  confidenceScore: number;
  confidenceReasons: string[];
  tightenSuggestions: string[];
  constraintsApplied: string[];
  qualityAdjustmentAssumptions: string[];
  effectiveQualityLevel: QualityLevel;
  userAllowances?: ProjectAllowance[];
  missingInformation: string[];
};

function mapRangeQuality(
  rangeQuality: RangeQuality | string,
  rangeWidthPercent: number | null
): EstimateTraceRangeQuality {
  if (rangeWidthPercent != null && rangeWidthPercent > 40) return "too_wide";
  if (rangeWidthPercent != null && rangeWidthPercent > 25) return "wide";
  if (rangeQuality === "strong") return "narrow";
  if (rangeQuality === "moderate") return "reasonable";
  if (rangeWidthPercent != null && rangeWidthPercent <= 20) return "narrow";
  return "wide";
}

function mapConfidenceLevel(score: number): EstimateTraceConfidenceLevel {
  if (score >= 80) return "ready";
  if (score >= 60) return "good";
  if (score >= 35) return "fair";
  return "low";
}

function buildGlobalConstraintDrivers(
  constraintsApplied: string[]
): EstimateTraceDriver[] {
  return constraintsApplied.map((label, index) => {
    const isFlat = label.includes("$");
    return {
      key: `constraint_${index}`,
      label: label.split("+")[0]?.trim() ?? label,
      type: isFlat ? "flat_allowance" : "percentage_adjustment",
      value: label,
      explanation: isFlat
        ? `Site allowance applied: ${label}.`
        : `Site constraint increases labour and access time: ${label}.`,
      source: "system" as const,
    };
  });
}

function buildRateWarnings(scopes: EstimateTraceScope[]): EstimateTraceRateWarning[] {
  const warnings: EstimateTraceRateWarning[] = [];
  for (const scope of scopes) {
    if (scope.rate.source === "placeholder") {
      warnings.push({
        scopeId: scope.scopeId,
        scopeLabel: scope.label,
        severity: "critical",
        message: `${scope.label} is using a placeholder rate — add your rate for a reliable estimate.`,
      });
    } else if (
      scope.rate.source === "template_benchmark" ||
      scope.rate.source === "regional_benchmark"
    ) {
      warnings.push({
        scopeId: scope.scopeId,
        scopeLabel: scope.label,
        severity: "warning",
        message: `${scope.label} is using an industry benchmark — not your saved rate.`,
      });
    }
  }
  return warnings;
}

function buildGlobalAllowances(
  userAllowances: ProjectAllowance[] | undefined
): EstimateTraceAllowance[] {
  return (userAllowances ?? [])
    .filter((row) => row.is_active)
    .map((row) => ({
      key: row.allowance_key,
      label: row.label,
      amount: Number(row.amount),
      source: "user" as const,
      editable: true,
      explanation: row.note?.trim()
        ? row.note
        : `User allowance for ${row.label.toLowerCase()}.`,
    }));
}

function collectGlobalExclusions(scopes: EstimateTraceScope[]): string[] {
  return [...new Set(scopes.flatMap((s) => s.exclusions))].slice(0, 10);
}

function collectGlobalAssumptions(
  scopes: EstimateTraceScope[],
  qualityAssumptions: string[],
  constraintsApplied: string[]
): string[] {
  const fromScopes = scopes.flatMap((s) => s.assumptions);
  const fromConstraints = constraintsApplied
    .filter((c) => /access|rubbish|removal/i.test(c))
    .map((c) => c.replace(/\+\d+%|\+\$[\d,]+/g, "").trim());
  return [...new Set([...fromScopes, ...qualityAssumptions, ...fromConstraints])].slice(
    0,
    10
  );
}

export function buildTotalTrace(input: BuildTotalTraceInput): EstimateTrace {
  const sellCentral = Math.round(
    input.costCentral *
      (1 + input.contingencyPercent / 100) *
      (1 + input.marginPercent / 100)
  );
  const rangeWidthPercent =
    input.rangeWidthPercent ??
    computeRangeWidthPercent(input.costLow, input.costHigh, input.costCentral) ??
    0;

  const globalConstraintDrivers = buildGlobalConstraintDrivers(
    input.constraintsApplied
  );
  const scopesWithGlobalDrivers = input.scopeTraces.map((scope, index) =>
    index === 0
      ? {
          ...scope,
          drivers: [...scope.drivers, ...globalConstraintDrivers],
        }
      : scope
  );

  const confidenceLevel = mapConfidenceLevel(input.confidenceScore);
  const mainReason =
    input.confidenceReasons.find((r) => !r.startsWith("⚠")) ??
    input.confidenceReasons[0] ??
    (input.missingInformation.length > 0
      ? "Key job details are still missing."
      : "Estimate based on confirmed work areas.");

  return {
    traceVersion: TRACE_VERSION,
    generatedAt: new Date().toISOString(),
    projectId: input.projectId,
    organisationId: input.organisationId,
    total: {
      costCentral: input.costCentral,
      costLow: input.costLow,
      costHigh: input.costHigh,
      sellCentral,
      sellLow: input.sellLow,
      sellHigh: input.sellHigh,
      marginPercent: input.marginPercent,
      contingencyPercent: input.contingencyPercent,
      rangeWidthPercent,
      rangeQuality: mapRangeQuality(input.rangeQuality, rangeWidthPercent),
    },
    scopes: scopesWithGlobalDrivers,
    globalAllowances: buildGlobalAllowances(input.userAllowances),
    globalAssumptions: collectGlobalAssumptions(
      input.scopeTraces,
      input.qualityAdjustmentAssumptions,
      input.constraintsApplied
    ),
    globalExclusions: collectGlobalExclusions(input.scopeTraces),
    rateWarnings: buildRateWarnings(input.scopeTraces),
    confidenceSummary: {
      level: confidenceLevel,
      score: input.confidenceScore,
      mainReason,
      nextBestAction: input.tightenSuggestions[0],
    },
  };
}
