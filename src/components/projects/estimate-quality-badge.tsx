import { Check, X } from "lucide-react";
import type { EstimateQualityFactor } from "@/lib/cost-engine/estimate-quality";
import { labelForEstimateQuality } from "@/lib/cost-engine/estimate-quality";
import type { QuickEstimateConfidenceLevel } from "@/lib/constants/quick-estimate";
import { cn } from "@/lib/utils";

interface EstimateQualityBadgeProps {
  level: QuickEstimateConfidenceLevel;
  factors?: EstimateQualityFactor[];
  compact?: boolean;
  className?: string;
}

export function EstimateQualityBadge({
  level,
  factors = [],
  compact = false,
  className,
}: EstimateQualityBadgeProps) {
  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
            level === "high" &&
              "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
            level === "medium" &&
              "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
            level === "low" &&
              "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300"
          )}
        >
          {labelForEstimateQuality(level)} quality
        </span>
      </div>

      {factors.length > 0 && (
        <ul className={cn("space-y-0.5", compact && "text-xs")}>
          {factors.map((factor) => (
            <li key={factor.label} className="flex items-start gap-1 text-xs">
              {factor.met ? (
                <Check className="mt-0.5 h-3 w-3 shrink-0 text-green-600" />
              ) : (
                <X className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
              )}
              <span
                className={
                  factor.met ? "text-foreground" : "text-muted-foreground"
                }
              >
                {factor.label}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
