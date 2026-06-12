import Link from "next/link";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/projects/status-badge";
import {
  CALCULATION_RULES_PLACEHOLDER,
  PLACEHOLDER_ALLOWANCES,
  PLACEHOLDER_RISKS,
} from "@/lib/constants/project-assistant";
import {
  QUICK_ESTIMATE_BUDGET_FIT,
  QUICK_ESTIMATE_CONFIDENCE_LEVELS,
  QUICK_ESTIMATE_STATUSES,
} from "@/lib/constants/quick-estimate";
import { labelFor } from "@/lib/constants/projects";
import {
  formatCurrency,
  formatCurrencyRange,
} from "@/lib/format-currency";
import type { QuickEstimate } from "@/types/database";

interface ProjectAssistantQuickEstimateSummaryProps {
  projectId: string;
  quickEstimate: QuickEstimate | null;
  includedTrades: string[];
}

export function ProjectAssistantQuickEstimateSummary({
  projectId,
  quickEstimate,
  includedTrades,
}: ProjectAssistantQuickEstimateSummaryProps) {
  const hasEstimate = Boolean(quickEstimate);
  const hasResults =
    quickEstimate?.estimated_cost_low != null &&
    quickEstimate?.estimated_cost_high != null;

  const buttonLabel = hasEstimate
    ? quickEstimate!.status === "ready" ||
      quickEstimate!.status === "presented"
      ? "Review quick estimate"
      : "Continue quick estimate"
    : "Start quick estimate";

  return (
    <div className="space-y-4">
      {!hasEstimate ? (
        <div className="rounded-xl border border-dashed bg-muted/20 p-4">
          <p className="text-sm text-muted-foreground">
            {CALCULATION_RULES_PLACEHOLDER}
          </p>
          <Button asChild size="sm" className="mt-4 w-full sm:w-auto">
            <Link href={`/projects/${projectId}/quick-estimate`}>
              Start quick estimate
            </Link>
          </Button>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            <StatusBadge
              label={labelFor(QUICK_ESTIMATE_STATUSES, quickEstimate!.status)}
            />
            {hasResults && (
              <StatusBadge
                label={`Confidence: ${labelFor(
                  QUICK_ESTIMATE_CONFIDENCE_LEVELS,
                  quickEstimate!.confidence_level
                )}`}
              />
            )}
            {quickEstimate!.budget_fit &&
              quickEstimate!.budget_fit !== "unknown" && (
                <StatusBadge
                  label={`Budget: ${labelFor(
                    QUICK_ESTIMATE_BUDGET_FIT,
                    quickEstimate!.budget_fit
                  )}`}
                />
              )}
          </div>

          {hasResults ? (
            <dl className="grid grid-cols-2 gap-4 md:grid-cols-3">
              <div>
                <dt className="text-xs text-muted-foreground">
                  Estimate range
                </dt>
                <dd className="mt-0.5 text-lg font-semibold">
                  {formatCurrencyRange(
                    Number(quickEstimate!.estimated_cost_low),
                    Number(quickEstimate!.estimated_cost_high)
                  )}
                </dd>
                <p className="text-xs text-muted-foreground">
                  Draft quick estimate — not quote-ready
                </p>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">
                  Recommended sell
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
              <div className="col-span-2 md:col-span-1">
                <dt className="text-xs text-muted-foreground">
                  Expected margin
                </dt>
                <dd className="mt-0.5 text-lg font-semibold">
                  {quickEstimate!.expected_margin_percent != null
                    ? `${Number(quickEstimate!.expected_margin_percent)}%`
                    : "—"}
                </dd>
              </div>
            </dl>
          ) : (
            <p className="text-sm text-muted-foreground">
              {quickEstimate!.notes ?? CALCULATION_RULES_PLACEHOLDER}
            </p>
          )}

          {quickEstimate!.client_budget != null && (
            <p className="text-sm">
              <span className="text-muted-foreground">Client budget: </span>
              <span className="font-medium">
                {formatCurrency(Number(quickEstimate!.client_budget))}
              </span>
            </p>
          )}

          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground">
                Included trades
              </h4>
              {includedTrades.length > 0 ? (
                <ul className="mt-2 space-y-1 text-sm">
                  {includedTrades.map((trade) => (
                    <li key={trade}>{trade}</li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">
                  Confirm work areas to see likely trades.
                </p>
              )}
            </div>
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground">
                Included allowances
              </h4>
              <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                {hasResults
                  ? PLACEHOLDER_ALLOWANCES.map((item) => (
                      <li key={item}>{item}</li>
                    ))
                  : [
                      <li key="placeholder">
                        {CALCULATION_RULES_PLACEHOLDER}
                      </li>,
                    ]}
              </ul>
            </div>
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground">
                Key risks / assumptions
              </h4>
              <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                {(hasResults
                  ? PLACEHOLDER_RISKS
                  : [CALCULATION_RULES_PLACEHOLDER]
                ).map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          </div>

          <Button asChild className="w-full sm:w-auto">
            <Link href={`/projects/${projectId}/quick-estimate`}>
              {buttonLabel}
            </Link>
          </Button>
        </>
      )}
    </div>
  );
}
