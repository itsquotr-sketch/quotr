import type { QuickEstimateBudgetFit, QuickEstimateConfidenceLevel } from "@/lib/constants/quick-estimate";
import type { QualityLevel } from "@/lib/constants/quality-level";
import type { DiscoveryResult } from "@/lib/discovery";
import { getAnswerValue, normalizeQuestionKey } from "@/lib/question-keys";
import {
  isDiscoverySource,
  parseScopeAnswer,
} from "@/lib/scope-answer-format";
import type { PackageRate, Project, QuickEstimate } from "@/types/database";

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
  targetMarginPercent: number;
  discovery: DiscoveryResult | null;
  questionsAnswered: number;
  questionsTotal: number;
  answeredQuestionKeys: Set<string>;
};

export type QuickEstimateOutput = {
  canCalculate: boolean;
  reason?: string;
  estimatedCostLow: number | null;
  estimatedCostHigh: number | null;
  estimatedCostTypical: number | null;
  recommendedSellLow: number | null;
  recommendedSellHigh: number | null;
  targetMarginPercent: number;
  expectedMarginPercent: number | null;
  confidenceLevel: QuickEstimateConfidenceLevel;
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
  usedPackageRates: boolean;
  templatesUsed: string[];
  keyFactsUsed: string[];
  confidenceReason: string | null;
};

export function buildAnswersMap(
  questions: {
    question_key: string | null;
    question: string;
    scope_answers: { answer: string | null; source?: string }[];
  }[]
): { answers: Record<string, string>; fromNotes: string[] } {
  const answers: Record<string, string> = {};
  const fromNotes: string[] = [];

  for (const q of questions) {
    const row = q.scope_answers[0];
    const parsed = parseScopeAnswer(row?.answer, row?.source);
    if (!parsed?.value.trim()) continue;

    const key =
      normalizeQuestionKey(q.question_key) ?? q.question_key ?? q.question;
    if (!key) continue;

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
