"use client";

import type { QuickEstimateConfidenceLevel } from "@/lib/constants/quick-estimate";
import type { EstimateQualityFactor } from "@/lib/cost-engine/estimate-quality";
import { parseQuickEstimateSummary } from "@/lib/project-assistant-summary";
import { formatCurrencyRange } from "@/lib/project-assistant-calculate";
import {
  formatLastUpdated,
  useEstimateUpdate,
} from "@/components/projects/estimate-update-context";
import type { QuickEstimate } from "@/types/database";
import { cn } from "@/lib/utils";

interface AssistantV2EstimateCardProps {
  quickEstimate: QuickEstimate | null;
  qualityLevel: QuickEstimateConfidenceLevel;
  qualityFactors?: EstimateQualityFactor[];
}

export function AssistantV2EstimateCard({
  quickEstimate,
  qualityLevel,
  qualityFactors = [],
}: AssistantV2EstimateCardProps) {
  const { status, lastUpdatedAt } = useEstimateUpdate();

  if (!quickEstimate) {
    return (
      <div className="rounded-xl border bg-card/95 p-4 shadow-lg backdrop-blur">
        <p className="text-sm text-muted-foreground">
          Describe the job to see your draft estimate.
        </p>
      </div>
    );
  }

  const hasResults =
    quickEstimate.estimated_cost_low != null &&
    quickEstimate.estimated_cost_high != null;

  const summary = parseQuickEstimateSummary(quickEstimate?.notes ?? null);
  const qualityLabel =
    qualityLevel === "high"
      ? "High"
      : qualityLevel === "medium"
        ? "Medium"
        : "Low";

  const statusLabel =
    status === "saving" || status === "updating"
      ? "Updating…"
      : status === "saved"
        ? formatLastUpdated(lastUpdatedAt)
        : null;

  return (
    <div className="rounded-xl border bg-card/95 p-4 shadow-lg backdrop-blur">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Draft estimate
          </p>
          {statusLabel && (
            <p className="text-[10px] text-muted-foreground">{statusLabel}</p>
          )}
        </div>
        {hasResults && (
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[10px] font-medium",
              qualityLevel === "high" && "bg-primary/10 text-primary",
              qualityLevel === "medium" && "bg-muted text-foreground",
              qualityLevel === "low" && "bg-muted text-muted-foreground"
            )}
          >
            {qualityLabel} quality
          </span>
        )}
      </div>

      {hasResults ? (
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          <div>
            <p className="text-[10px] text-muted-foreground">Cost range</p>
            <p className="text-lg font-semibold tracking-tight">
              {formatCurrencyRange(
                Number(quickEstimate.estimated_cost_low),
                Number(quickEstimate.estimated_cost_high)
              )}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground">Sell range</p>
            <p className="text-lg font-semibold tracking-tight">
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
        </div>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">
          Answer a few quick questions to generate your range.
        </p>
      )}

      {hasResults && qualityFactors.filter((f) => f.met).length > 0 && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          {qualityFactors
            .filter((f) => f.met)
            .slice(0, 3)
            .map((f) => f.label)
            .join(" · ")}
        </p>
      )}

      {summary?.missingInformation?.length ? (
        <p className="mt-1 text-[11px] text-muted-foreground">
          Still missing: {summary.missingInformation.slice(0, 2).join(", ")}
        </p>
      ) : null}
    </div>
  );
}
