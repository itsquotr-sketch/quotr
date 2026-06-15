"use client";

import { useCallback, useState } from "react";
import { retryQuickEstimateAction } from "@/actions/quick-estimate-retry";
import { Button } from "@/components/ui/button";
import { useEstimateUpdate } from "@/components/projects/estimate-update-context";
import { TRUST_COPY } from "@/lib/assistant-v2/trust-messages";
import type { QuickEstimate } from "@/types/database";
import { cn } from "@/lib/utils";

type EstimateRetryButtonProps = {
  projectId: string;
  onSuccess?: (estimate: QuickEstimate | null) => void | Promise<void>;
  className?: string;
  compact?: boolean;
  label?: string;
};

export function EstimateRetryButton({
  projectId,
  onSuccess,
  className,
  compact = false,
  label = "Retry estimate",
}: EstimateRetryButtonProps) {
  const { runGuardedRefresh, status } = useEstimateUpdate();
  const [localError, setLocalError] = useState<string | null>(null);
  const pending = status === "saving" || status === "updating";

  const handleRetry = useCallback(() => {
    if (pending) return;

    setLocalError(null);
    void runGuardedRefresh(async () => {
      const result = await retryQuickEstimateAction(projectId);

      if (!result.success) {
        setLocalError(
          result.userMessage ??
            "Something went wrong while calculating. Retry using the latest project details."
        );
        throw new Error(result.userMessage ?? "Retry failed");
      }

      await onSuccess?.(result.estimate ?? null);
    }, "manual_retry");
  }, [pending, projectId, onSuccess, runGuardedRefresh]);

  return (
    <div className={cn("space-y-2", className)}>
      <Button
        type="button"
        size={compact ? "sm" : "default"}
        variant={compact ? "outline" : "default"}
        className={compact ? "h-8 text-xs" : undefined}
        disabled={pending}
        onClick={handleRetry}
      >
        {pending ? TRUST_COPY.updatingEstimate : label}
      </Button>
      {!pending && !compact && (
        <p className="text-xs text-muted-foreground">
          Try recalculating from the latest project details.
        </p>
      )}
      {localError && (
        <p className="text-xs text-destructive">{localError}</p>
      )}
    </div>
  );
}
