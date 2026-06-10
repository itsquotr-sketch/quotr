"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { updateQuickEstimate } from "@/actions/project-assistant";
import { StatusBadge } from "@/components/projects/status-badge";
import { Button } from "@/components/ui/button";
import {
  QUICK_ESTIMATE_BUDGET_FIT,
  QUICK_ESTIMATE_CONFIDENCE_LEVELS,
  QUICK_ESTIMATE_STATUSES,
} from "@/lib/constants/quick-estimate";
import { labelForQualityLevel } from "@/lib/constants/quality-level";
import { labelFor } from "@/lib/constants/projects";
import { parseQuickEstimateSummary } from "@/lib/project-assistant-summary";
import {
  formatCurrency,
  formatCurrencyRange,
} from "@/lib/project-assistant-calculate";
import type { QuickEstimate } from "@/types/database";

interface ProjectAssistantResultProps {
  projectId: string;
  quickEstimate: QuickEstimate | null;
  fallbackTrades: string[];
  confirmedWorkAreas: string[];
  questionsAnswered: number;
  questionsTotal: number;
  selectedConstraintLabels: string[];
}

export function ProjectAssistantResult({
  projectId,
  quickEstimate,
  fallbackTrades,
  confirmedWorkAreas,
  questionsAnswered,
  questionsTotal,
  selectedConstraintLabels,
}: ProjectAssistantResultProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const hasResults =
    quickEstimate?.estimated_cost_low != null &&
    quickEstimate?.estimated_cost_high != null;

  const summary = parseQuickEstimateSummary(quickEstimate?.notes ?? null);
  const workAreas =
    summary?.workAreasIncluded.length
      ? summary.workAreasIncluded
      : confirmedWorkAreas;
  const answered =
    summary?.questionsTotal ? summary.questionsAnswered : questionsAnswered;
  const total =
    summary?.questionsTotal ? summary.questionsTotal : questionsTotal;
  const constraints =
    summary?.constraintsIncluded.length
      ? summary.constraintsIncluded
      : selectedConstraintLabels;
  const includedTrades = summary?.includedTrades ?? fallbackTrades;
  const allowances = summary?.allowances ?? [];
  const assumptions = summary?.assumptions ?? [];
  const risks = summary?.risks ?? [];
  const missingInformation = summary?.missingInformation ?? [];
  const inputsUsed = summary?.inputsUsed ?? [];
  const ratesSource = summary?.ratesSource ?? null;
  const constraintsApplied = summary?.constraintsApplied ?? constraints;
  const qualityLevelLabel = labelForQualityLevel(
    summary?.qualityLevel ?? quickEstimate?.quality_level
  );
  const qualityLevelNote =
    summary?.qualityLevelNote ??
    ((summary?.qualityLevel ?? quickEstimate?.quality_level) === "unknown"
      ? "Finish level unknown — estimate range kept wider."
      : null);
  const templatesUsed = summary?.templatesUsed ?? [];
  const keyFactsUsed = summary?.keyFactsUsed ?? [];
  const confidenceReason = summary?.confidenceReason ?? null;
  const baseCalculations = inputsUsed.filter((item) => item.includes("× $"));
  const otherInputsUsed = inputsUsed.filter((item) => !item.includes("× $"));

  function handleUpdate() {
    startTransition(async () => {
      await updateQuickEstimate(projectId);
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3">
        <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
          Draft quick estimate — not quote-ready.
        </p>
        <p className="mt-1 text-xs text-amber-800/80 dark:text-amber-200/80">
          Use this ballpark to qualify the client. A detailed take-off is
          required before quoting.
        </p>
      </div>

      {(ratesSource || templatesUsed.length > 0) && (
        <div className="space-y-1 text-sm">
          {ratesSource && (
            <p>
              <span className="text-muted-foreground">Rates source: </span>
              <span className="font-medium">
                {ratesSource === "saved"
                  ? "Using your saved rates"
                  : "Using template benchmark rates"}
              </span>
            </p>
          )}
          {templatesUsed.length > 0 && (
            <p>
              <span className="text-muted-foreground">Scope templates: </span>
              <span className="font-medium">{templatesUsed.join(", ")}</span>
            </p>
          )}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <h4 className="text-xs font-semibold text-muted-foreground">
            Finish level
          </h4>
          <p className="mt-2 text-sm font-medium">{qualityLevelLabel}</p>
          {qualityLevelNote && (
            <p className="mt-1 text-sm text-muted-foreground">
              {qualityLevelNote}
            </p>
          )}
        </div>
        <SummaryList title="Confirmed work areas" items={workAreas} />
        <div>
          <h4 className="text-xs font-semibold text-muted-foreground">
            Questions answered
          </h4>
          <p className="mt-2 text-sm">
            {answered} of {total || "—"}
            {total > answered ? ` (${total - answered} remaining)` : ""}
          </p>
        </div>
        <SummaryList title="Constraints applied" items={constraintsApplied} />
        <SummaryList title="Included trades" items={includedTrades} />
      </div>

      {!quickEstimate && (
        <div className="rounded-xl border border-dashed bg-muted/20 p-4">
          <p className="text-sm text-muted-foreground">
            Complete the steps above, then update your draft quick estimate.
          </p>
        </div>
      )}

      {quickEstimate && !hasResults && (
        <div className="rounded-xl border border-dashed bg-muted/20 p-4">
          <p className="text-sm text-muted-foreground">
            Answer questions and set budget, finish and constraints, then update
            your draft quick estimate.
          </p>
        </div>
      )}

      {hasResults && (
        <>
          <div className="flex flex-wrap gap-2">
            <StatusBadge
              label={labelFor(QUICK_ESTIMATE_STATUSES, quickEstimate!.status)}
            />
            <StatusBadge
              label={`Confidence: ${labelFor(
                QUICK_ESTIMATE_CONFIDENCE_LEVELS,
                quickEstimate!.confidence_level
              )}`}
            />
            {quickEstimate!.budget_fit &&
              quickEstimate!.budget_fit !== "unknown" && (
                <StatusBadge
                  label={`Budget fit: ${labelFor(
                    QUICK_ESTIMATE_BUDGET_FIT,
                    quickEstimate!.budget_fit
                  )}`}
                />
              )}
          </div>

          <dl className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <div>
              <dt className="text-xs text-muted-foreground">
                Estimate cost range
              </dt>
              <dd className="mt-0.5 text-lg font-semibold">
                {formatCurrencyRange(
                  Number(quickEstimate!.estimated_cost_low),
                  Number(quickEstimate!.estimated_cost_high)
                )}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">
                Recommended sell range
              </dt>
              <dd className="mt-0.5 text-lg font-semibold">
                {formatCurrencyRange(
                  quickEstimate!.recommended_sell_low
                    ? Number(quickEstimate!.recommended_sell_low)
                    : null,
                  quickEstimate!.recommended_sell_high
                    ? Number(quickEstimate!.recommended_sell_high)
                    : null
                )}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Target margin</dt>
              <dd className="mt-0.5 text-lg font-semibold">
                {quickEstimate!.target_margin_percent != null
                  ? `${Number(quickEstimate!.target_margin_percent)}%`
                  : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Expected margin</dt>
              <dd className="mt-0.5 text-lg font-semibold">
                {quickEstimate!.expected_margin_percent != null
                  ? `${Number(quickEstimate!.expected_margin_percent)}%`
                  : "—"}
              </dd>
            </div>
          </dl>

          {quickEstimate!.client_budget != null && (
            <p className="text-sm">
              <span className="text-muted-foreground">Client budget: </span>
              <span className="font-medium">
                {formatCurrency(Number(quickEstimate!.client_budget))}
              </span>
            </p>
          )}
        </>
      )}

      {confidenceReason && (
        <p className="text-sm text-muted-foreground">{confidenceReason}</p>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <SummaryList title="Key facts used" items={keyFactsUsed} />
        <SummaryList title="Base calculation" items={baseCalculations} />
        <SummaryList title="Information used" items={otherInputsUsed} />
        <SummaryList title="Included allowances" items={allowances} />
        <SummaryList title="Assumptions" items={assumptions} />
        <SummaryList title="Key risks" items={risks} />
        <SummaryList
          title="Missing information"
          items={missingInformation}
          emptyLabel="No critical gaps identified"
        />
      </div>

      <Button
        type="button"
        className="w-full sm:w-auto"
        disabled={pending}
        onClick={handleUpdate}
      >
        {pending ? "Updating…" : "Update draft quick estimate"}
      </Button>
    </div>
  );
}

function SummaryList({
  title,
  items,
  emptyLabel = "—",
}: {
  title: string;
  items: string[];
  emptyLabel?: string;
}) {
  return (
    <div>
      <h4 className="text-xs font-semibold text-muted-foreground">{title}</h4>
      {items.length > 0 ? (
        <ul className="mt-2 space-y-1 text-sm">
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">{emptyLabel}</p>
      )}
    </div>
  );
}
