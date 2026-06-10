import { Check, X } from "lucide-react";
import type { EstimateQualityFactor } from "@/lib/cost-engine/estimate-quality";
import { labelForEstimateQuality } from "@/lib/cost-engine/estimate-quality";
import type { QuickEstimateConfidenceLevel } from "@/lib/constants/quick-estimate";
import { cn } from "@/lib/utils";

interface EstimateQualityCardProps {
  level: QuickEstimateConfidenceLevel;
  factors: EstimateQualityFactor[];
  className?: string;
  compact?: boolean;
}

export function EstimateQualityCard({
  level,
  factors,
  className,
  compact = false,
}: EstimateQualityCardProps) {
  return (
    <div className={cn("rounded-lg border bg-card p-3", className)}>
      <div className="flex items-baseline justify-between gap-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Estimate quality
        </h4>
        <span
          className={cn(
            "text-sm font-bold tracking-wide",
            level === "high" && "text-green-700 dark:text-green-400",
            level === "medium" && "text-amber-700 dark:text-amber-400",
            level === "low" && "text-red-700 dark:text-red-400"
          )}
        >
          {labelForEstimateQuality(level)}
        </span>
      </div>

      <p className="mt-1 text-xs text-muted-foreground">Why?</p>

      <ul className={cn("mt-2 space-y-1", compact && "space-y-0.5")}>
        {factors.map((factor) => (
          <li
            key={factor.label}
            className="flex items-start gap-1.5 text-xs leading-snug"
          >
            {factor.met ? (
              <Check className="mt-0.5 h-3 w-3 shrink-0 text-green-600 dark:text-green-400" />
            ) : (
              <X className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
            )}
            <span
              className={factor.met ? "text-foreground" : "text-muted-foreground"}
            >
              {factor.label}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
