import type { QuickEstimateBudgetFit, QuickEstimateConfidenceLevel } from "@/lib/constants/quick-estimate";
import type { QualityLevel } from "@/lib/constants/quality-level";
import type { ScopeQuestionForMissing } from "@/lib/cost-engine/build-missing-information";
import type { EstimateQualityFactor } from "@/lib/cost-engine/estimate-quality";
import type { EstimateTrace } from "@/lib/cost-engine/estimate-trace";
import type { RangeQuality } from "@/lib/cost-engine/range-quality";
import type { DiscoveryResult } from "@/lib/discovery";
import { getAnswerValue, normalizeQuestionKey } from "@/lib/question-keys";
import {
  isDiscoverySource,
  parseScopeAnswer,
} from "@/lib/scope-answer-format";
import { isAnswered } from "@/lib/scope-answer-state";
import type {
  LabourRate,
  MaterialRate,
  PackageRate,
  Project,
  QuickEstimate,
  SubcontractorRate,
} from "@/types/database";

export type QuickEstimateWorkAreaInput = {
  scopeId: string;
  name: string;
  workAreaTypeKey: string;
  answers: Record<string, string>;
  answeredFromNotes: string[];
};

export type QuickEstimateConstraintInput = {
  slug: string;
  label: string;
  metres?: number;
  description?: string;
  severity?: "low" | "typical" | "high";
};

export type QuickEstimateInput = {
  project: Pick<Project, "id" | "title">;
  quickEstimate: Pick<
    QuickEstimate,
    "id" | "client_budget" | "target_margin_percent" | "quality_level"
  >;
  workAreas: QuickEstimateWorkAreaInput[];
  constraints: QuickEstimateConstraintInput[];
  packageRates: PackageRate[];
  labourRates: LabourRate[];
  materialRates: MaterialRate[];
  subcontractorRates: SubcontractorRate[];
  targetMarginPercent: number;
  contingencyPercent: number;
  sourceNotesLength?: number;
  discovery: DiscoveryResult | null;
  questionsAnswered: number;
  questionsTotal: number;
  answeredQuestionKeys: Set<string>;
  scopeQuestions: ScopeQuestionForMissing[];
};

export type QuickEstimateOutput = {
  canCalculate: boolean;
  reason?: string;
  estimatedCostLow: number | null;
  estimatedCostHigh: number | null;
  estimatedCostTypical: number | null;
  centralEstimate: number | null;
  recommendedSellLow: number | null;
  recommendedSellHigh: number | null;
  targetMarginPercent: number;
  contingencyPercent: number;
  expectedMarginPercent: number | null;
  confidenceLevel: QuickEstimateConfidenceLevel;
  confidenceScore: number;
  confidenceLevelLabel: string;
  confidenceReasons: string[];
  questionsToHigh: number;
  budgetFit: QuickEstimateBudgetFit;
  includedTrades: string[];
  inputsUsed: string[];
  allowances: string[];
  assumptions: string[];
  risks: string[];
  missingInformation: string[];
  constraintsApplied: string[];
  qualityLevel: QualityLevel;
  qualityLevelNote: string | null;
  ratesSource: "saved" | "fallback";
  rateSourceDetail: string;
  usedPackageRates: boolean;
  templatesUsed: string[];
  keyFactsUsed: string[];
  confidenceReason: string | null;
  rangeQuality: RangeQuality;
  rangeQualityLabel: string;
  rangeQualityReason: string | null;
  rangeWidthPercent: number | null;
  rangeFactor: number | null;
  tightenSuggestions: string[];
  rangeLowDrivers: string[];
  rangeHighDrivers: string[];
  qualityFactors: EstimateQualityFactor[];
  estimateTrace: EstimateTrace;
  rangeChangedMessage: string | null;
};

export function buildAnswersMap(
  questions: {
    question_key: string | null;
    question: string;
    question_type?: string | null;
    scope_answers: { answer: string | null; source?: string }[];
  }[]
): { answers: Record<string, string>; fromNotes: string[] } {
  const answers: Record<string, string> = {};
  const fromNotes: string[] = [];

  for (const q of questions) {
    const row = q.scope_answers[0];
    const parsed = parseScopeAnswer(row?.answer, row?.source);
    if (
      !isAnswered(row?.answer, row?.source, {
        inputType:
          q.question_type === "number" ||
          q.question_type === "select" ||
          q.question_type === "boolean"
            ? q.question_type
            : "text",
      })
    ) {
      continue;
    }

    const key =
      normalizeQuestionKey(q.question_key) ?? q.question_key ?? q.question;
    if (!key || !parsed) continue;

    answers[key] = parsed.value;
    if (isDiscoverySource(parsed.source)) {
      fromNotes.push(key);
    }
  }

  return { answers, fromNotes };
}

export function readAnswer(
  workArea: QuickEstimateWorkAreaInput,
  canonicalKey: string
): string | undefined {
  return getAnswerValue(workArea.answers, canonicalKey);
}
