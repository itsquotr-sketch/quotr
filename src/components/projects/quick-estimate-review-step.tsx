"use client";

import { useState, useTransition } from "react";
import { finalizeQuickEstimate } from "@/actions/quick-estimate";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { QUICK_ESTIMATE_QUESTIONS } from "@/lib/constants/quick-estimate";
import {
  calculateQuickEstimate,
  formatCurrencyRange,
} from "@/lib/quick-estimate-calculate";
import type {
  EstimateDriverCategoryWithDrivers,
  ProjectEstimateDriverWithDetails,
  QuickEstimate,
  QuickEstimateAnswer,
} from "@/types/database";

function getAnswerDisplay(
  answers: QuickEstimateAnswer[],
  key: string
): string {
  const row = answers.find((a) => a.question_key === key);
  if (!row?.answer) return "—";
  const raw =
    typeof row.answer === "object" &&
    row.answer !== null &&
    "value" in row.answer
      ? String((row.answer as { value: string }).value)
      : String(row.answer);

  const question = QUICK_ESTIMATE_QUESTIONS.find((q) => q.key === key);
  if (question?.type === "select" && "options" in question) {
    return (
      question.options.find((o) => o.value === raw)?.label ?? raw
    );
  }
  return raw || "—";
}

interface QuickEstimateReviewStepProps {
  projectId: string;
  quickEstimate: QuickEstimate;
  answers: QuickEstimateAnswer[];
  projectDrivers: ProjectEstimateDriverWithDetails[];
  categories: EstimateDriverCategoryWithDrivers[];
}

export function QuickEstimateReviewStep({
  projectId,
  quickEstimate,
  answers,
  projectDrivers,
}: QuickEstimateReviewStepProps) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const drivers =
    projectDrivers
      .map((pd) => pd.estimate_drivers)
      .filter(Boolean)
      .map((d) => ({
        multiplier: d!.multiplier,
        fixed_allowance: d!.fixed_allowance,
        labour_modifier_percent: d!.labour_modifier_percent,
      })) ?? [];

  const preview = calculateQuickEstimate({
    workType: null,
    answers,
    drivers,
    clientBudget: quickEstimate.client_budget
      ? Number(quickEstimate.client_budget)
      : null,
  });

  function handleSave() {
    setError(null);
    startTransition(async () => {
      const result = await finalizeQuickEstimate(
        projectId,
        quickEstimate.id
      );
      if (result?.error) {
        setError(result.error);
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground">
            Job notes
          </h3>
          <p className="mt-1 whitespace-pre-wrap text-sm">
            {quickEstimate.source_notes || "—"}
          </p>
        </div>

        {quickEstimate.client_budget != null && (
          <div>
            <h3 className="text-sm font-semibold text-muted-foreground">
              Client budget
            </h3>
            <p className="mt-1 text-sm">
              ${Number(quickEstimate.client_budget).toLocaleString("en-AU")}
            </p>
          </div>
        )}

        <div>
          <h3 className="text-sm font-semibold text-muted-foreground">
            Your answers
          </h3>
          <dl className="mt-2 space-y-2">
            {QUICK_ESTIMATE_QUESTIONS.map((q) => (
              <div key={q.key}>
                <dt className="text-xs text-muted-foreground">{q.text}</dt>
                <dd className="text-sm">{getAnswerDisplay(answers, q.key)}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-muted-foreground">
            Selected constraints
          </h3>
          {projectDrivers.length === 0 ? (
            <p className="mt-1 text-sm text-muted-foreground">
              No drivers selected — using base assumptions only.
            </p>
          ) : (
            <ul className="mt-2 space-y-1 text-sm">
              {projectDrivers.map((pd) => (
                <li key={pd.id}>
                  {pd.estimate_drivers?.name ?? "Unknown driver"}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <Card className="rounded-xl border-dashed">
        <CardHeader>
          <CardTitle className="normal-case tracking-normal text-base font-semibold">
            {preview.canCalculate
              ? "Draft quick estimate"
              : "Quick Estimate calculation coming next"}
          </CardTitle>
          <CardDescription>
            {preview.canCalculate
              ? "Placeholder range only — not quote-ready. Add your rates library in a future sprint for accurate pricing."
              : (preview.reason ??
                "Complete the work type question to enable a placeholder calculation.")}
          </CardDescription>
        </CardHeader>
        {preview.canCalculate && (
          <CardContent>
            <dl className="grid grid-cols-2 gap-4">
              <div>
                <dt className="text-xs text-muted-foreground">
                  Estimate range
                </dt>
                <dd className="text-lg font-semibold">
                  {formatCurrencyRange(
                    preview.estimatedCostLow,
                    preview.estimatedCostHigh
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">
                  Recommended sell
                </dt>
                <dd className="text-lg font-semibold">
                  {formatCurrencyRange(
                    preview.recommendedSellLow,
                    preview.recommendedSellHigh
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">
                  Expected margin
                </dt>
                <dd className="text-lg font-semibold">
                  {preview.expectedMarginPercent != null
                    ? `${preview.expectedMarginPercent}%`
                    : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Confidence</dt>
                <dd className="text-lg font-semibold capitalize">
                  {preview.confidenceLevel}
                </dd>
              </div>
            </dl>
          </CardContent>
        )}
      </Card>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button
        type="button"
        onClick={handleSave}
        disabled={pending}
        className="w-full md:w-auto"
      >
        {pending ? "Saving…" : "Save quick estimate"}
      </Button>
    </div>
  );
}
