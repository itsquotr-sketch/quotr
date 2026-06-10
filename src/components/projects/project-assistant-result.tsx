"use client";

import type { ReactNode } from "react";
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
import {
  QUICK_ESTIMATE_BUDGET_FIT,
  QUICK_ESTIMATE_CONFIDENCE_LEVELS,
} from "@/lib/constants/quick-estimate";
import { labelForQualityLevel } from "@/lib/constants/quality-level";
import { labelFor } from "@/lib/constants/projects";
import type { DiscoveryResult } from "@/lib/discovery";
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
  discovery: DiscoveryResult | null;
}

export function ProjectAssistantResult({
  projectId,
  quickEstimate,
  fallbackTrades,
  confirmedWorkAreas,
  questionsAnswered,
  questionsTotal,
  selectedConstraintLabels,
  discovery,
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
  const constraints =
    summary?.constraintsApplied.length
      ? summary.constraintsApplied
      : selectedConstraintLabels;
  const includedTrades = summary?.includedTrades ?? fallbackTrades;
  const allowances = summary?.allowances ?? [];
  const assumptions = summary?.assumptions ?? [];
  const missingInformation = summary?.missingInformation ?? [];
  const inputsUsed = summary?.inputsUsed ?? [];
  const ratesSource = summary?.ratesSource ?? null;
  const qualityLevelLabel = labelForQualityLevel(
    summary?.qualityLevel ?? quickEstimate?.quality_level
  );
  const qualityLevelNote = summary?.qualityLevelNote ?? null;
  const confidenceReason = summary?.confidenceReason ?? null;
  const rangeQualityLabel = summary?.rangeQualityLabel ?? null;
  const rangeQualityReason = summary?.rangeQualityReason ?? null;
  const tightenSuggestions = summary?.tightenSuggestions ?? [];
  const rangeLowDrivers = summary?.rangeLowDrivers ?? [];
  const rangeHighDrivers = summary?.rangeHighDrivers ?? [];
  const baseCalculations = inputsUsed.filter((item) => item.includes("× $"));
  const keyFacts = summary?.keyFactsUsed ?? baseCalculations;
  const discoveryFacts =
    discovery?.facts.map((f) => `${f.label}: ${f.value}${f.unit ? ` ${f.unit}` : ""}`) ?? [];

  function handleUpdate() {
    startTransition(async () => {
      await updateQuickEstimate(projectId);
      router.refresh();
    });
  }

  if (!quickEstimate) {
    return (
      <div className="rounded-xl border border-dashed bg-muted/20 p-6 text-center">
        <p className="text-sm text-muted-foreground">
          Complete the steps above, then update your draft quick estimate.
        </p>
      </div>
    );
  }

  const targetMarginPercent =
    quickEstimate.target_margin_percent != null
      ? Number(quickEstimate.target_margin_percent)
      : DEFAULT_TARGET_MARGIN_PERCENT;

  return (
    <div className="space-y-8">
      {/* Top summary card */}
      <div className="rounded-xl border bg-card p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold">Draft quick estimate</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Ballpark range for qualifying the job — not quote-ready.
            </p>
          </div>
          <StatusBadge label="Not quote-ready" />
        </div>

        {hasResults ? (
          <dl className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className="text-xs font-medium text-muted-foreground">
                Estimate range
              </dt>
              <dd className="mt-1 text-2xl font-semibold tracking-tight">
                {formatCurrencyRange(
                  Number(quickEstimate.estimated_cost_low),
                  Number(quickEstimate.estimated_cost_high)
                )}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-muted-foreground">
                Recommended sell range
              </dt>
              <dd className="mt-1 text-2xl font-semibold tracking-tight">
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
            <div>
              <dt className="text-xs font-medium text-muted-foreground">
                Confidence
              </dt>
              <dd className="mt-1">
                <StatusBadge
                  label={labelFor(
                    QUICK_ESTIMATE_CONFIDENCE_LEVELS,
                    quickEstimate.confidence_level
                  )}
                />
              </dd>
              {confidenceReason && (
                <p className="mt-2 text-xs text-muted-foreground">
                  {confidenceReason}
                </p>
              )}
            </div>
            {quickEstimate.budget_fit &&
              quickEstimate.budget_fit !== "unknown" && (
                <div>
                  <dt className="text-xs font-medium text-muted-foreground">
                    Budget fit
                  </dt>
                  <dd className="mt-1">
                    <StatusBadge
                      label={labelFor(
                        QUICK_ESTIMATE_BUDGET_FIT,
                        quickEstimate.budget_fit
                      )}
                    />
                  </dd>
                </div>
              )}
          </dl>
        ) : null}

        {hasResults && (
          <div className="mt-6 space-y-4 border-t pt-6">
            <TargetMarginEditor
              projectId={projectId}
              defaultMargin={targetMarginPercent}
            />
            {rangeQualityLabel && (
              <p className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">
                  Range quality: {rangeQualityLabel}
                </span>
                {rangeQualityReason ? ` — ${rangeQualityReason}` : ""}
              </p>
            )}
          </div>
        )}

        {!hasResults && (
          <p className="mt-4 text-sm text-muted-foreground">
            Answer missing information and set finish level, then update your
            draft quick estimate.
          </p>
        )}

        {quickEstimate.client_budget != null && (
          <p className="mt-4 text-sm">
            <span className="text-muted-foreground">Client budget: </span>
            <span className="font-medium">
              {formatCurrency(Number(quickEstimate.client_budget))}
            </span>
          </p>
        )}
      </div>

      {/* What Quotr found */}
      <section className="space-y-4">
        <h4 className="text-sm font-semibold">What Quotr found</h4>
        <div className="grid gap-4 md:grid-cols-2">
          <InfoCard title="Work areas">
            {workAreas.length > 0 ? (
              <ul className="space-y-1 text-sm">
                {workAreas.map((name) => (
                  <li key={name} className="font-medium">
                    {name}
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyNote text="Confirm work areas to continue." />
            )}
          </InfoCard>

          <InfoCard title="Key facts">
            {(keyFacts.length > 0 || discoveryFacts.length > 0) ? (
              <ul className="space-y-1 text-sm">
                {(keyFacts.length > 0 ? keyFacts : discoveryFacts).map(
                  (item) => (
                    <li key={item}>{item}</li>
                  )
                )}
              </ul>
            ) : (
              <EmptyNote text="No measurements extracted yet." />
            )}
          </InfoCard>

          <InfoCard title="Constraints">
            {constraints.length > 0 ? (
              <ul className="space-y-1 text-sm">
                {constraints.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ) : (
              <EmptyNote text="No constraints applied." />
            )}
          </InfoCard>

          <InfoCard title="Trades">
            {includedTrades.length > 0 ? (
              <ul className="space-y-1 text-sm">
                {includedTrades.map((trade) => (
                  <li key={trade}>{trade}</li>
                ))}
              </ul>
            ) : (
              <EmptyNote text="Confirm work areas to see likely trades." />
            )}
          </InfoCard>
        </div>
      </section>

      {/* Missing information */}
      {missingInformation.length > 0 && (
        <section className="space-y-3">
          <h4 className="text-sm font-semibold">Missing information</h4>
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
            <ul className="space-y-2 text-sm">
              {missingInformation.map((item) => (
                <li key={item} className="text-amber-900 dark:text-amber-100">
                  {item}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-muted-foreground">
              Return to the questions step to provide these details and tighten
              the range.
            </p>
          </div>
        </section>
      )}

      {hasResults && tightenSuggestions.length > 0 && (
        <section className="space-y-3">
          <h4 className="text-sm font-semibold">
            What would tighten this estimate
          </h4>
          <div className="rounded-xl border bg-muted/20 p-4">
            <ul className="space-y-2 text-sm">
              {tightenSuggestions.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* Estimate basis */}
      {hasResults && (
        <section className="space-y-4">
          <h4 className="text-sm font-semibold">Estimate basis</h4>
          <div className="rounded-xl border bg-muted/20 p-4">
            <dl className="grid gap-4 sm:grid-cols-2">
              <BasisItem
                label="Base calculation"
                items={baseCalculations}
                empty="Generic allowance used"
              />
              {rangeLowDrivers.length > 0 && (
                <BasisItem
                  label="What drives the low end"
                  items={rangeLowDrivers}
                />
              )}
              {rangeHighDrivers.length > 0 && (
                <BasisItem
                  label="What drives the high end"
                  items={rangeHighDrivers}
                />
              )}
              <div>
                <dt className="text-xs font-medium text-muted-foreground">
                  Finish level
                </dt>
                <dd className="mt-1 text-sm font-medium">{qualityLevelLabel}</dd>
                {qualityLevelNote && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {qualityLevelNote}
                  </p>
                )}
              </div>
              <BasisItem
                label="Applied constraints"
                items={constraints}
                empty="None"
              />
              <div>
                <dt className="text-xs font-medium text-muted-foreground">
                  Rate source
                </dt>
                <dd className="mt-1 text-sm font-medium">
                  {ratesSource === "saved"
                    ? "Your saved package rates"
                    : ratesSource === "fallback"
                      ? "Template benchmark rates"
                      : "—"}
                </dd>
              </div>
              <BasisItem
                label="Assumptions"
                items={assumptions}
                empty="Standard assumptions applied"
              />
              {allowances.length > 0 && (
                <BasisItem label="Allowances" items={allowances} />
              )}
            </dl>
          </div>
        </section>
      )}

      {/* Next actions */}
      <section className="flex flex-col gap-3 border-t pt-6 sm:flex-row">
        <Button
          type="button"
          disabled={pending}
          onClick={handleUpdate}
          className="w-full sm:w-auto"
        >
          {pending ? "Updating…" : "Update quick estimate"}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled
          className="w-full sm:w-auto"
          title="Detailed estimate builder coming in a future release"
        >
          Continue to detailed estimate (coming later)
        </Button>
      </section>

      {questionsTotal > questionsAnswered && (
        <p className="text-xs text-muted-foreground">
          {questionsAnswered} of {questionsTotal} scope questions answered.
        </p>
      )}
    </div>
  );
}

function InfoCard({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <h5 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h5>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function EmptyNote({ text }: { text: string }) {
  return <p className="text-sm text-muted-foreground">{text}</p>;
}

function BasisItem({
  label,
  items,
  empty,
}: {
  label: string;
  items: string[];
  empty?: string;
}) {
  return (
    <div>
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-1">
        {items.length > 0 ? (
          <ul className="space-y-1 text-sm">
            {items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">{empty ?? "—"}</p>
        )}
      </dd>
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
  const [state, formAction, pending] = useActionState(
    boundAction,
    {} as ProjectAssistantActionState
  );

  useEffect(() => {
    if (state.success) {
      router.refresh();
    }
  }, [state.success, router]);

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <div className="space-y-1.5">
        <Label htmlFor="targetMarginPercent" className="text-xs font-medium">
          Target margin
        </Label>
        <div className="flex items-center gap-2">
          <Input
            id="targetMarginPercent"
            name="targetMarginPercent"
            type="number"
            min={0}
            max={100}
            step={0.5}
            defaultValue={defaultMargin}
            className="w-24 text-base"
          />
          <span className="text-sm text-muted-foreground">%</span>
        </div>
      </div>
      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        {pending ? "Updating…" : "Update margin"}
      </Button>
      {state.error && (
        <p className="w-full text-sm text-destructive">{state.error}</p>
      )}
      {state.message && (
        <p className="w-full text-sm text-primary">{state.message}</p>
      )}
      <p className="w-full text-xs text-muted-foreground">
        Adjusts recommended sell range only — estimate cost range stays the same.
      </p>
    </form>
  );
}
