"use client";

import { useCallback, useState, useTransition, useEffect, useMemo } from "react";
import { Check, ChevronDown, TrendingDown, TrendingUp, X } from "lucide-react";
import { EstimateRetryButton } from "@/components/projects/estimate-retry-button";
import {
  exportScopeSummary,
  syncAssistantEstimateOnly,
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
import { resolveEstimatePanelState } from "@/lib/cost-engine/resolve-estimate-panel-state";
import { parseQuickEstimateSummary } from "@/lib/project-assistant-summary";
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
import { EstimateInsightDrawer } from "@/components/assistant-v2/estimate-insight-drawer";
import type { CurrentMissingItem } from "@/lib/assistant-v2/missing/get-current-missing-items";
import {
  buildMissingItemPrompt,
  type MissingItemPrompt,
} from "@/lib/assistant-v2/missing/build-missing-item-prompt";
import type { QualityLevel } from "@/lib/constants/quality-level";
import { QUALITY_LEVEL_OPTIONS } from "@/lib/constants/quality-level";
import { resolveWideRangeAction } from "@/lib/assistant-v2/build-wide-range-action";
import { TRUST_COPY } from "@/lib/assistant-v2/trust-messages";
import { TRACE_STORAGE_WARNING } from "@/lib/cost-engine/estimate-result";

interface AssistantV2LiveEstimatePanelProps {
  projectId: string;
  projectTitle?: string;
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
  workAreaContexts?: import("@/lib/cost-engine/build-estimate-insight").WorkAreaInsightContext[];
  rateSourceLines?: WorkAreaRateSourceLine[];
  rateSourceDetail?: string | null;
  stagedRatePrompt?: string | null;
  breakdownOpenRequest?: number;
  benchmarkScopesForOnboarding?: BenchmarkScopeForOnboarding[];
  compact?: boolean;
  onEstimateSync?: (payload: AssistantSyncPayload, syncVersion?: number) => void;
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
  onPrefillComposer?: (text: string) => void;
  flowPanelAction?: import("@/lib/assistant-v2/flow/resolve-flow-panel-action").FlowPanelAction | null;
  onFlowPanelAction?: () => void;
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
  projectTitle = "Project",
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
  workAreaContexts = [],
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
  onPrefillComposer,
  flowPanelAction,
  onFlowPanelAction,
}: AssistantV2LiveEstimatePanelProps) {
  const { status, lastUpdatedAt, setPendingAction, isActionPending, beginSync, isSyncCurrent } =
    useEstimateUpdate();
  const [breakdownOpen, setBreakdownOpen] = useState(false);
  const [insightOpen, setInsightOpen] = useState(false);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [insightReady, setInsightReady] = useState(false);

  useEffect(() => {
    if (breakdownOpenRequest > 0) {
      setBreakdownOpen(true);
    }
  }, [breakdownOpenRequest]);

  useEffect(() => {
    if (!insightOpen) {
      setInsightReady(false);
      return;
    }
    setPendingAction("opening_insight");
    const timer = window.setTimeout(() => {
      setInsightReady(true);
      setPendingAction(null);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [insightOpen, setPendingAction]);
  const [onboardingScope, setOnboardingScope] =
    useState<BenchmarkScopeForOnboarding | null>(null);

  const summary = useMemo(
    () => parseQuickEstimateSummary(quickEstimate?.notes ?? null),
    [quickEstimate?.notes]
  );

  const panelState = useMemo(
    () => resolveEstimatePanelState(quickEstimate, summary),
    [quickEstimate, summary]
  );

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

  const usesBenchmarkRates =
    rateSourceLines.some((line) => isBenchmarkRateSource(line.rateSource)) ||
    benchmarkScopesForOnboarding.length > 0;

  const isQualityUnknown = qualityLevelRaw === "unknown";
  const isRangeTooWide =
    rangeWidthPercent != null && rangeWidthPercent > 35;

  const primaryOnboardingScope = benchmarkScopesForOnboarding[0] ?? null;

  const criticalMissingItems = useMemo(
    () =>
      actionableMissingItems.filter(
        (item) =>
          item.status === "missing" &&
          (item.importance === "critical" || item.importance === "useful")
      ),
    [actionableMissingItems]
  );

  const wideRangeAction = useMemo(() => {
    if (!isRangeTooWide) return null;
    return resolveWideRangeAction({
      isQualityUnknown,
      criticalMissing: criticalMissingItems,
      actionableMissingItems,
      usesBenchmarkRates,
      primaryOnboardingScope,
    });
  }, [
    isRangeTooWide,
    isQualityUnknown,
    criticalMissingItems,
    actionableMissingItems,
    usesBenchmarkRates,
    primaryOnboardingScope,
  ]);

  const handleRetrySuccess = useCallback(async () => {
    if (!onEstimateSync) return;
    const syncVersion = beginSync();
    const sync = await syncAssistantEstimateOnly(projectId);
    if (sync.data && isSyncCurrent(syncVersion)) {
      onEstimateSync(sync.data, syncVersion);
    }
  }, [projectId, onEstimateSync, beginSync, isSyncCurrent]);

  if (!quickEstimate || !hasResults) {
    if (panelState?.kind === "failed") {
      return (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-5 shadow-sm">
          <p className="text-sm font-semibold">Draft Quick Estimate</p>
          <p className="mt-3 text-sm font-medium text-foreground">
            {panelState.title}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">{panelState.reason}</p>
          {panelState.canRetry && (
            <div className="mt-4 flex flex-wrap gap-2">
              {flowPanelAction?.kind === "retry_estimate" ? (
                <EstimateRetryButton
                  projectId={projectId}
                  onSuccess={handleRetrySuccess}
                  compact={compact}
                  label={flowPanelAction.label}
                />
              ) : (
                <EstimateRetryButton
                  projectId={projectId}
                  onSuccess={handleRetrySuccess}
                  compact={compact}
                />
              )}
              {flowPanelAction?.kind === "scroll_chat" && (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="h-8 max-w-full text-xs"
                  onClick={onFlowPanelAction}
                >
                  {flowPanelAction.label}
                </Button>
              )}
            </div>
          )}
          {(status === "updating" || status === "saving") && (
            <p className="mt-2 text-xs text-muted-foreground">
              Recalculating estimate…
            </p>
          )}
        </div>
      );
    }

    return (
      <div className="rounded-xl border bg-card p-5 shadow-sm">
        <p className="text-sm font-semibold">Draft Quick Estimate</p>
        <p className="mt-3 text-sm font-medium text-foreground">
          {panelState?.kind === "empty"
            ? panelState.title
            : "No estimate yet."}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {panelState?.kind === "empty"
            ? panelState.detail
            : "Tell Quotr about the job to generate a draft estimate."}
        </p>
        {panelState?.canRetry && (
          <div className="mt-4 flex flex-wrap gap-2">
            <EstimateRetryButton
              projectId={projectId}
              onSuccess={handleRetrySuccess}
              compact={compact}
              label={
                flowPanelAction?.kind === "retry_estimate"
                  ? flowPanelAction.label
                  : undefined
              }
            />
            {flowPanelAction?.kind === "scroll_chat" && (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="h-8 max-w-full text-xs"
                onClick={onFlowPanelAction}
              >
                {flowPanelAction.label}
              </Button>
            )}
          </div>
        )}
        {!panelState?.canRetry && flowPanelAction?.kind === "scroll_chat" && (
          <div className="mt-4">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="h-8 max-w-full text-xs"
              onClick={onFlowPanelAction}
            >
              {flowPanelAction.label}
            </Button>
          </div>
        )}
        {(status === "updating" || status === "saving") && (
          <p className="mt-2 text-xs text-muted-foreground">
            Recalculating estimate…
          </p>
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

  const rateSourceBanner = resolveRateSourceBanner(rateSourceLines);

  function openOnboarding(scope?: BenchmarkScopeForOnboarding) {
    const target = scope ?? primaryOnboardingScope;
    if (!target) return;
    setOnboardingScope(target);
    setOnboardingOpen(true);
  }

  function handleWideRangeAction() {
    if (!wideRangeAction) return;
    switch (wideRangeAction.kind) {
      case "finish_level":
        document
          .getElementById("assistant-live-estimate-panel")
          ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
        break;
      case "missing_item": {
        const typeKey = wideRangeAction.item.scopeId
          ? workAreaTypeKeys[wideRangeAction.item.scopeId]
          : undefined;
        if (typeKey) {
          const prompt = buildMissingItemPrompt(wideRangeAction.item, typeKey);
          if (prompt) {
            onMissingItemClick?.(wideRangeAction.item, prompt);
          }
        }
        break;
      }
      case "add_rate":
        openOnboarding(wideRangeAction.scope);
        break;
      case "composer":
        onPrefillComposer?.(wideRangeAction.prefill);
        break;
    }
  }

  const traceWarning =
    panelState &&
    (panelState.kind === "ready" || panelState.kind === "partial")
      ? panelState.warning
      : undefined;
  const traceUnavailable =
    traceWarning === TRUST_COPY.tracePending ||
    traceWarning === TRACE_STORAGE_WARNING;

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

      {panelState?.kind === "partial" && (
        <div className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs">
          <p className="font-medium text-amber-800 dark:text-amber-300">
            {panelState.title}
          </p>
          {panelState.unpricedAreas.length > 0 ? (
            <ul className="mt-1 space-y-0.5 text-muted-foreground">
              {panelState.unpricedAreas.map((area) => (
                <li key={area}>{area}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-muted-foreground">
              Some work areas are not included in this estimate yet.
            </p>
          )}
        </div>
      )}

      {(panelState?.kind === "ready" || panelState?.kind === "partial") &&
        panelState.warning && (
          <div className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
            <p>{panelState.warning}</p>
            {traceUnavailable && panelState.canRetry && (
              <div className="mt-2">
                <EstimateRetryButton
                  projectId={projectId}
                  onSuccess={handleRetrySuccess}
                  compact
                  label="Retry breakdown"
                />
              </div>
            )}
          </div>
        )}

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
            {rateSourceBanner.message.replace(/\.$/, "")}
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

      {isRangeTooWide && wideRangeAction && (
        <div className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs">
          <p className="font-medium text-amber-800 dark:text-amber-300">
            Wide range — one detail would narrow it.
          </p>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="mt-2 h-auto min-h-7 max-w-full whitespace-normal px-3 py-1.5 text-left text-xs leading-snug"
            onClick={handleWideRangeAction}
          >
            {wideRangeAction.label}
          </Button>
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
                      disabled={isActionPending("changing_finish_level")}
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
                  disabled={isActionPending("changing_finish_level")}
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

          {!compact && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full"
              disabled={isActionPending("opening_insight")}
              onClick={() => setInsightOpen(true)}
            >
              {isActionPending("opening_insight")
                ? TRUST_COPY.openingInsight
                : "View estimate detail"}
            </Button>
          )}

          <div className="border-t pt-3">
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Estimate quality
            </p>
            <p className="mt-1 text-xs font-semibold text-foreground">
              {estimateQualityTier}
            </p>
            {estimateQualityTier === "READY" ? (
              <p className="mt-1 text-xs text-foreground">Ready because:</p>
            ) : estimateQualityTier === "GOOD" ? (
              <p className="mt-1 text-xs text-muted-foreground">Good because:</p>
            ) : (
              <p className="mt-1 text-xs text-muted-foreground">
                Building toward a sharper estimate:
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
            {(criticalMissing.length > 0 ||
            missingInformation.length > 0 ||
            actionableMissingItems.length > 0) &&
            !optionalOnlyMissing ? (
              <>
                <p className="mt-2 text-xs text-muted-foreground">
                  Still useful:
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
            ) : optionalOnlyMissing ? (
              <p className="mt-2 text-xs text-muted-foreground">
                Optional details available — none required for a draft estimate.
              </p>
            ) : optionalMissing.length > 0 ? null : (
              <p className="mt-2 text-xs text-muted-foreground">
                No key missing information.
              </p>
            )}
            {optionalMissing.length > 0 && !optionalOnlyMissing && (
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

      {!compact && insightOpen && (
        <EstimateInsightDrawer
          open={insightOpen}
          onOpenChange={setInsightOpen}
          ready={insightReady}
          projectId={projectId}
          projectTitle={projectTitle}
          scopeBreakdownItems={scopeBreakdownItems}
          costBreakdown={costBreakdown}
          structuredBreakdown={estimateTrace?.structuredBreakdown}
          calculationTrace={calculationTrace}
          confidenceScore={confidenceScore}
          costLow={Number(quickEstimate.estimated_cost_low)}
          costHigh={Number(quickEstimate.estimated_cost_high)}
          sellLow={quickEstimate.recommended_sell_low}
          sellHigh={quickEstimate.recommended_sell_high}
          totalAllocations={totalAllocations}
          actionableMissingItems={actionableMissingItems}
          workAreaTypeKeys={workAreaTypeKeys}
          workAreaContexts={workAreaContexts}
          globalAllowances={allowancesIncluded}
          onMissingItemClick={onMissingItemClick}
          buildMissingItemPrompt={buildMissingItemPrompt}
        />
      )}
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
