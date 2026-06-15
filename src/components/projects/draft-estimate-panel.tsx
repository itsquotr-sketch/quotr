"use client";

import { useRouter } from "next/navigation";
import { useTransition, useState, useEffect, useRef } from "react";
import { Check, ChevronDown, ChevronRight, X } from "lucide-react";
import {
  generateDraftQuickEstimate,
  updateQuickEstimateMargin,
} from "@/actions/project-assistant";
import type { ProjectAssistantActionState } from "@/actions/project-assistant";
import { EstimateTracePanel } from "@/components/projects/estimate-trace";
import {
  formatLastUpdated,
  useEstimateUpdate,
} from "@/components/projects/estimate-update-context";
import { useScrollTarget } from "@/components/projects/assistant-flow-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DEFAULT_TARGET_MARGIN_PERCENT } from "@/lib/constants/quick-estimate";
import { EstimateRetryButton } from "@/components/projects/estimate-retry-button";
import { resolveEstimatePanelState } from "@/lib/cost-engine/resolve-estimate-panel-state";
import { parseQuickEstimateSummary } from "@/lib/project-assistant-summary";
import { formatCurrencyRange } from "@/lib/format-currency";
import type { QuickEstimate } from "@/types/database";
import { cn } from "@/lib/utils";
import { useActionState } from "react";

interface DraftEstimatePanelProps {
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
        <span className="font-medium">{score} / 100</span>
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

export function DraftEstimatePanel({
  projectId,
  quickEstimate,
}: DraftEstimatePanelProps) {
  const scrollRef = useScrollTarget("estimate");
  const router = useRouter();
  const { status, lastUpdatedAt, runGuardedRefresh } = useEstimateUpdate();
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [generatePending, startGenerate] = useTransition();

  const summary = parseQuickEstimateSummary(quickEstimate?.notes ?? null);
  const panelState = resolveEstimatePanelState(quickEstimate, summary);

  const hasResults =
    quickEstimate?.estimated_cost_low != null &&
    quickEstimate?.estimated_cost_high != null;

  const isUpdating = status === "saving" || status === "updating" || generatePending;

  if (!quickEstimate) {
    return (
      <div
        id="draft-estimate-section"
        ref={scrollRef}
        className="rounded-lg border border-dashed bg-muted/10 p-4 text-center text-sm text-muted-foreground"
      >
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

  const statusLabel = isUpdating
    ? "Updating estimate…"
    : status === "saved"
      ? formatLastUpdated(lastUpdatedAt) ?? "Updated just now"
      : lastUpdatedAt
        ? formatLastUpdated(lastUpdatedAt)
        : null;

  function handleGenerate() {
    startGenerate(async () => {
      await runGuardedRefresh(async () => {
        await generateDraftQuickEstimate(projectId);
        router.refresh();
      }, "recalculate");
    });
  }

  const breakdown = summary?.costBreakdown ?? summary?.estimateTrace?.costBreakdown;
  const includedAreas = summary?.workAreasIncluded ?? [];
  const excludedAreas = summary?.workAreasExcluded ?? [];

  return (
    <div
      id="draft-estimate-section"
      ref={scrollRef}
      className={cn(
        "space-y-3 rounded-lg border bg-card p-4 transition-opacity",
        isUpdating && "opacity-90"
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">Draft quick estimate</h3>
          {statusLabel && (
            <p className="text-[10px] text-muted-foreground">{statusLabel}</p>
          )}
        </div>
        <Button
          type="button"
          size="sm"
          variant={hasResults ? "outline" : "default"}
          className="h-8 text-xs"
          disabled={isUpdating}
          onClick={handleGenerate}
        >
          {isUpdating
            ? "Updating…"
            : hasResults
              ? "Update Draft Quick Estimate"
              : "Generate Draft Quick Estimate"}
        </Button>
      </div>

      {summary?.rangeChangedMessage && !isUpdating && (
        <p className="rounded-md bg-primary/5 px-2 py-1.5 text-xs text-primary">
          {summary.rangeChangedMessage}
        </p>
      )}

      {panelState?.kind === "failed" && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm">
          <p className="font-medium">{panelState.title}</p>
          <p className="mt-1 text-muted-foreground">{panelState.reason}</p>
          {panelState.canRetry && (
            <div className="mt-3">
              <EstimateRetryButton
                projectId={projectId}
                onSuccess={() => router.refresh()}
                compact
              />
            </div>
          )}
        </div>
      )}

      {panelState?.kind === "partial" && hasResults && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs">
          <p className="font-medium text-amber-800 dark:text-amber-300">
            {panelState.title}
          </p>
          {panelState.unpricedAreas.map((area) => (
            <p key={area} className="mt-1 text-muted-foreground">
              {area} not included yet — pricing support/rates needed.
            </p>
          ))}
        </div>
      )}

      {(panelState?.kind === "ready" || panelState?.kind === "partial") &&
        panelState.warning && (
          <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-xs text-amber-800 dark:text-amber-300">
            {panelState.warning}
          </p>
        )}

      {hasResults ? (
        <div
          className={cn(
            "space-y-3 transition-all",
            isUpdating && "pointer-events-none blur-[0.5px]"
          )}
        >
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
                  Base estimate{" "}
                  {formatCurrencyRange(centralEstimate, centralEstimate)}
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

          {(includedAreas.length > 0 || excludedAreas.length > 0) && (
            <div className="space-y-1 text-xs">
              {includedAreas.length > 0 && (
                <p>
                  <span className="text-muted-foreground">Included: </span>
                  {includedAreas.join(", ")}
                </p>
              )}
              {excludedAreas.length > 0 && (
                <p className="text-muted-foreground">
                  Excluded for now: {excludedAreas.join(", ")}
                </p>
              )}
            </div>
          )}

          <ConfidenceDetails
            score={summary?.confidenceScore}
            levelLabel={summary?.confidenceLevelLabel}
            reasons={
              summary?.confidenceReasons ??
              summary?.qualityFactors?.map((f) => f.label) ??
              []
            }
            questionsToHigh={summary?.questionsToHigh ?? 0}
          />

          {breakdown && (
            <div className="rounded-lg border">
              <button
                type="button"
                onClick={() => setShowBreakdown((v) => !v)}
                className="flex w-full items-center gap-1 px-3 py-2 text-left text-xs font-medium"
              >
                {showBreakdown ? (
                  <ChevronDown className="h-3.5 w-3.5" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5" />
                )}
                Show breakdown
              </button>
              {showBreakdown && (
                <div className="space-y-2 border-t px-3 py-2 text-xs">
                  <p className="text-[10px] text-muted-foreground">
                    Indicative breakdown — not a detailed quote.
                  </p>
                  <dl className="grid gap-1 sm:grid-cols-2">
                    <BreakdownRow label="Labour" value={breakdown.labour} />
                    <BreakdownRow label="Materials" value={breakdown.materials} />
                    <BreakdownRow
                      label="Subcontractors / Trades"
                      value={breakdown.subcontractors}
                    />
                    <BreakdownRow label="Allowances" value={breakdown.allowances} />
                    <BreakdownRow
                      label="Contingency"
                      value={breakdown.contingency}
                    />
                  </dl>
                  {(breakdown.byWorkArea?.length ?? 0) > 0 && (
                    <div className="space-y-1 border-t pt-2">
                      <p className="font-medium">By work area</p>
                      {(breakdown.byWorkArea ?? []).map((area) => (
                        <p key={area.name} className="flex justify-between gap-2">
                          <span>{area.name}</span>
                          <span>
                            {formatCurrencyRange(area.total, area.total)}
                          </span>
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <TargetMarginEditor
            projectId={projectId}
            defaultMargin={targetMarginPercent}
          />

          <EstimateTracePanel trace={summary?.estimateTrace} />
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {panelState?.kind === "failed"
              ? panelState.reason
              : panelState?.kind === "empty"
                ? panelState.detail
                : "Answer the key questions to generate a draft estimate."}
          </p>
          {panelState?.canRetry && panelState.kind !== "failed" && (
            <EstimateRetryButton
              projectId={projectId}
              onSuccess={() => router.refresh()}
              compact
            />
          )}
        </div>
      )}
    </div>
  );
}

function BreakdownRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{formatCurrencyRange(value, value)}</dd>
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
  const { runGuardedRefresh } = useEstimateUpdate();
  const boundAction = updateQuickEstimateMargin.bind(null, projectId);
  const [state, formAction, formPending] = useActionState(
    boundAction,
    {} as ProjectAssistantActionState
  );
  const [margin, setMargin] = useState(String(defaultMargin));
  const savedMarginRef = useRef(defaultMargin);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    savedMarginRef.current = defaultMargin;
    setMargin(String(defaultMargin));
  }, [defaultMargin]);

  useEffect(() => {
    if (state.success) {
      setSuccessMsg(state.message ?? "Margin updated");
      const next = Number(margin);
      if (Number.isFinite(next)) {
        savedMarginRef.current = next;
      }
      void runGuardedRefresh(async () => {
        router.refresh();
      }, "margin_changed");
    }
    if (state.error) {
      setSuccessMsg(null);
    }
  }, [state.success, state.error, state.message, margin, router, runGuardedRefresh]);

  function handleBlur() {
    const parsed = Number(margin);
    if (!Number.isFinite(parsed) || parsed === savedMarginRef.current) {
      return;
    }
    const form = document.getElementById(
      "target-margin-form"
    ) as HTMLFormElement | null;
    form?.requestSubmit();
  }

  return (
    <form
      id="target-margin-form"
      action={formAction}
      className="flex flex-wrap items-end gap-2 border-t pt-3"
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
            value={margin}
            onChange={(e) => {
              setSuccessMsg(null);
              setMargin(e.target.value);
            }}
            onBlur={handleBlur}
            disabled={formPending}
            className="h-8 w-20 text-sm"
          />
          <span className="text-xs text-muted-foreground">%</span>
        </div>
      </div>
      <Button type="submit" size="sm" variant="outline" disabled={formPending}>
        {formPending ? "Saving…" : "Apply"}
      </Button>
      {successMsg && !state.error && (
        <p className="w-full text-xs text-primary">{successMsg}</p>
      )}
      {state.error && (
        <p className="w-full text-xs text-destructive">{state.error}</p>
      )}
    </form>
  );
}

/** @deprecated Use DraftEstimatePanel */
export const QuickEstimatePanel = DraftEstimatePanel;
