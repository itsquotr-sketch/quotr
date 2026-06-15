"use client";

import { useMemo, useState, useTransition } from "react";
import { Check, ChevronDown } from "lucide-react";
import { exportEstimateSummary } from "@/actions/assistant-v2";
import {
  buildEstimateInsight,
  type ComponentGroup,
  type CostAllocationRow,
  type CostDriverInsight,
  type EstimateInsightData,
  type WorkAreaInsightContext,
} from "@/lib/cost-engine/build-estimate-insight";
import type { ScopeBreakdownItem } from "@/lib/cost-engine/build-scope-breakdown";
import type { CostBreakdown } from "@/lib/cost-engine/build-cost-breakdown";
import type { StructuredEstimateBreakdown } from "@/lib/cost-engine/build-structured-estimate-breakdown";
import type { EstimateTrace as CalculationTrace } from "@/lib/cost-engine/trace/types";
import type { CurrentMissingItem } from "@/lib/assistant-v2/missing/get-current-missing-items";
import type { MissingItemPrompt } from "@/lib/assistant-v2/missing/build-missing-item-prompt";
import {
  evaluateConfidence,
  type ConfidenceEvaluationResult,
} from "@/lib/assistant-v2/confidence/evaluate-confidence";
import { formatCurrencyRange } from "@/lib/format-currency";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { TRUST_COPY } from "@/lib/assistant-v2/trust-messages";
import { toast } from "sonner";

type EstimateInsightDrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ready?: boolean;
  projectId: string;
  projectTitle?: string;
  scopeBreakdownItems: ScopeBreakdownItem[];
  costBreakdown?: CostBreakdown | null;
  structuredBreakdown?: StructuredEstimateBreakdown;
  calculationTrace?: CalculationTrace | null;
  confidenceScore: number;
  costLow: number;
  costHigh: number;
  sellLow?: number | null;
  sellHigh?: number | null;
  totalAllocations?: {
    labour: number;
    materials: number;
    subcontractors: number;
    allowances: number;
    contingency: number;
  } | null;
  actionableMissingItems?: CurrentMissingItem[];
  workAreaTypeKeys?: Record<string, string>;
  workAreaContexts?: WorkAreaInsightContext[];
  globalAllowances?: string[];
  confidenceEvaluation?: ConfidenceEvaluationResult | null;
  onMissingItemClick?: (
    item: CurrentMissingItem,
    prompt: MissingItemPrompt
  ) => void;
  buildMissingItemPrompt?: (
    item: CurrentMissingItem,
    typeKey: string
  ) => MissingItemPrompt | null;
};

function formatCurrencyCompact(value: number): string {
  return value.toLocaleString("en-NZ", {
    style: "currency",
    currency: "NZD",
    maximumFractionDigits: 0,
  });
}

export function EstimateInsightDrawer({
  open,
  onOpenChange,
  ready = true,
  projectId,
  projectTitle = "Project",
  scopeBreakdownItems,
  costBreakdown,
  structuredBreakdown,
  calculationTrace,
  confidenceScore,
  costLow,
  costHigh,
  sellLow,
  sellHigh,
  totalAllocations,
  actionableMissingItems = [],
  workAreaTypeKeys = {},
  workAreaContexts = [],
  globalAllowances = [],
  confidenceEvaluation: confidenceEvaluationProp = null,
  onMissingItemClick,
  buildMissingItemPrompt: buildPrompt,
}: EstimateInsightDrawerProps) {
  const confidenceEvaluation = useMemo(() => {
    if (confidenceEvaluationProp) return confidenceEvaluationProp;
    if (workAreaContexts.length === 0) return null;
    return evaluateConfidence({
      workAreas: workAreaContexts.map((context) => ({
        scopeId: context.scopeName,
        scopeName: context.scopeName,
        workAreaTypeKey: context.workAreaTypeKey,
        answers: context.answers ?? {},
        included: true,
      })),
      qualityLevel: "unknown",
      siteConstraintsAssessed: false,
    });
  }, [confidenceEvaluationProp, workAreaContexts]);

  const insight = useMemo(() => {
    if (!open || !ready) return null;
    return buildEstimateInsight({
      scopeBreakdownItems,
      costBreakdown,
      structuredBreakdown,
      calculationTrace,
      confidenceScore,
      costLow,
      costHigh,
      sellLow,
      sellHigh,
      actionableMissingItems,
      totalAllocations,
      workAreaContexts,
      globalAllowances,
      confidenceEvaluation,
    });
  }, [
    open,
    ready,
    scopeBreakdownItems,
    costBreakdown,
    structuredBreakdown,
    calculationTrace,
    confidenceScore,
    costLow,
    costHigh,
    sellLow,
    sellHigh,
    actionableMissingItems,
    totalAllocations,
    workAreaContexts,
    globalAllowances,
    confidenceEvaluation,
  ]);

  if (!open) {
    return null;
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full gap-0 overflow-y-auto p-0 sm:max-w-xl max-sm:h-[100dvh] max-sm:max-w-full"
      >
        <SheetHeader className="border-b px-5 py-4 text-left">
          <SheetTitle className="normal-case tracking-normal">
            Estimate insight
          </SheetTitle>
          <SheetDescription>
            Why this estimate is priced this way — internal review only.
          </SheetDescription>
        </SheetHeader>

        {!ready || !insight ? (
          <div className="px-5 py-8 text-sm text-muted-foreground">
            {TRUST_COPY.updatingEstimate}
          </div>
        ) : (
          <div className="space-y-6 px-5 py-5">
            <InsightHeader insight={insight} />
            <ConfidenceSection insight={insight} />
            <CostAllocationSection rows={insight.costAllocation} />
            <ComponentBreakdownSection groups={insight.componentGroups} />
            <CostDriversSection drivers={insight.costDrivers} />
            <AssumptionsSection assumptions={insight.assumptions} />
            <MissingDetailsSection
              groups={insight.missingDetailGroups}
              workAreaTypeKeys={workAreaTypeKeys}
              onMissingItemClick={onMissingItemClick}
              buildPrompt={buildPrompt}
              onClose={() => onOpenChange(false)}
            />
            <ExportSection projectId={projectId} projectTitle={projectTitle} />
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function ConfidenceSection({ insight }: { insight: EstimateInsightData }) {
  if (!insight.confidenceTier) return null;

  return (
    <section className="space-y-2 rounded-lg border bg-muted/30 p-3">
      <p className="text-sm font-medium text-foreground">Confidence</p>
      <p className="text-sm font-semibold">{insight.confidenceLabel}</p>
      {(insight.confidenceWhy?.length ?? 0) > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground">Why:</p>
          <ul className="mt-1 space-y-0.5 text-xs text-foreground">
            {insight.confidenceWhy!.map((item) => (
              <li key={item}>• {item.replace(/ known$| confirmed$/i, "")}</li>
            ))}
          </ul>
        </div>
      )}
      {(insight.confidenceImprove?.length ?? 0) > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground">
            What would improve:
          </p>
          <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
            {insight.confidenceImprove!.map((item) => (
              <li key={item}>• Confirm {item.toLowerCase()}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function InsightHeader({ insight }: { insight: EstimateInsightData }) {
  return (
    <section className="space-y-3">
      <div>
        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          Work areas included
        </p>
        <ul className="mt-1 space-y-0.5 text-sm font-medium text-foreground">
          {insight.workAreasIncluded.map((area) => (
            <li key={area}>{area}</li>
          ))}
        </ul>
      </div>

      <dl className="grid gap-2 text-sm">
        <div>
          <dt className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Estimated cost
          </dt>
          <dd className="font-semibold tracking-tight">
            {formatCurrencyRange(insight.costLow, insight.costHigh)}
          </dd>
        </div>
        {insight.sellLow != null && insight.sellHigh != null && (
          <div>
            <dt className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Estimated sell
            </dt>
            <dd className="font-semibold tracking-tight">
              {formatCurrencyRange(insight.sellLow, insight.sellHigh)}
            </dd>
          </div>
        )}
        <div>
          <dt className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Rate source
          </dt>
          <dd className="text-muted-foreground">{insight.rateSourceSummary}</dd>
        </div>
      </dl>
    </section>
  );
}

function CostAllocationSection({ rows }: { rows: CostAllocationRow[] }) {
  if (rows.length === 0) return null;

  return (
    <section className="space-y-3">
      <p className="text-sm font-medium text-foreground">Cost allocation</p>
      <div className="space-y-3">
        {rows.map((row) => (
          <div key={row.key} className="space-y-1.5">
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="text-muted-foreground">{row.label}</span>
              <span className="font-medium text-foreground">
                {formatCurrencyCompact(row.amount)}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${Math.max(row.percent, 4)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-muted-foreground">
        Indicative allocation — not a detailed quote.
      </p>
    </section>
  );
}

function ComponentBreakdownSection({ groups }: { groups: ComponentGroup[] }) {
  if (groups.length === 0) return null;

  return (
    <section className="space-y-3">
      <p className="text-sm font-medium text-foreground">Component breakdown</p>
      <div className="space-y-2">
        {groups.map((group) => (
          <ExpandableComponentGroup key={group.key} group={group} />
        ))}
      </div>
    </section>
  );
}

function ExpandableComponentGroup({ group }: { group: ComponentGroup }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-lg border bg-muted/10">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-medium"
      >
        <span className="flex flex-col gap-0.5">
          <span>{group.label}</span>
          <span className="text-xs font-normal text-muted-foreground">
            {formatCurrencyCompact(group.totalAmount)}
          </span>
        </span>
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          {open ? "Hide components" : "Show components"}
          <ChevronDown
            className={cn(
              "h-4 w-4 transition-transform",
              open && "rotate-180"
            )}
          />
        </span>
      </button>
      {open && (
        <ul className="space-y-1 border-t px-3 py-2 text-xs text-muted-foreground">
          {group.components.map((component) => (
            <li
              key={component.key}
              className="flex items-center justify-between gap-2"
            >
              <span className="flex items-start gap-1.5">
                <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-muted-foreground" />
                <span>{component.label}</span>
              </span>
              <span className="shrink-0 font-medium text-foreground">
                {formatCurrencyCompact(component.amount)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CostDriversSection({ drivers }: { drivers: CostDriverInsight[] }) {
  if (drivers.length === 0) return null;

  return (
    <section className="space-y-3">
      <p className="text-sm font-medium text-foreground">Biggest cost drivers</p>
      <ul className="space-y-2">
        {drivers.map((driver) => (
          <li
            key={driver.label}
            className="rounded-lg border bg-muted/10 px-3 py-2 text-xs"
          >
            <p className="flex items-start gap-1.5 font-medium text-foreground">
              <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
              {driver.label}
            </p>
            <p className="mt-1 pl-5 text-muted-foreground">
              {driver.explanation}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function AssumptionsSection({ assumptions }: { assumptions: string[] }) {
  if (assumptions.length === 0) return null;

  return (
    <section className="space-y-2">
      <p className="text-sm font-medium text-foreground">Assumptions used</p>
      <ul className="space-y-1 text-xs text-muted-foreground">
        {assumptions.map((assumption) => (
          <li key={assumption} className="flex items-start gap-1.5">
            <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-muted-foreground" />
            <span>{assumption}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function MissingDetailsSection({
  groups,
  workAreaTypeKeys,
  onMissingItemClick,
  buildPrompt,
  onClose,
}: {
  groups: EstimateInsightData["missingDetailGroups"];
  workAreaTypeKeys: Record<string, string>;
  onMissingItemClick?: (
    item: CurrentMissingItem,
    prompt: MissingItemPrompt
  ) => void;
  buildPrompt?: (
    item: CurrentMissingItem,
    typeKey: string
  ) => MissingItemPrompt | null;
  onClose: () => void;
}) {
  if (groups.length === 0) return null;

  return (
    <section className="space-y-3">
      <p className="text-sm font-medium text-foreground">
        Information that would improve accuracy
      </p>
      <div className="space-y-3">
        {groups.map((group) => (
          <div key={group.scopeName}>
            <p className="text-xs font-medium text-foreground">
              {group.scopeName}
            </p>
            <ul className="mt-1 space-y-1">
              {group.items.map((item) => {
                const typeKey = item.scopeId
                  ? workAreaTypeKeys[item.scopeId]
                  : undefined;
                const prompt =
                  typeKey && buildPrompt ? buildPrompt(item, typeKey) : null;
                const label = item.label.replace(/^[^:]+:\s*/i, "");

                return (
                  <li key={`${item.factKey}-${item.label}`}>
                    <button
                      type="button"
                      className="w-full rounded-md px-2 py-1.5 text-left text-xs text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                      onClick={() => {
                        if (prompt) {
                          onMissingItemClick?.(item, prompt);
                          onClose();
                        }
                      }}
                    >
                      {label}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

function ExportSection({
  projectId,
  projectTitle,
}: {
  projectId: string;
  projectTitle: string;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <section className="border-t pt-4">
      <Button
        type="button"
        variant="outline"
        className="w-full"
        disabled={pending}
        onClick={() => {
          startTransition(async () => {
            const result = await exportEstimateSummary(projectId);
            if (result.error) {
              toast.error(result.error);
              return;
            }
            if (result.summary) {
              await navigator.clipboard.writeText(result.summary);
              toast.success(
                "Estimate summary copied — paste into a doc or print to PDF."
              );
            }
          });
        }}
      >
        {pending ? "Exporting…" : "Export estimate summary"}
      </Button>
      <p className="mt-2 text-[10px] text-muted-foreground">
        Internal review summary for {projectTitle}. Not a client quote.
      </p>
    </section>
  );
}
