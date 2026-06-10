"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useTransition } from "react";
import {
  updateQuickEstimate,
  updateQuickEstimateMargin,
} from "@/actions/project-assistant";
import type { ProjectAssistantActionState } from "@/actions/project-assistant";
import { StatusBadge } from "@/components/projects/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DEFAULT_TARGET_MARGIN_PERCENT } from "@/lib/constants/quick-estimate";
import { parseQuickEstimateSummary } from "@/lib/project-assistant-summary";
import {
  formatCurrency,
  formatCurrencyRange,
} from "@/lib/project-assistant-calculate";
import type { QuickEstimate } from "@/types/database";

interface EstimatePanelProps {
  projectId: string;
  quickEstimate: QuickEstimate | null;
}

export function EstimatePanel({ projectId, quickEstimate }: EstimatePanelProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const hasResults =
    quickEstimate?.estimated_cost_low != null &&
    quickEstimate?.estimated_cost_high != null;

  const summary = parseQuickEstimateSummary(quickEstimate?.notes ?? null);

  function handleUpdate() {
    startTransition(async () => {
      await updateQuickEstimate(projectId);
      router.refresh();
    });
  }

  if (!quickEstimate) {
    return (
      <div className="rounded-lg border border-dashed bg-muted/10 p-3 text-center text-xs text-muted-foreground">
        Confirm a work area to see your live estimate.
      </div>
    );
  }

  const targetMarginPercent =
    quickEstimate.target_margin_percent != null
      ? Number(quickEstimate.target_margin_percent)
      : DEFAULT_TARGET_MARGIN_PERCENT;

  return (
    <div className="space-y-3 rounded-lg border bg-card p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Live estimate
          </h3>
          <p className="mt-0.5 text-[10px] text-muted-foreground">
            Updates as you answer questions
          </p>
        </div>
        <StatusBadge label="Draft" />
      </div>

      {hasResults ? (
        <>
          <dl className="grid gap-3 sm:grid-cols-2">
            <div>
              <dt className="text-[10px] font-medium text-muted-foreground">
                Estimate range
              </dt>
              <dd className="text-lg font-semibold tracking-tight">
                {formatCurrencyRange(
                  Number(quickEstimate.estimated_cost_low),
                  Number(quickEstimate.estimated_cost_high)
                )}
              </dd>
            </div>
            <div>
              <dt className="text-[10px] font-medium text-muted-foreground">
                Sell range
              </dt>
              <dd className="text-lg font-semibold tracking-tight">
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

          <TargetMarginEditor
            projectId={projectId}
            defaultMargin={targetMarginPercent}
          />

          {summary?.rangeQualityLabel && (
            <p className="text-xs text-muted-foreground">
              Range: {summary.rangeQualityLabel}
              {summary.rangeQualityReason ? ` — ${summary.rangeQualityReason}` : ""}
            </p>
          )}
        </>
      ) : (
        <p className="text-xs text-muted-foreground">
          Answer a few questions above to generate your draft estimate.
        </p>
      )}

      {quickEstimate.client_budget != null && (
        <p className="text-xs">
          <span className="text-muted-foreground">Client budget: </span>
          <span className="font-medium">
            {formatCurrency(Number(quickEstimate.client_budget))}
          </span>
        </p>
      )}

      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={handleUpdate}
        className="w-full"
      >
        {pending ? "Updating…" : "Update estimate"}
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
  const boundAction = updateQuickEstimateMargin.bind(null, projectId);
  const [state, formAction, formPending] = useActionState(
    boundAction,
    {} as ProjectAssistantActionState
  );

  useEffect(() => {
    if (state.success) {
      router.refresh();
    }
  }, [state.success, router]);

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <div className="space-y-1">
        <Label htmlFor="targetMarginPercent" className="text-[10px] font-medium">
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
      <Button type="submit" size="sm" variant="ghost" disabled={formPending}>
        {formPending ? "…" : "Apply"}
      </Button>
      {state.error && (
        <p className="w-full text-xs text-destructive">{state.error}</p>
      )}
    </form>
  );
}
