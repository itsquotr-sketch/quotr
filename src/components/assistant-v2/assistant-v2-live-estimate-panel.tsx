"use client";

import { useState, useTransition, useEffect, useMemo } from "react";
import { Check, ChevronDown, TrendingDown, TrendingUp, X } from "lucide-react";
import {
  exportScopeSummary,
  type AssistantSyncPayload,
} from "@/actions/assistant-v2";
import { AssistantV2MarginEditor } from "@/components/assistant-v2/assistant-v2-margin-editor";
import { AnswerChips } from "@/components/assistant-v2/answer-chips";
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
import {
  buildScopeBreakdown,
  type ScopeBreakdownItem,
} from "@/lib/cost-engine/build-scope-breakdown";
import { buildWhatEstimateCovers } from "@/lib/cost-engine/contractor-estimate-labels";
import type { EstimateChangeEvent } from "@/lib/cost-engine/recalculate-quick-estimate";
import { resolveRateSourceBanner } from "@/lib/cost-engine/resolve-rate-source-banner";
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
import type { EstimateTrace } from "@/lib/cost-engine/estimate-trace";
import type { EstimateTrace as CalculationTrace } from "@/lib/cost-engine/trace/types";
import { isBenchmarkRateSource } from "@/lib/cost-engine/rates/get-base-rate-for-scope";
import { AddMoreDetailButton } from "@/components/assistant-v2/assistant-refinement-trigger";
import { WhyThisEstimateSection } from "@/components/assistant-v2/why-this-estimate-section";
import type { CurrentMissingItem } from "@/lib/assistant-v2/missing/get-current-missing-items";
import {
  buildMissingItemPrompt,
  type MissingItemPrompt,
} from "@/lib/assistant-v2/missing/build-missing-item-prompt";
import type { QualityLevel } from "@/lib/constants/quality-level";
import { QUALITY_LEVEL_OPTIONS } from "@/lib/constants/quality-level";

interface AssistantV2LiveEstimatePanelProps {
  projectId: string;
  quickEstimate: QuickEstimate | null;
  estimateQualityTier: EstimateQualityTier;
  qualityTierDescription?: string;
  qualityFactors: EstimateQualityFactor[];
  missingInformation: string[];
  criticalMissing?: string[];
  optionalMissing?: string[];
  optionalOnlyMissing?: boolean;
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
  stagedRatePrompt?: string | null;
  breakdownOpenRequest?: number;
  benchmarkScopesForOnboarding?: BenchmarkScopeForOnboarding[];
  compact?: boolean;
  onEstimateSync?: (payload: AssistantSyncPayload) => void;
  qualityLevelRaw?: QualityLevel;
  rangeWidthPercent?: number | null;
  estimateTrace?: EstimateTrace | null;
  calculationTrace?: CalculationTrace | null;
  whyOpenRequest?: number;
  actionableMissingItems?: CurrentMissingItem[];
  workAreaTypeKeys?: Record<string, string>;
  onMissingItemClick?: (item: CurrentMissingItem, prompt: MissingItemPrompt) => void;
  onMissingItemAnswer?: (item: CurrentMissingItem, value: string, label: string) => void;
  onQualityLevelSelect?: (level: QualityLevel, label: string) => void;
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
  qualityTierDescription,
  qualityFactors,
  missingInformation,
  criticalMissing = [],
  optionalMissing = [],
  optionalOnlyMissing = false,
  lastEstimateChange,
  costBreakdown,
  confidenceScore,
  finishLevel,
  estimateIncludes = [],
  estimateExcludes = [],
  constraintsIncluded = [],
  allowancesIncluded = [],
  rateSourceLines = [],
  breakdownOpenRequest = 0,
  benchmarkScopesForOnboarding = [],
  compact = false,
  onEstimateSync,
  qualityLevelRaw = "unknown",
  rangeWidthPercent = null,
  estimateTrace = null,
  calculationTrace = null,
  whyOpenRequest = 0,
  actionableMissingItems = [],
  workAreaTypeKeys = {},
  onMissingItemClick,
  onMissingItemAnswer,
  onQualityLevelSelect,
}: AssistantV2LiveEstimatePanelProps) {
  const { status, lastUpdatedAt } = useEstimateUpdate();
  const [breakdownOpen, setBreakdownOpen] = useState(false);
  const [onboardingOpen, setOnboardingOpen] = useState(false);

  useEffect(() => {
    if (breakdownOpenRequest > 0) {
      setBreakdownOpen(true);
    }
  }, [breakdownOpenRequest]);
  const [onboardingScope, setOnboardingScope] =
    useState<BenchmarkScopeForOnboarding | null>(null);

  const hasResults =
    quickEstimate != null &&
    quickEstimate.estimated_cost_low != null &&
    quickEstimate.estimated_cost_high != null;

  const scopeBreakdownItems: ScopeBreakdownItem[] = useMemo(() => {
    if (!quickEstimate) return [];
    return buildScopeBreakdown({
      structuredBreakdown: estimateTrace?.structuredBreakdown,
      workAreaTraces: estimateTrace?.workAreaTraces ?? [],
      rateSourceLines,
      confidenceScore,
      targetMarginPercent: Number(quickEstimate.target_margin_percent ?? 5),
      contingencyPercent: estimateTrace?.contingencyPercent ?? 5,
      costBreakdown: costBreakdown ?? estimateTrace?.costBreakdown ?? null,
      missingItems: actionableMissingItems,
      globalAllowances: allowancesIncluded,
      globalConstraints: constraintsIncluded,
    });
  }, [
    estimateTrace,
    rateSourceLines,
    confidenceScore,
    quickEstimate,
    costBreakdown,
    actionableMissingItems,
    allowancesIncluded,
    constraintsIncluded,
  ]);

  const totalAllocations = useMemo(() => {
    if (costBreakdown) {
      return {
        labour: costBreakdown.labour,
        materials: costBreakdown.materials,
        subcontractors: costBreakdown.subcontractors,
        allowances: costBreakdown.allowances,
        contingency: costBreakdown.contingency,
      };
    }
    const structured = estimateTrace?.structuredBreakdown;
    if (!structured?.scopes.length) return null;
    return structured.scopes.reduce(
      (acc, scope) => ({
        labour: acc.labour + scope.allocations.labour,
        materials: acc.materials + scope.allocations.materials,
        subcontractors: acc.subcontractors + scope.allocations.subcontractors,
        allowances: acc.allowances + scope.allocations.allowances,
        contingency: acc.contingency + scope.allocations.contingency,
      }),
      { labour: 0, materials: 0, subcontractors: 0, allowances: 0, contingency: 0 }
    );
  }, [costBreakdown, estimateTrace?.structuredBreakdown]);

  const whatEstimateCovers = useMemo(
    () =>
      buildWhatEstimateCovers({
        scopeNames: estimateIncludes,
        allowances: allowancesIncluded,
        constraints: constraintsIncluded,
      }),
    [estimateIncludes, allowancesIncluded, constraintsIncluded]
  );

  const expandedExclusions = useMemo(() => {
    const fromScopes = scopeBreakdownItems.flatMap((scope) => scope.exclusions);
    return [...new Set([...estimateExcludes, ...fromScopes])].slice(0, 6);
  }, [scopeBreakdownItems, estimateExcludes]);

  const compactCostSplit = useMemo(() => {
    if (!totalAllocations) return [];
    const rows: { label: string; amount: number }[] = [
      { label: "Labour", amount: totalAllocations.labour },
      { label: "Materials", amount: totalAllocations.materials },
      { label: "Allowances", amount: totalAllocations.allowances },
    ];
    return rows.filter((row) => row.amount > 0);
  }, [totalAllocations]);

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

  const includesList = whatEstimateCovers;

  const metFactors = qualityFactors.filter((f) => f.met);
  const changeDisplay =
    lastEstimateChange && isValidEstimateChange(lastEstimateChange)
      ? formatEstimateChange(lastEstimateChange)
      : null;

  const usesBenchmarkRates =
    rateSourceLines.some((line) => isBenchmarkRateSource(line.rateSource)) ||
    benchmarkScopesForOnboarding.length > 0;

  const rateSourceBanner = resolveRateSourceBanner(rateSourceLines);
  const isQualityUnknown = qualityLevelRaw === "unknown";
  const isRangeTooWide =
    rangeWidthPercent != null && rangeWidthPercent > 40;

  const primaryOnboardingScope = benchmarkScopesForOnboarding[0] ?? null;

  function openOnboarding(scope?: BenchmarkScopeForOnboarding) {
    const target = scope ?? primaryOnboardingScope;
    if (!target) return;
    setOnboardingScope(target);
    setOnboardingOpen(true);
  }

  return (
    <div
      id="assistant-live-estimate-panel"
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
          {qualityTierDescription ??
            describeEstimateQualityTier(estimateQualityTier, {
              optionalOnlyMissing,
            })}
          {statusLabel ? ` · ${statusLabel}` : ""}
        </p>
        {finishLevel && !isQualityUnknown && (
          <p className="text-xs text-muted-foreground">
            Finish level:{" "}
            <span className="font-medium text-foreground">{finishLevel}</span>
          </p>
        )}
      </div>

      {rateSourceBanner && !compact && (
        <div
          className={cn(
            "mt-3 rounded-lg border px-3 py-2 text-xs",
            rateSourceBanner.kind === "all_saved"
              ? "border-primary/30 bg-primary/5"
              : "border-amber-500/40 bg-amber-500/10"
          )}
        >
          <p
            className={cn(
              "font-medium",
              rateSourceBanner.kind === "all_saved"
                ? "text-primary"
                : "text-amber-800 dark:text-amber-300"
            )}
          >
            {rateSourceBanner.message}
          </p>
          {rateSourceBanner.perScopeLines.length > 0 && (
            <ul className="mt-1.5 space-y-0.5 text-muted-foreground">
              {rateSourceBanner.perScopeLines.map((line) => (
                <li key={line.scopeName}>
                  <span className="font-medium text-foreground">
                    {line.scopeName}:
                  </span>{" "}
                  {line.label}
                </li>
              ))}
            </ul>
          )}
          {usesBenchmarkRates && primaryOnboardingScope && (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="mt-2 h-7 text-xs"
              onClick={() => openOnboarding()}
            >
              Add my rate
            </Button>
          )}
        </div>
      )}

      {isRangeTooWide && !compact && (
        <div className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs">
          <p className="font-medium text-amber-800 dark:text-amber-300">
            This range is too wide to quote confidently.
          </p>
          <p className="mt-1 text-muted-foreground">Top actions:</p>
          <ul className="mt-1 space-y-0.5 text-muted-foreground">
            {isQualityUnknown && <li>• Choose finish level</li>}
            {(criticalMissing.length > 0 || missingInformation.length > 0) && (
              <li>• Answer missing dimensions</li>
            )}
            {usesBenchmarkRates && <li>• Add your rates</li>}
            <li>• Confirm materials / client-supplied items</li>
          </ul>
        </div>
      )}

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

          {!compact && !isQualityUnknown && quickEstimate.recommended_sell_low != null && (
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

          {!compact && isQualityUnknown && (
            <div className="rounded-lg border bg-muted/20 px-3 py-2 text-xs">
              <p className="font-medium text-foreground">
                Choose a finish level to see a more useful sell price.
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {QUALITY_LEVEL_OPTIONS.filter((o) => o.value !== "unknown").map(
                  (option) => (
                    <Button
                      key={option.value}
                      type="button"
                      size="sm"
                      variant="secondary"
                      className="h-7 text-xs"
                      onClick={() =>
                        onQualityLevelSelect?.(option.value, option.label)
                      }
                    >
                      {option.label.split(" / ")[0]}
                    </Button>
                  )
                )}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={() =>
                    onQualityLevelSelect?.("unknown", "Not sure")
                  }
                >
                  Not sure
                </Button>
              </div>
            </div>
          )}

          {!compact && (
            <AssistantV2MarginEditor
              projectId={projectId}
              defaultMargin={Number(quickEstimate.target_margin_percent ?? 5)}
              onEstimateSync={onEstimateSync}
            />
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

          {includesList.length > 0 && !compact && (
            <div className="rounded-lg border bg-muted/20 px-3 py-2 text-xs">
              <p className="font-medium text-foreground">
                What this estimate covers
              </p>
              <ul className="mt-1 space-y-0.5 text-muted-foreground">
                {includesList.map((item) => (
                  <li key={item}>• {item}</li>
                ))}
              </ul>
            </div>
          )}

          {!compact && (
            <WhyThisEstimateSection
              calculationTrace={calculationTrace}
              openRequest={whyOpenRequest}
            />
          )}

          {!compact && !breakdownOpen && compactCostSplit.length > 0 && (
            <div className="rounded-lg border bg-muted/10 px-3 py-2 text-xs">
              <p className="font-medium text-foreground">Cost split</p>
              <ul className="mt-1 space-y-0.5">
                {compactCostSplit.map((row) => (
                  <li
                    key={row.label}
                    className="flex justify-between gap-2 text-muted-foreground"
                  >
                    <span>{row.label}</span>
                    <span className="text-foreground">
                      {formatCurrencyCompact(row.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {!compact && (
            <div className="border-t pt-3">
              <button
                type="button"
                onClick={() => setBreakdownOpen((open) => !open)}
                className="flex w-full items-center justify-between text-left"
              >
                <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  {breakdownOpen ? "Hide cost breakdown" : "Show cost breakdown"}
                </span>
                <ChevronDown
                  className={cn(
                    "h-4 w-4 text-muted-foreground transition-transform",
                    breakdownOpen && "rotate-180"
                  )}
                />
              </button>
              {breakdownOpen && (
                <div className="mt-3 space-y-4 text-xs">
                  {scopeBreakdownItems.length === 0 ? (
                    <p className="text-muted-foreground">
                      No breakdown available yet.
                    </p>
                  ) : (
                    <>
                      <div>
                        <p className="font-medium text-foreground">
                          Breakdown by scope
                        </p>
                        <div className="mt-2 space-y-3">
                          {scopeBreakdownItems.map((scope) => (
                            <ScopeBreakdownCard
                              key={scope.scopeName}
                              scope={scope}
                              isQualityUnknown={isQualityUnknown}
                            />
                          ))}
                        </div>
                      </div>

                      {totalAllocations && (
                        <div>
                          <p className="font-medium text-foreground">
                            Cost allocation
                          </p>
                          <ul className="mt-1.5 space-y-1">
                            <li className="flex justify-between gap-2">
                              <span className="text-muted-foreground">Labour</span>
                              <span>
                                {formatCurrencyCompact(totalAllocations.labour)}
                              </span>
                            </li>
                            <li className="flex justify-between gap-2">
                              <span className="text-muted-foreground">
                                Materials
                              </span>
                              <span>
                                {formatCurrencyCompact(totalAllocations.materials)}
                              </span>
                            </li>
                            <li className="flex justify-between gap-2">
                              <span className="text-muted-foreground">
                                Subcontractors
                              </span>
                              <span>
                                {formatCurrencyCompact(
                                  totalAllocations.subcontractors
                                )}
                              </span>
                            </li>
                            <li className="flex justify-between gap-2">
                              <span className="text-muted-foreground">
                                Allowances
                              </span>
                              <span>
                                {formatCurrencyCompact(totalAllocations.allowances)}
                              </span>
                            </li>
                            <li className="flex justify-between gap-2">
                              <span className="text-muted-foreground">
                                Contingency
                              </span>
                              <span>
                                {formatCurrencyCompact(totalAllocations.contingency)}
                              </span>
                            </li>
                          </ul>
                          <p className="mt-2 text-[10px] text-muted-foreground">
                            Indicative only — not a detailed quote.
                          </p>
                        </div>
                      )}

                      {expandedExclusions.length > 0 && (
                        <div>
                          <p className="font-medium text-foreground">
                            Not included
                          </p>
                          <ul className="mt-1 space-y-0.5 text-muted-foreground">
                            {expandedExclusions.map((item) => (
                              <li key={item}>• {item}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </>
                  )}
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
            {criticalMissing.length > 0 ||
            missingInformation.length > 0 ||
            actionableMissingItems.length > 0 ? (
              <>
                <p className="mt-2 text-xs text-muted-foreground">
                  Missing information:
                </p>
                <ul className="mt-1 space-y-1">
                  {(actionableMissingItems.length > 0
                    ? actionableMissingItems.filter(
                        (item) =>
                          item.status === "missing" &&
                          (item.importance === "critical" ||
                            item.importance === "useful")
                      )
                    : (criticalMissing.length > 0
                        ? criticalMissing
                        : missingInformation
                      ).map((label) => ({ label, factKey: label, scopeLabel: "", status: "missing" as const, importance: "critical" as const, affectsEstimate: true }))
                  )
                    .slice(0, 6)
                    .map((item) => {
                      const missingItem =
                        "factKey" in item && item.factKey !== item.label
                          ? (item as CurrentMissingItem)
                          : null;
                      const label =
                        missingItem?.label ??
                        (typeof item === "string" ? item : item.label);
                      const typeKey = missingItem?.scopeId
                        ? workAreaTypeKeys[missingItem.scopeId]
                        : undefined;
                      const prompt =
                        missingItem && typeKey
                          ? buildMissingItemPrompt(missingItem, typeKey)
                          : null;

                      return (
                        <li key={label} className="text-xs">
                          <button
                            type="button"
                            className="flex w-full items-start gap-1.5 rounded-md px-1 py-0.5 text-left text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                            onClick={() => {
                              if (missingItem && prompt) {
                                onMissingItemClick?.(missingItem, prompt);
                              }
                            }}
                          >
                            <X className="mt-0.5 h-3 w-3 shrink-0" />
                            <span>{label}</span>
                          </button>
                          {prompt &&
                            prompt.options.length > 0 &&
                            missingItem && (
                              <div className="ml-4 mt-1">
                                <AnswerChips
                                  options={prompt.options}
                                  onSelect={(value) => {
                                    const option = prompt.options.find(
                                      (o) => o.value === value
                                    );
                                    onMissingItemAnswer?.(
                                      missingItem,
                                      value,
                                      option?.label ?? value
                                    );
                                  }}
                                />
                              </div>
                            )}
                        </li>
                      );
                    })}
                </ul>
              </>
            ) : optionalMissing.length > 0 ? null : (
              <p className="mt-2 text-xs text-muted-foreground">
                No key missing information.
              </p>
            )}
            {optionalMissing.length > 0 && (
              <>
                <p className="mt-2 text-xs text-muted-foreground">
                  Optional details:
                </p>
                <ul className="mt-1 space-y-0.5">
                  {optionalMissing.slice(0, 6).map((item) => (
                    <li
                      key={item}
                      className="flex items-start gap-1.5 text-xs text-muted-foreground"
                    >
                      <X className="mt-0.5 h-3 w-3 shrink-0 opacity-50" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {(optionalMissing.length > 0 ||
              optionalOnlyMissing ||
              estimateQualityTier === "READY") && (
              <div className="mt-3">
                <AddMoreDetailButton projectId={projectId} />
              </div>
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

function ScopeBreakdownCard({
  scope,
  isQualityUnknown,
}: {
  scope: ScopeBreakdownItem;
  isQualityUnknown: boolean;
}) {
  return (
    <div className="rounded-lg border bg-muted/20 px-3 py-2">
      <p className="font-medium text-foreground">{scope.scopeName}</p>
      {scope.costLow > 0 || scope.costHigh > 0 ? (
        <p className="mt-1 text-muted-foreground">
          Cost:{" "}
          <span className="font-medium text-foreground">
            {formatCurrencyRange(scope.costLow, scope.costHigh)}
          </span>
        </p>
      ) : null}
      {!isQualityUnknown && (scope.sellLow > 0 || scope.sellHigh > 0) && (
        <p className="mt-0.5 text-muted-foreground">
          Sell:{" "}
          <span className="font-medium text-foreground">
            {formatCurrencyRange(scope.sellLow, scope.sellHigh)}
          </span>
        </p>
      )}
      {scope.quantityLabel && (
        <p className="mt-0.5 text-muted-foreground">
          Quantity:{" "}
          <span className="text-foreground">{scope.quantityLabel}</span>
        </p>
      )}
      <p className="mt-0.5 text-muted-foreground">
        Rate source:{" "}
        <span className="text-foreground">{scope.rateSourceLabel}</span>
      </p>

      {scope.costDrivers.length > 0 && (
        <div className="mt-2">
          <p className="font-medium text-foreground">Key cost drivers</p>
          <ul className="mt-1 space-y-0.5 text-muted-foreground">
            {scope.costDrivers.map((driver) => (
              <li key={driver}>• {driver}</li>
            ))}
          </ul>
        </div>
      )}

      {scope.missing.length > 0 && (
        <div className="mt-2">
          <p className="font-medium text-foreground">Missing / not confirmed</p>
          <ul className="mt-1 space-y-0.5 text-muted-foreground">
            {scope.missing.map((item) => (
              <li key={item}>• {item}</li>
            ))}
          </ul>
        </div>
      )}

      {scope.assumptions.length > 0 && (
        <div className="mt-2">
          <p className="font-medium text-foreground">Assumptions</p>
          <ul className="mt-1 space-y-0.5 text-muted-foreground">
            {scope.assumptions.map((item) => (
              <li key={item}>• {item}</li>
            ))}
          </ul>
        </div>
      )}
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
