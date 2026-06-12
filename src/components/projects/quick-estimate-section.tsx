import Link from "next/link";
import { Gauge, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { StatusBadge } from "@/components/projects/status-badge";
import {
  QUICK_ESTIMATE_BUDGET_FIT,
  QUICK_ESTIMATE_CONFIDENCE_LEVELS,
  QUICK_ESTIMATE_STATUSES,
} from "@/lib/constants/quick-estimate";
import { labelFor } from "@/lib/constants/projects";
import {
  formatCurrencyRange,
  formatCurrency,
} from "@/lib/format-currency";
import type { QuickEstimate } from "@/types/database";

interface QuickEstimateSectionProps {
  projectId: string;
  quickEstimate: QuickEstimate | null;
}

export function QuickEstimateSection({
  projectId,
  quickEstimate,
}: QuickEstimateSectionProps) {
  const hasEstimate = Boolean(quickEstimate);
  const hasResults =
    quickEstimate?.estimated_cost_low != null &&
    quickEstimate?.estimated_cost_high != null;

  const buttonLabel = hasEstimate
    ? quickEstimate!.status === "ready" ||
      quickEstimate!.status === "presented"
      ? "View Quick Estimate"
      : "Continue Quick Estimate"
    : "Start Quick Estimate";

  return (
    <section className="mb-6">
      <Card className="rounded-xl">
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <CardTitle className="normal-case tracking-normal text-xl font-semibold">
                Quick Estimate
              </CardTitle>
              <CardDescription>
                Use quick notes, simple questions and project constraints to
                give the client a realistic estimate range before spending time
                on a detailed quote.
              </CardDescription>
            </div>
            <Zap className="hidden h-6 w-6 shrink-0 text-muted-foreground md:block" />
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {!hasEstimate ? (
            <div className="rounded-xl border border-dashed bg-muted/20 p-6 text-center">
              <Gauge className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
              <p className="font-medium">No quick estimate yet.</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Capture what you know and get a ballpark range in minutes.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <StatusBadge
                  label={labelFor(
                    QUICK_ESTIMATE_STATUSES,
                    quickEstimate!.status
                  )}
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
                        quickEstimate!.estimated_cost_low
                          ? Number(quickEstimate!.estimated_cost_low)
                          : null,
                        quickEstimate!.estimated_cost_high
                          ? Number(quickEstimate!.estimated_cost_high)
                          : null
                      )}
                    </dd>
                    <p className="text-xs text-muted-foreground">
                      Draft quick estimate
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
                  {quickEstimate!.notes ??
                    "Complete the wizard to generate a draft quick estimate."}
                </p>
              )}

              {quickEstimate!.client_budget != null && (
                <p className="text-sm text-muted-foreground">
                  Client budget:{" "}
                  <span className="font-medium text-foreground">
                    {formatCurrency(Number(quickEstimate!.client_budget))}
                  </span>
                </p>
              )}
            </div>
          )}

          <Button asChild className="w-full md:w-auto">
            <Link href={`/projects/${projectId}/quick-estimate`}>
              {buttonLabel}
            </Link>
          </Button>
        </CardContent>
      </Card>
    </section>
  );
}
