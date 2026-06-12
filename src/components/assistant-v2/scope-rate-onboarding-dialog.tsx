"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveScopeRateAndRecalculate } from "@/actions/rates";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export type BenchmarkScopeForOnboarding = {
  scopeTypeKey: string;
  label: string;
  workAreaTypeKey: string;
  unit: string;
  benchmarkLow: number;
  benchmarkStandard: number;
  benchmarkPremium: number;
};

interface ScopeRateOnboardingDialogProps {
  projectId: string;
  scope: BenchmarkScopeForOnboarding | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: (message?: string) => void;
}

export function ScopeRateOnboardingDialog({
  projectId,
  scope,
  open,
  onOpenChange,
  onSaved,
}: ScopeRateOnboardingDialogProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [showAllocations, setShowAllocations] = useState(false);

  if (!scope) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add your {scope.label} rate</DialogTitle>
          <DialogDescription>
            Use these as a starting point and adjust to match how you price.
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            const formData = new FormData(event.currentTarget);
            startTransition(async () => {
              const result = await saveScopeRateAndRecalculate(
                projectId,
                formData
              );
              if (result.error) {
                toast.error(result.error);
                return;
              }
              if (result.estimateDeltaMessage) {
                toast.success(result.estimateDeltaMessage);
              } else {
                toast.success(result.message ?? "Rate saved.");
              }
              onOpenChange(false);
              onSaved?.(result.estimateDeltaMessage ?? result.message);
              router.refresh();
            });
          }}
        >
          <input type="hidden" name="scopeTypeKey" value={scope.scopeTypeKey} />
          <input type="hidden" name="label" value={scope.label} />
          <input type="hidden" name="unit" value={scope.unit} />
          <input type="hidden" name="isActive" value="true" />

          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1">
              <Label htmlFor="onboard-budgetRate">Budget/basic</Label>
              <Input
                id="onboard-budgetRate"
                name="budgetRate"
                type="number"
                min={0}
                step="1"
                defaultValue={scope.benchmarkLow}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="onboard-standardRate">Standard</Label>
              <Input
                id="onboard-standardRate"
                name="standardRate"
                type="number"
                min={0}
                step="1"
                defaultValue={scope.benchmarkStandard}
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="onboard-premiumRate">Premium</Label>
              <Input
                id="onboard-premiumRate"
                name="premiumRate"
                type="number"
                min={0}
                step="1"
                defaultValue={scope.benchmarkPremium}
              />
            </div>
          </div>

          <button
            type="button"
            className="text-xs text-muted-foreground underline-offset-2 hover:underline"
            onClick={() => setShowAllocations((value) => !value)}
          >
            {showAllocations ? "Hide" : "Show"} allocation % (optional)
          </button>

          {showAllocations ? (
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label htmlFor="onboard-labourAllocationPercent">Labour %</Label>
                <Input
                  id="onboard-labourAllocationPercent"
                  name="labourAllocationPercent"
                  type="number"
                  min={0}
                  max={100}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="onboard-materialsAllocationPercent">
                  Materials %
                </Label>
                <Input
                  id="onboard-materialsAllocationPercent"
                  name="materialsAllocationPercent"
                  type="number"
                  min={0}
                  max={100}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="onboard-subcontractorAllocationPercent">
                  Subcontractor %
                </Label>
                <Input
                  id="onboard-subcontractorAllocationPercent"
                  name="subcontractorAllocationPercent"
                  type="number"
                  min={0}
                  max={100}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="onboard-allowanceAllocationPercent">
                  Allowance %
                </Label>
                <Input
                  id="onboard-allowanceAllocationPercent"
                  name="allowanceAllocationPercent"
                  type="number"
                  min={0}
                  max={100}
                />
              </div>
            </div>
          ) : null}

          <p className="text-xs text-muted-foreground">
            Use this rate for future {scope.label.toLowerCase()} estimates.
          </p>

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save rate"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
