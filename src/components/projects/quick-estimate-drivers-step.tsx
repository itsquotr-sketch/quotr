"use client";

import { useActionState, useEffect, useState } from "react";
import { saveQuickEstimateDrivers } from "@/actions/quick-estimate";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { EstimateDriverCategoryWithDrivers } from "@/types/database";
import type { QuickEstimateActionState } from "@/lib/validations/quick-estimate";

const initialState: QuickEstimateActionState = {};

interface QuickEstimateDriversStepProps {
  projectId: string;
  quickEstimateId: string;
  categories: EstimateDriverCategoryWithDrivers[];
  selectedDriverIds: string[];
  onStepComplete: (step: number) => void;
}

export function QuickEstimateDriversStep({
  projectId,
  quickEstimateId,
  categories,
  selectedDriverIds,
  onStepComplete,
}: QuickEstimateDriversStepProps) {
  const [selected, setSelected] = useState<Set<string>>(
    new Set(selectedDriverIds)
  );

  const boundAction = saveQuickEstimateDrivers.bind(
    null,
    projectId,
    quickEstimateId
  );
  const [state, formAction, pending] = useActionState(
    boundAction,
    initialState
  );

  useEffect(() => {
    if (state.success && state.redirectStep) {
      onStepComplete(state.redirectStep);
    }
  }, [state.success, state.redirectStep, onStepComplete]);

  function toggleDriver(driverId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(driverId)) {
        next.delete(driverId);
      } else {
        next.add(driverId);
      }
      return next;
    });
  }

  return (
    <form action={formAction} className="space-y-8">
      {Array.from(selected).map((id) => (
        <input key={id} type="hidden" name="driverIds" value={id} />
      ))}

      {categories.map((category) => {
        const drivers = (category.estimate_drivers ?? []).filter(
          (d) => d.is_active
        );
        if (drivers.length === 0) return null;

        return (
          <div key={category.id} className="space-y-3">
            <h3 className="text-sm font-semibold">{category.name}</h3>
            <div className="grid gap-2 sm:grid-cols-2">
              {drivers.map((driver) => {
                const isSelected = selected.has(driver.id);
                return (
                  <button
                    key={driver.id}
                    type="button"
                    onClick={() => toggleDriver(driver.id)}
                    className={cn(
                      "rounded-xl border p-4 text-left transition-colors",
                      isSelected
                        ? "border-primary bg-primary/5 ring-1 ring-primary"
                        : "hover:bg-accent/50"
                    )}
                  >
                    <p className="font-medium">{driver.name}</p>
                    {driver.description && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {driver.description}
                      </p>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}

      <p className="text-sm text-muted-foreground">
        Select anything that might affect cost or programme. You can change
        these later.
      </p>

      {state.error && (
        <p className="text-sm text-destructive">{state.error}</p>
      )}

      <Button type="submit" disabled={pending} className="w-full md:w-auto">
        {pending ? "Saving…" : "Continue to review"}
      </Button>
    </form>
  );
}
