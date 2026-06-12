"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus } from "lucide-react";
import {
  disableScopeRate,
  updateScopeRate,
  upsertScopeRate,
} from "@/actions/rates";
import { ActiveBadge } from "@/components/rates/active-badge";
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
import { SCOPE_RATE_DEFINITIONS } from "@/lib/constants/scope-rates";
import type { ScopeRate } from "@/types/database";
import { toast } from "sonner";

interface ScopeRatesTabProps {
  rates: ScopeRate[];
}

function formatRate(value: number | null | undefined): string {
  if (value == null) return "—";
  return `$${Number(value).toLocaleString("en-NZ", { maximumFractionDigits: 0 })}`;
}

export function ScopeRatesTab({ rates }: ScopeRatesTabProps) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingDefKey, setEditingDefKey] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const activeRates = rates.filter((rate) => rate.is_active);

  function openEditor(scopeTypeKey: string) {
    setEditingDefKey(scopeTypeKey);
    setDialogOpen(true);
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Set simple per-scope rates for quick estimates. These are used before
        package or trade rates.
      </p>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {SCOPE_RATE_DEFINITIONS.map((def) => {
          const saved = activeRates.find(
            (rate) => rate.scope_type_key === def.scopeTypeKey
          );
          return (
            <div
              key={def.scopeTypeKey}
              className="rounded-xl border bg-card p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium">{def.label}</p>
                  <p className="text-xs text-muted-foreground">
                    per {def.unitLabel}
                  </p>
                </div>
                {saved ? <ActiveBadge active /> : null}
              </div>

              <dl className="mt-3 space-y-1 text-sm">
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">Budget/basic</dt>
                  <dd className="font-medium">
                    {formatRate(saved?.budget_rate)}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">Standard</dt>
                  <dd className="font-medium">
                    {formatRate(saved?.standard_rate ?? saved?.default_rate)}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">Premium</dt>
                  <dd className="font-medium">
                    {formatRate(saved?.premium_rate)}
                  </dd>
                </div>
              </dl>

              {saved?.updated_at && (
                <p className="mt-2 text-[10px] text-muted-foreground">
                  Updated{" "}
                  {new Date(saved.updated_at).toLocaleDateString("en-NZ", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </p>
              )}

              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => openEditor(def.scopeTypeKey)}
                >
                  {saved ? (
                    <>
                      <Pencil className="h-3.5 w-3.5" />
                      Edit
                    </>
                  ) : (
                    <>
                      <Plus className="h-3.5 w-3.5" />
                      Add rate
                    </>
                  )}
                </Button>
                {saved ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={pending}
                    onClick={() => {
                      startTransition(async () => {
                        const result = await disableScopeRate(saved.id);
                        if (result.error) {
                          toast.error(result.error);
                          return;
                        }
                        toast.success(`${def.label} rate disabled.`);
                        router.refresh();
                      });
                    }}
                  >
                    Disable
                  </Button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      <ScopeRateDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        scopeTypeKey={editingDefKey}
        existing={
          editingDefKey
            ? activeRates.find((rate) => rate.scope_type_key === editingDefKey) ??
              null
            : null
        }
        onSaved={() => {
          setDialogOpen(false);
          router.refresh();
        }}
      />
    </div>
  );
}

function ScopeRateDialog({
  open,
  onOpenChange,
  scopeTypeKey,
  existing,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scopeTypeKey: string | null;
  existing: ScopeRate | null;
  onSaved: () => void;
}) {
  const def = SCOPE_RATE_DEFINITIONS.find((d) => d.scopeTypeKey === scopeTypeKey);
  const [pending, startTransition] = useTransition();
  const [showAllocations, setShowAllocations] = useState(false);

  if (!def) return null;

  const defaults = {
    budget: existing?.budget_rate ?? def.benchmarkLow,
    standard: existing?.standard_rate ?? def.benchmarkStandard,
    premium: existing?.premium_rate ?? def.benchmarkPremium,
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Your {def.label} rate</DialogTitle>
          <DialogDescription>
            Set how you price {def.label.toLowerCase()} work per {def.unitLabel}.
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            const formData = new FormData(event.currentTarget);
            startTransition(async () => {
              const action = existing ? updateScopeRate : upsertScopeRate;
              const result = await action({} as never, formData);
              if (result.error) {
                toast.error(result.error);
                return;
              }
              if (result.fieldErrors) {
                const first = Object.values(result.fieldErrors)[0]?.[0];
                toast.error(first ?? "Check the form and try again.");
                return;
              }
              toast.success(result.message ?? "Rate saved.");
              onSaved();
            });
          }}
        >
          {existing ? <input type="hidden" name="id" value={existing.id} /> : null}
          <input type="hidden" name="scopeTypeKey" value={def.scopeTypeKey} />
          <input type="hidden" name="label" value={def.label} />
          <input type="hidden" name="unit" value={def.unit} />
          <input type="hidden" name="isActive" value="true" />

          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1">
              <Label htmlFor="budgetRate">Budget/basic</Label>
              <Input
                id="budgetRate"
                name="budgetRate"
                type="number"
                min={0}
                step="1"
                defaultValue={defaults.budget}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="standardRate">Standard</Label>
              <Input
                id="standardRate"
                name="standardRate"
                type="number"
                min={0}
                step="1"
                defaultValue={defaults.standard}
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="premiumRate">Premium</Label>
              <Input
                id="premiumRate"
                name="premiumRate"
                type="number"
                min={0}
                step="1"
                defaultValue={defaults.premium}
              />
            </div>
          </div>

          <button
            type="button"
            className="text-xs text-muted-foreground underline-offset-2 hover:underline"
            onClick={() => setShowAllocations((value) => !value)}
          >
            {showAllocations ? "Hide" : "Show"} cost allocation % (optional)
          </button>

          {showAllocations ? (
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label htmlFor="labourAllocationPercent">Labour %</Label>
                <Input
                  id="labourAllocationPercent"
                  name="labourAllocationPercent"
                  type="number"
                  min={0}
                  max={100}
                  defaultValue={existing?.labour_allocation_percent ?? ""}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="materialsAllocationPercent">Materials %</Label>
                <Input
                  id="materialsAllocationPercent"
                  name="materialsAllocationPercent"
                  type="number"
                  min={0}
                  max={100}
                  defaultValue={existing?.materials_allocation_percent ?? ""}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="subcontractorAllocationPercent">
                  Subcontractor %
                </Label>
                <Input
                  id="subcontractorAllocationPercent"
                  name="subcontractorAllocationPercent"
                  type="number"
                  min={0}
                  max={100}
                  defaultValue={
                    existing?.subcontractor_allocation_percent ?? ""
                  }
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="allowanceAllocationPercent">Allowance %</Label>
                <Input
                  id="allowanceAllocationPercent"
                  name="allowanceAllocationPercent"
                  type="number"
                  min={0}
                  max={100}
                  defaultValue={existing?.allowance_allocation_percent ?? ""}
                />
              </div>
            </div>
          ) : null}

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
