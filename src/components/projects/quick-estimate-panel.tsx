"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useTransition } from "react";
import { Check, X } from "lucide-react";
import {
  updateQuickEstimate,
  updateQuickEstimateMargin,
} from "@/actions/project-assistant";
import type { ProjectAssistantActionState } from "@/actions/project-assistant";
import { EstimateTracePanel } from "@/components/projects/estimate-trace";
import {
  formatLastUpdated,
  useEstimateUpdate,
} from "@/components/projects/estimate-update-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DEFAULT_TARGET_MARGIN_PERCENT } from "@/lib/constants/quick-estimate";
import { parseQuickEstimateSummary } from "@/lib/project-assistant-summary";
import { formatCurrencyRange } from "@/lib/project-assistant-calculate";
import type { QuickEstimate } from "@/types/database";
import { cn } from "@/lib/utils";

interface QuickEstimatePanelProps {
  projectId: string;
  quickEstimate: QuickEstimate | null;
}

function ConfidenceDetails({
  score,
  levelLabel,
  reasons,
  questionsToHigh,
}: {
  score: number | null | undefined;
  levelLabel: string | null | undefined;
  reasons: string[];
  questionsToHigh: number;
}) {
  if (score == null) return null;

  return (
    <div className="space-y-1.5 text-xs">
      <p>
        <span className="text-muted-foreground">Estimate confidence: </span>
        <span className="font-medium">
          {score} / 100
        </span>
        {levelLabel && (
          <>
            <span className="text-muted-foreground"> · Level: </span>
            <span className="font-medium">{levelLabel}</span>
          </>
        )}
      </p>
      {reasons.length > 0 && (
        <ul className="space-y-0.5">
          {reasons.map((reason) => (
            <li
              key={reason}
              className={cn(
                "flex items-start gap-1.5",
                reason.startsWith("⚠") && "text-muted-foreground"
              )}
            >
              {reason.startsWith("⚠") ? (
                <X className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              ) : (
                <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
              )}
              <span>{reason.replace(/^⚠ /, "")}</span>
            </li>
          ))}
        </ul>
      )}
      {questionsToHigh > 0 && (
        <p className="text-muted-foreground">
          Answer {questionsToHigh} more key question
          {questionsToHigh === 1 ? "" : "s"} to reach High confidence.
        </p>
      )}
    </div>
  );
}

export function QuickEstimatePanel({
  projectId,
  quickEstimate,
}: QuickEstimatePanelProps) {
  const router = useRouter();
  const { status, lastUpdatedAt, markUpdating, markSaved } = useEstimateUpdate();
  const [pending, startTransition] = useTransition();

  const summary = parseQuickEstimateSummary(quickEstimate?.notes ?? null);

  const hasResults =
    quickEstimate?.estimated_cost_low != null &&
    quickEstimate?.estimated_cost_high != null;

  if (!quickEstimate) {
    return (
      <div className="rounded-lg border border-dashed bg-muted/10 p-4 text-center text-sm text-muted-foreground">
        Confirm a work area to see your draft quick estimate.
      </div>
    );
  }

  const targetMarginPercent =
    quickEstimate.target_margin_percent != null
      ? Number(quickEstimate.target_margin_percent)
      : DEFAULT_TARGET_MARGIN_PERCENT;

  const contingencyPercent = summary?.contingencyPercent ?? 5;
  const centralEstimate = summary?.centralEstimate;

  const statusLabel =
    status === "saving" || status === "updating"
      ? "Updating…"
      : status === "saved"
        ? formatLastUpdated(lastUpdatedAt) ?? "Updated just now"
        : lastUpdatedAt
          ? formatLastUpdated(lastUpdatedAt)
          : null;

  function handleRefresh() {
    startTransition(async () => {
      markUpdating();
      await updateQuickEstimate(projectId);
      router.refresh();
      markSaved();
    });
  }

  return (
    <div className="space-y-3 rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">Live estimate</h3>
          {statusLabel && (
            <p className="text-[10px] text-muted-foreground">{statusLabel}</p>
          )}
        </div>
      </div>

      {summary?.rangeChangedMessage && (
        <p className="rounded-md bg-primary/5 px-2 py-1.5 text-xs text-primary">
          {summary.rangeChangedMessage}
        </p>
      )}

      {hasResults ? (
        <>
          <dl className="grid gap-3 sm:grid-cols-2">
            <div>
              <dt className="text-[10px] font-medium text-muted-foreground">
                Estimate range
              </dt>
              <dd className="text-xl font-semibold tracking-tight">
                {formatCurrencyRange(
                  Number(quickEstimate.estimated_cost_low),
                  Number(quickEstimate.estimated_cost_high)
                )}
              </dd>
              {centralEstimate != null && (
                <dd className="text-[10px] text-muted-foreground">
                  Base estimate {formatCurrencyRange(centralEstimate, centralEstimate)}
                </dd>
              )}
            </div>
            <div>
              <dt className="text-[10px] font-medium text-muted-foreground">
                Recommended sell range
              </dt>
              <dd className="text-xl font-semibold tracking-tight">
                {formatCurrencyRange(
                  quickEstimate.recommended_sell_low
                    ? Number(quickEstimate.recommended_sell_low)
                    : null,
                  quickEstimate.recommended_sell_high
                    ? Number(quickEstimate.recommended_sell_high)
                    : null
                )}
              </dd>
            </div>
          </dl>

          <dl className="grid gap-2 text-xs sm:grid-cols-3">
            <div>
              <dt className="text-[10px] text-muted-foreground">Contingency</dt>
              <dd className="font-medium">{contingencyPercent}%</dd>
            </div>
            <div>
              <dt className="text-[10px] text-muted-foreground">Target margin</dt>
              <dd className="font-medium">{targetMarginPercent}%</dd>
            </div>
            <div>
              <dt className="text-[10px] text-muted-foreground">Rate source</dt>
              <dd className="font-medium">
                {summary?.rateSourceDetail ?? "Template benchmark"}
              </dd>
            </div>
          </dl>

          {summary?.rateSourceDetail === "Placeholder fallback" && (
            <p className="text-xs text-muted-foreground">
              Pricing is rough because no rate/template match was found.
            </p>
          )}

          <ConfidenceDetails
            score={summary?.confidenceScore}
            levelLabel={summary?.confidenceLevelLabel}
            reasons={summary?.confidenceReasons ?? summary?.qualityFactors?.map((f) => f.label) ?? []}
            questionsToHigh={summary?.questionsToHigh ?? 0}
          />

          <TargetMarginEditor
            projectId={projectId}
            defaultMargin={targetMarginPercent}
          />

          <EstimateTracePanel trace={summary?.estimateTrace} />
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          Answer key questions — your estimate updates automatically.
        </p>
      )}

      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={pending}
        onClick={handleRefresh}
        className="h-7 text-xs text-muted-foreground"
      >
        {pending ? "Refreshing…" : "Refresh estimate"}
      </Button>
    </div>
  );
}

function TargetMarginEditor({
  projectId,
  defaultMargin,
}: {
  projectId: string;
  defaultMargin: number;
}) {
  const router = useRouter();
  const { markSaving, markUpdating, markSaved } = useEstimateUpdate();
  const boundAction = updateQuickEstimateMargin.bind(null, projectId);
  const [state, formAction, formPending] = useActionState(
    boundAction,
    {} as ProjectAssistantActionState
  );

  useEffect(() => {
    if (state.success) {
      markUpdating();
      router.refresh();
      markSaved();
    }
  }, [state.success, router, markUpdating, markSaved]);

  return (
    <form
      action={formAction}
      className="flex flex-wrap items-end gap-2 border-t pt-3"
      onSubmit={() => markSaving()}
    >
      <div className="space-y-1">
        <Label htmlFor="targetMarginPercent" className="text-[10px]">
          Target margin
        </Label>
        <div className="flex items-center gap-1">
          <Input
            id="targetMarginPercent"
            name="targetMarginPercent"
            type="number"
            min={0}
            max={100}
            step={0.5}
            defaultValue={defaultMargin}
            className="h-8 w-20 text-sm"
          />
          <span className="text-xs text-muted-foreground">%</span>
        </div>
      </div>
      <Button type="submit" size="sm" variant="outline" disabled={formPending}>
        {formPending ? "…" : "Apply"}
      </Button>
      {state.error && (
        <p className="w-full text-xs text-destructive">{state.error}</p>
      )}
    </form>
  );
}

/** @deprecated Use QuickEstimatePanel */
export const EstimateSummaryPanel = QuickEstimatePanel;
