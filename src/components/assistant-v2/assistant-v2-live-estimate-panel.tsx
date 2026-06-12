"use client";

import { useState, useTransition } from "react";
import { Check, ChevronDown, TrendingDown, TrendingUp, X } from "lucide-react";
import {
  exportScopeSummary,
  type AssistantSyncPayload,
} from "@/actions/assistant-v2";
import { AssistantV2MarginEditor } from "@/components/assistant-v2/assistant-v2-margin-editor";
import {
  formatLastUpdated,
  useEstimateUpdate,
} from "@/components/projects/estimate-update-context";
import { Button } from "@/components/ui/button";
import {
  describeEstimateQualityTier,
  type EstimateQualityFactor,
  type EstimateQualityTier,
} from "@/lib/cost-engine/estimate-quality";
import type { CostBreakdown } from "@/lib/cost-engine/build-cost-breakdown";
import type { EstimateChangeEvent } from "@/lib/cost-engine/recalculate-quick-estimate";
import { formatCurrencyRange } from "@/lib/format-currency";
import type { QuickEstimate } from "@/types/database";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { AssistantV2NextSteps } from "@/components/assistant-v2/assistant-v2-next-steps";
import {
  ScopeRateOnboardingDialog,
  type BenchmarkScopeForOnboarding,
} from "@/components/assistant-v2/scope-rate-onboarding-dialog";
import type { WorkAreaRateSourceLine } from "@/lib/cost-engine/estimate-trace";
import { isBenchmarkRateSource } from "@/lib/cost-engine/rates/get-base-rate-for-scope";

interface AssistantV2LiveEstimatePanelProps {
  projectId: string;
  quickEstimate: QuickEstimate | null;
  estimateQualityTier: EstimateQualityTier;
  qualityFactors: EstimateQualityFactor[];
  missingInformation: string[];
  lastEstimateChange: EstimateChangeEvent | null;
  costBreakdown: CostBreakdown | null;
  confidenceScore: number;
  finishLevel?: string;
  estimateIncludes?: string[];
  estimateExcludes?: string[];
  constraintsIncluded?: string[];
  allowancesIncluded?: string[];
  rateSourceLines?: WorkAreaRateSourceLine[];
  rateSourceDetail?: string | null;
  benchmarkScopesForOnboarding?: BenchmarkScopeForOnboarding[];
  compact?: boolean;
  onEstimateSync?: (payload: AssistantSyncPayload) => void;
}

function tierStyles(tier: EstimateQualityTier): string {
  switch (tier) {
    case "READY":
      return "bg-primary/10 text-primary";
    case "GOOD":
      return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400";
    case "FAIR":
      return "bg-amber-500/10 text-amber-700 dark:text-amber-400";
    case "LOW":
    default:
      return "bg-muted text-muted-foreground";
  }
}

function formatCurrencyCompact(value: number): string {
  return value.toLocaleString("en-NZ", {
    style: "currency",
    currency: "NZD",
    maximumFractionDigits: 0,
  });
}

function isValidEstimateChange(event: EstimateChangeEvent): boolean {
  return (
    typeof event.previousLow === "number" &&
    typeof event.previousHigh === "number" &&
    typeof event.newLow === "number" &&
    typeof event.newHigh === "number"
  );
}

function formatEstimateChange(event: EstimateChangeEvent): {
  title: string;
  detail: string;
  deltaLabel: string | null;
  trend: "up" | "down" | "neutral";
} {
  const from = formatCurrencyRange(event.previousLow, event.previousHigh);
  const to = formatCurrencyRange(event.newLow, event.newHigh);
  const prevMid = (event.previousLow + event.previousHigh) / 2;
  const newMid = (event.newLow + event.newHigh) / 2;
  const midDelta = Math.round(newMid - prevMid);

  const title =
    event.kind === "narrowed"
      ? "Estimate narrowed"
      : event.kind === "widened"
        ? "Estimate widened"
        : event.kind === "increased"
          ? "Estimate increased"
          : event.kind === "decreased"
            ? "Estimate decreased"
            : "Latest estimate change";

  const trend =
    event.kind === "increased" || midDelta > 0
      ? "up"
      : event.kind === "decreased" || midDelta < 0
        ? "down"
        : "neutral";

  const deltaLabel =
    midDelta !== 0
      ? `${midDelta > 0 ? "+" : ""}${formatCurrencyCompact(midDelta)}`
      : null;

  return {
    title,
    detail: `${from} → ${to}`,
    deltaLabel,
    trend,
  };
}

export function AssistantV2LiveEstimatePanel({
  projectId,
  quickEstimate,
  estimateQualityTier,
  qualityFactors,
  missingInformation,
  lastEstimateChange,
  costBreakdown,
  confidenceScore,
  finishLevel,
  estimateIncludes = [],
  estimateExcludes = [],
  constraintsIncluded = [],
  allowancesIncluded = [],
  rateSourceLines = [],
  rateSourceDetail,
  benchmarkScopesForOnboarding = [],
  compact = false,
  onEstimateSync,
}: AssistantV2LiveEstimatePanelProps) {
  const { status, lastUpdatedAt } = useEstimateUpdate();
  const [breakdownOpen, setBreakdownOpen] = useState(false);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [onboardingScope, setOnboardingScope] =
    useState<BenchmarkScopeForOnboarding | null>(null);

  const hasResults =
    quickEstimate != null &&
    quickEstimate.estimated_cost_low != null &&
    quickEstimate.estimated_cost_high != null;

  if (!quickEstimate || !hasResults) {
    return (
      <div className="rounded-xl border bg-card p-5 shadow-sm">
        <p className="text-sm font-semibold">Draft Quick Estimate</p>
        <p className="mt-3 text-sm font-medium text-foreground">
          No estimate yet.
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Tell Quotr about the job to generate a draft estimate.
        </p>
        {status === "updating" && (
          <p className="mt-2 text-xs text-muted-foreground">Updating…</p>
        )}
      </div>
    );
  }

  const statusLabel =
    status === "saving"
      ? "Saving…"
      : status === "updating"
        ? "Updating…"
        : status === "saved"
          ? `Updated ${formatLastUpdated(lastUpdatedAt) ?? "just now"}`
          : null;

  const includesList = [
    ...estimateIncludes,
    ...constraintsIncluded,
    ...allowancesIncluded,
  ].filter(Boolean);
  const excludesList = estimateExcludes.filter(Boolean);

  const metFactors = qualityFactors.filter((f) => f.met);
  const changeDisplay =
    lastEstimateChange && isValidEstimateChange(lastEstimateChange)
      ? formatEstimateChange(lastEstimateChange)
      : null;

  const usesBenchmarkRates =
    rateSourceLines.some((line) => isBenchmarkRateSource(line.rateSource)) ||
    benchmarkScopesForOnboarding.length > 0;

  const primaryOnboardingScope = benchmarkScopesForOnboarding[0] ?? null;

  function openOnboarding(scope?: BenchmarkScopeForOnboarding) {
    const target = scope ?? primaryOnboardingScope;
    if (!target) return;
    setOnboardingScope(target);
    setOnboardingOpen(true);
  }

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
              "rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide",
              tierStyles(estimateQualityTier)
            )}
          >
            {estimateQualityTier}
          </span>
          {(status === "updating" || status === "saving") && (
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <span className="inline-flex gap-0.5">
                <span className="h-1 w-1 animate-bounce rounded-full bg-muted-foreground [animation-delay:0ms]" />
                <span className="h-1 w-1 animate-bounce rounded-full bg-muted-foreground [animation-delay:150ms]" />
                <span className="h-1 w-1 animate-bounce rounded-full bg-muted-foreground [animation-delay:300ms]" />
              </span>
              {status === "saving" ? "Saving" : "Updating estimate"}
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {describeEstimateQualityTier(estimateQualityTier)}
          {statusLabel ? ` · ${statusLabel}` : ""}
        </p>
        {finishLevel && (
          <p className="text-xs text-muted-foreground">
            Finish level:{" "}
            <span className="font-medium text-foreground">{finishLevel}</span>
          </p>
        )}
      </div>

      <div className={cn("space-y-4", compact ? "mt-3" : "mt-4")}>
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Estimate Range
            </p>
            <p
              className={cn(
                "font-semibold tracking-tight",
                compact ? "text-xl" : "text-2xl",
                (status === "updating" || status === "saving") && "opacity-70"
              )}
            >
              {formatCurrencyRange(
                Number(quickEstimate.estimated_cost_low),
                Number(quickEstimate.estimated_cost_high)
              )}
            </p>
          </div>

          {!compact && quickEstimate.recommended_sell_low != null && (
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Recommended Sell
              </p>
              <p
                className={cn(
                  "text-xl font-semibold tracking-tight",
                  (status === "updating" || status === "saving") && "opacity-70"
                )}
              >
                {formatCurrencyRange(
                  Number(quickEstimate.recommended_sell_low),
                  Number(quickEstimate.recommended_sell_high)
                )}
              </p>
            </div>
          )}

          {!compact && (
            <AssistantV2MarginEditor
              projectId={projectId}
              defaultMargin={Number(quickEstimate.target_margin_percent ?? 5)}
              onEstimateSync={onEstimateSync}
            />
          )}

          {!compact && (rateSourceLines.length > 0 || rateSourceDetail) && (
            <div className="rounded-lg border bg-muted/20 px-3 py-2 text-xs">
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Rate source
              </p>
              {rateSourceLines.length > 1 ? (
                <ul className="mt-1.5 space-y-0.5">
                  {rateSourceLines.map((line) => (
                    <li key={line.workAreaName} className="text-foreground">
                      <span className="font-medium">{line.label}:</span>{" "}
                      {line.rateSourceLabel}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 font-medium text-foreground">
                  {rateSourceLines[0]?.rateSourceLabel ?? rateSourceDetail}
                </p>
              )}
              {usesBenchmarkRates && (
                <div className="mt-2 space-y-2 border-t border-border/60 pt-2">
                  <p className="text-muted-foreground">
                    This estimate uses Quotr benchmark rates.
                  </p>
                  {primaryOnboardingScope ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      className="h-7 text-xs"
                      onClick={() => openOnboarding()}
                    >
                      Add my rate
                    </Button>
                  ) : (
                    <p className="text-muted-foreground">
                      Add your own rates to improve accuracy.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {changeDisplay && (
            <div className="rounded-lg border bg-muted/30 px-3 py-2">
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Latest estimate change
              </p>
              <p className="mt-1 flex items-center gap-1.5 text-xs font-medium">
                {changeDisplay.trend === "up" ? (
                  <TrendingUp className="h-3.5 w-3.5 text-primary" />
                ) : changeDisplay.trend === "down" ? (
                  <TrendingDown className="h-3.5 w-3.5 text-primary" />
                ) : null}
                {changeDisplay.title}
                {changeDisplay.deltaLabel && (
                  <span className="text-primary">{changeDisplay.deltaLabel}</span>
                )}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {changeDisplay.detail}
              </p>
              {lastEstimateChange?.reason && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Reason: {lastEstimateChange.reason}
                </p>
              )}
            </div>
          )}

          {(includesList.length > 0 || excludesList.length > 0) && !compact && (
            <div className="rounded-lg border bg-muted/20 px-3 py-2 text-xs">
              {includesList.length > 0 && (
                <div>
                  <p className="font-medium text-foreground">Estimate includes</p>
                  <ul className="mt-1 space-y-0.5 text-muted-foreground">
                    {includesList.slice(0, 6).map((item) => (
                      <li key={item}>• {item}</li>
                    ))}
                  </ul>
                </div>
              )}
              {excludesList.length > 0 && (
                <div className={includesList.length > 0 ? "mt-2" : ""}>
                  <p className="font-medium text-foreground">
                    Not included
                  </p>
                  <ul className="mt-1 space-y-0.5 text-muted-foreground">
                    {excludesList.slice(0, 4).map((item) => (
                      <li key={item}>• {item}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {costBreakdown &&
            (costBreakdown.byWorkArea?.length ?? 0) > 0 &&
            !compact && (
            <div className="border-t pt-3">
              <button
                type="button"
                onClick={() => setBreakdownOpen((open) => !open)}
                className="flex w-full items-center justify-between text-left"
              >
                <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Show breakdown
                </span>
                <ChevronDown
                  className={cn(
                    "h-4 w-4 text-muted-foreground transition-transform",
                    breakdownOpen && "rotate-180"
                  )}
                />
              </button>
              {breakdownOpen && (
                <div className="mt-3 space-y-3 text-xs">
                  <div>
                    <p className="font-medium text-foreground">By work area</p>
                    <ul className="mt-1.5 space-y-1">
                      {(costBreakdown.byWorkArea ?? []).map((area) => (
                        <li
                          key={area.name}
                          className="flex items-center justify-between gap-2"
                        >
                          <span className="text-muted-foreground">{area.name}</span>
                          <span className="font-medium">
                            {formatCurrencyCompact(area.total)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="font-medium text-foreground">Cost allocation</p>
                    <ul className="mt-1.5 space-y-1">
                      <li className="flex justify-between gap-2">
                        <span className="text-muted-foreground">Labour</span>
                        <span>{formatCurrencyCompact(costBreakdown.labour)}</span>
                      </li>
                      <li className="flex justify-between gap-2">
                        <span className="text-muted-foreground">Materials</span>
                        <span>{formatCurrencyCompact(costBreakdown.materials)}</span>
                      </li>
                      <li className="flex justify-between gap-2">
                        <span className="text-muted-foreground">
                          Subcontractors / trades
                        </span>
                        <span>
                          {formatCurrencyCompact(costBreakdown.subcontractors)}
                        </span>
                      </li>
                      <li className="flex justify-between gap-2">
                        <span className="text-muted-foreground">Allowances</span>
                        <span>
                          {formatCurrencyCompact(costBreakdown.allowances)}
                        </span>
                      </li>
                      <li className="flex justify-between gap-2">
                        <span className="text-muted-foreground">Contingency</span>
                        <span>
                          {formatCurrencyCompact(costBreakdown.contingency)}
                        </span>
                      </li>
                    </ul>
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    Indicative allocation only — not a detailed quote.
                  </p>
                </div>
              )}
            </div>
          )}

          <div className="border-t pt-3">
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Estimate Quality
            </p>
            {estimateQualityTier === "READY" ? (
              <p className="mt-1 text-xs text-foreground">
                Ready because:
              </p>
            ) : (
              <p className="mt-1 text-xs text-muted-foreground">
                {estimateQualityTier === "GOOD"
                  ? "Good because:"
                  : "Building toward a quote-ready estimate:"}
              </p>
            )}
            <ul className="mt-1.5 space-y-0.5">
              {metFactors.map((factor) => (
                <li
                  key={factor.label}
                  className="flex items-start gap-1.5 text-xs"
                >
                  <Check className="mt-0.5 h-3 w-3 shrink-0 text-primary" />
                  <span>{factor.label.toLowerCase()}</span>
                </li>
              ))}
            </ul>
            {missingInformation.length > 0 && (
              <>
                <p className="mt-2 text-xs text-muted-foreground">Missing:</p>
                <ul className="mt-1 space-y-0.5">
                  {missingInformation.slice(0, 4).map((item) => (
                    <li
                      key={item}
                      className="flex items-start gap-1.5 text-xs text-muted-foreground"
                    >
                      <X className="mt-0.5 h-3 w-3 shrink-0" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
            <p className="sr-only">Internal confidence score: {confidenceScore}%</p>
          </div>

          {!compact && (
            <div className="border-t pt-3">
              <ExportScopeButton projectId={projectId} />
            </div>
          )}

          {!compact && <AssistantV2NextSteps estimateReady={hasResults} />}
        </div>

      <ScopeRateOnboardingDialog
        projectId={projectId}
        scope={onboardingScope}
        open={onboardingOpen}
        onOpenChange={setOnboardingOpen}
      />
    </div>
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
