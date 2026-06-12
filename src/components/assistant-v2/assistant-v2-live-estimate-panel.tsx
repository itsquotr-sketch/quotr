"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useActionState, useTransition } from "react";
import { Check, TrendingDown, TrendingUp, X } from "lucide-react";
import {
  updateQuickEstimate,
  updateQuickEstimateMargin,
} from "@/actions/project-assistant";
import type { ProjectAssistantActionState } from "@/actions/project-assistant";
import { exportScopeSummary } from "@/actions/assistant-v2";
import {
  formatLastUpdated,
  useEstimateUpdate,
} from "@/components/projects/estimate-update-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DEFAULT_TARGET_MARGIN_PERCENT } from "@/lib/constants/quick-estimate";
import type { QuickEstimateConfidenceLevel } from "@/lib/constants/quick-estimate";
import type { ConfidenceFactor } from "@/lib/assistant-v2/compute-information-completeness";
import { parseQuickEstimateSummary } from "@/lib/project-assistant-summary";
import { formatCurrencyRange } from "@/lib/format-currency";
import { labelForEstimateQuality } from "@/lib/cost-engine/estimate-quality";
import type { QuickEstimate } from "@/types/database";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface AssistantV2LiveEstimatePanelProps {
  projectId: string;
  quickEstimate: QuickEstimate | null;
  qualityLevel: QuickEstimateConfidenceLevel;
  completenessPercent: number;
  confidenceFactors: ConfidenceFactor[];
  missingInformation: string[];
  finishLevel?: string;
  compact?: boolean;
}

function resolveRateSourceLabel(
  summary: ReturnType<typeof parseQuickEstimateSummary>
): string[] {
  const sources: string[] = [];
  const templates = summary?.templatesUsed ?? [];

  if (templates.length > 0) {
    sources.push(...templates.map((t) => `${t} Template`));
  }

  if (summary?.ratesSource === "saved") {
    sources.push("Organisation Rates");
  } else if (summary?.ratesSource === "fallback") {
    sources.push("Package Rates");
    if (!templates.length) sources.push("Benchmark Rates");
  }

  return sources.length > 0 ? sources : ["Benchmark Rates"];
}

function formatCostDelta(delta: number): string {
  const abs = Math.abs(delta);
  const formatted = abs.toLocaleString("en-NZ", {
    style: "currency",
    currency: "NZD",
    maximumFractionDigits: 0,
  });
  return delta >= 0 ? `+${formatted}` : `-${formatted.slice(1)}`;
}

export function AssistantV2LiveEstimatePanel({
  projectId,
  quickEstimate,
  qualityLevel,
  completenessPercent,
  confidenceFactors,
  missingInformation,
  finishLevel,
  compact = false,
}: AssistantV2LiveEstimatePanelProps) {
  const { status, lastUpdatedAt, lastChange } = useEstimateUpdate();
  const prevCostMidRef = useRef<number | null>(null);

  const costMid =
    quickEstimate?.estimated_cost_low != null &&
    quickEstimate?.estimated_cost_high != null
      ? (Number(quickEstimate.estimated_cost_low) +
          Number(quickEstimate.estimated_cost_high)) /
        2
      : null;

  useEffect(() => {
    if (costMid != null && prevCostMidRef.current != null) {
      // cost delta tracked via lastChange from context
    }
    if (costMid != null) {
      prevCostMidRef.current = costMid;
    }
  }, [costMid]);

  if (!quickEstimate) {
    return (
      <div className="rounded-xl border bg-card p-5 shadow-sm">
        <p className="text-sm font-semibold">Draft Quick Estimate</p>
        <p className="mt-3 text-sm text-muted-foreground">
          Describe the job to see your draft estimate.
        </p>
      </div>
    );
  }

  const hasResults =
    quickEstimate.estimated_cost_low != null &&
    quickEstimate.estimated_cost_high != null;

  const summary = parseQuickEstimateSummary(quickEstimate.notes ?? null);
  const rateSources = resolveRateSourceLabel(summary);
  const targetMarginPercent =
    quickEstimate.target_margin_percent != null
      ? Number(quickEstimate.target_margin_percent)
      : DEFAULT_TARGET_MARGIN_PERCENT;

  const statusLabel =
    status === "saving"
      ? "Saving…"
      : status === "updating"
        ? "Updating estimate…"
        : status === "saved"
          ? `Updated ${formatLastUpdated(lastUpdatedAt) ?? "just now"}`
          : null;

  const quoteReady =
    qualityLevel === "high" && completenessPercent >= 85 && hasResults;

  const completenessDelta =
    lastChange?.previousCompleteness != null &&
    lastChange?.newCompleteness != null
      ? lastChange.newCompleteness - lastChange.previousCompleteness
      : null;

  return (
    <div
      className={cn(
        "rounded-xl border bg-card shadow-sm lg:sticky lg:top-4",
        compact ? "p-4" : "p-5"
      )}
    >
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold">Draft Quick Estimate</p>
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[10px] font-medium",
              quoteReady
                ? "bg-primary/10 text-primary"
                : "bg-muted text-muted-foreground"
            )}
          >
            {quoteReady ? "Quote Ready" : "Not Quote Ready"}
          </span>
          {(status === "updating" || status === "saving") && (
            <span className="animate-pulse text-[10px] text-muted-foreground">
              {status === "saving" ? "Saving…" : "Recalculating…"}
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Confidence {completenessPercent}%
          {completenessDelta != null && completenessDelta !== 0 && (
            <span className="ml-1 text-primary">
              ({completenessDelta > 0 ? "+" : ""}
              {completenessDelta}%)
            </span>
          )}
          {statusLabel ? ` · ${statusLabel}` : ""}
        </p>
        {finishLevel && (
          <p className="text-xs text-muted-foreground">
            Finish level: <span className="font-medium text-foreground">{finishLevel}</span>
          </p>
        )}
        {lastChange?.changeLabel && status === "saved" && (
          <p className="flex items-center gap-1 text-xs text-primary">
            {lastChange.costDelta != null && lastChange.costDelta > 0 ? (
              <TrendingUp className="h-3 w-3" />
            ) : lastChange.costDelta != null && lastChange.costDelta < 0 ? (
              <TrendingDown className="h-3 w-3" />
            ) : null}
            {lastChange.costDelta != null
              ? `${formatCostDelta(lastChange.costDelta)} ${lastChange.changeLabel}`
              : lastChange.changeLabel}
          </p>
        )}
      </div>

      {hasResults ? (
        <div className={cn("space-y-4", compact ? "mt-3" : "mt-4")}>
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Estimate Range
            </p>
            <p
              className={cn(
                "font-semibold tracking-tight",
                compact ? "text-xl" : "text-2xl"
              )}
            >
              {formatCurrencyRange(
                Number(quickEstimate.estimated_cost_low),
                Number(quickEstimate.estimated_cost_high)
              )}
            </p>
          </div>

          {!compact && (
            <>
              <div>
                <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Recommended Sell
                </p>
                <p className="text-xl font-semibold tracking-tight">
                  {formatCurrencyRange(
                    quickEstimate.recommended_sell_low
                      ? Number(quickEstimate.recommended_sell_low)
                      : null,
                    quickEstimate.recommended_sell_high
                      ? Number(quickEstimate.recommended_sell_high)
                      : null
                  )}
                </p>
              </div>

              <TargetMarginEditor
                projectId={projectId}
                defaultMargin={targetMarginPercent}
              />
            </>
          )}

          <div className="grid grid-cols-2 gap-3 border-t pt-3 text-xs">
            <div>
              <p className="text-muted-foreground">Estimate Quality</p>
              <p className="font-medium">{labelForEstimateQuality(qualityLevel)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Information Completeness</p>
              <p className="font-medium">{completenessPercent}%</p>
            </div>
          </div>

          {!compact && missingInformation.length > 0 && (
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Missing Information
              </p>
              <ul className="mt-1.5 space-y-0.5">
                {missingInformation.slice(0, 5).map((item) => (
                  <li
                    key={item}
                    className="flex items-start gap-1.5 text-xs text-muted-foreground"
                  >
                    <X className="mt-0.5 h-3 w-3 shrink-0" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {!compact && (
            <>
              <div>
                <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Rate Source
                </p>
                <ul className="mt-1 space-y-0.5">
                  {rateSources.map((source) => (
                    <li key={source} className="text-xs">
                      {source}
                    </li>
                  ))}
                </ul>
              </div>

              {confidenceFactors.length > 0 && (
                <div>
                  <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    Why?
                  </p>
                  <ul className="mt-1.5 space-y-0.5">
                    {confidenceFactors.map((factor) => (
                      <li
                        key={factor.label}
                        className="flex items-start gap-1.5 text-xs"
                      >
                        {factor.met ? (
                          <Check className="mt-0.5 h-3 w-3 shrink-0 text-primary" />
                        ) : (
                          <X className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
                        )}
                        <span
                          className={
                            factor.met
                              ? "text-foreground"
                              : "text-muted-foreground"
                          }
                        >
                          {factor.label}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="flex flex-col gap-2 border-t pt-3">
                <GenerateDetailedEstimateButton projectId={projectId} />
                <ExportScopeButton projectId={projectId} />
              </div>
            </>
          )}
        </div>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">
          Answer a few quick questions to generate your range.
        </p>
      )}
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
      className="flex flex-wrap items-end gap-2"
      onSubmit={() => markSaving()}
    >
      <div className="space-y-1">
        <Label htmlFor="v2TargetMargin" className="text-[10px]">
          Margin
        </Label>
        <div className="flex items-center gap-1">
          <Input
            id="v2TargetMargin"
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
        {formPending ? "…" : "Edit Margin"}
      </Button>
    </form>
  );
}

function GenerateDetailedEstimateButton({ projectId }: { projectId: string }) {
  const router = useRouter();
  const { markUpdating, markSaved } = useEstimateUpdate();
  const [pending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      size="sm"
      className="w-full"
      disabled={pending}
      onClick={() => {
        startTransition(async () => {
          markUpdating();
          await updateQuickEstimate(projectId);
          router.refresh();
          markSaved();
          toast.info("Detailed estimate builder coming soon.");
        });
      }}
    >
      {pending ? "Generating…" : "Generate Detailed Estimate"}
    </Button>
  );
}

function ExportScopeButton({ projectId }: { projectId: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className="w-full"
      disabled={pending}
      onClick={() => {
        startTransition(async () => {
          const result = await exportScopeSummary(projectId);
          if (result.error) {
            toast.error(result.error);
            return;
          }
          if (result.summary) {
            await navigator.clipboard.writeText(result.summary);
            toast.success("Scope summary copied to clipboard.");
          }
        });
      }}
    >
      {pending ? "Exporting…" : "Export Scope"}
    </Button>
  );
}
