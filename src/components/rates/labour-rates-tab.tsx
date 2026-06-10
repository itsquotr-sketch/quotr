"use client";

import { useActionState, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import {
  createLabourRate,
  deleteLabourRate,
  updateLabourRate,
} from "@/actions/rates";
import { ActiveBadge } from "@/components/rates/active-badge";
import {
  formatRateAmount,
  matchesSearch,
  unitLabel,
} from "@/components/rates/rate-utils";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { LABOUR_CATEGORIES, RATE_UNITS } from "@/lib/constants/rates";
import type { RateActionState } from "@/lib/validations/rates";
import type { LabourRate } from "@/types/database";

interface LabourRatesTabProps {
  rates: LabourRate[];
}

export function LabourRatesTab({ rates }: LabourRatesTabProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<LabourRate | null>(null);
  const [deletePending, startDelete] = useTransition();

  const filtered = useMemo(
    () =>
      rates.filter((r) =>
        matchesSearch(search, r.name, r.category, r.unit)
      ),
    [rates, search]
  );

  function openCreate() {
    setEditing(null);
    setDialogOpen(true);
  }

  function openEdit(rate: LabourRate) {
    setEditing(rate);
    setDialogOpen(true);
  }

  function handleDelete(id: string, name: string) {
    if (!window.confirm(`Delete labour rate "${name}"?`)) return;
    startDelete(async () => {
      await deleteLabourRate(id);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search labour rates…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button type="button" size="sm" onClick={openCreate}>
          <Plus className="h-4 w-4" />
          Add labour rate
        </Button>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
          {rates.length === 0
            ? "No labour rates yet. Add Carpenter, Leading Hand, Apprentice, and other roles."
            : "No rates match your search."}
        </div>
      ) : (
        <div className="rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Cost</TableHead>
                <TableHead>Charge</TableHead>
                <TableHead>Unit</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((rate) => (
                <TableRow key={rate.id}>
                  <TableCell className="font-medium">{rate.name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {rate.category ?? "—"}
                  </TableCell>
                  <TableCell>{formatRateAmount(rate.cost_rate)}</TableCell>
                  <TableCell>{formatRateAmount(rate.charge_rate)}</TableCell>
                  <TableCell>{unitLabel(rate.unit)}</TableCell>
                  <TableCell>
                    <ActiveBadge active={rate.is_active} />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => openEdit(rate)}
                        aria-label={`Edit ${rate.name}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        disabled={deletePending}
                        onClick={() => handleDelete(rate.id, rate.name)}
                        aria-label={`Delete ${rate.name}`}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <LabourRateDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        rate={editing}
        onSuccess={() => {
          setDialogOpen(false);
          router.refresh();
        }}
      />
    </div>
  );
}

function LabourRateDialog({
  open,
  onOpenChange,
  rate,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rate: LabourRate | null;
  onSuccess: () => void;
}) {
  const isEdit = Boolean(rate);
  const action = isEdit
    ? updateLabourRate.bind(null, rate!.id)
    : createLabourRate;

  const [state, formAction, pending] = useActionState(
    action,
    {} as RateActionState
  );

  const [unit, setUnit] = useState(rate?.unit ?? "hour");

  useEffect(() => {
    if (state.success) {
      onSuccess();
    }
  }, [state.success, onSuccess]);

  useEffect(() => {
    if (open) {
      setUnit(rate?.unit ?? "hour");
    }
  }, [open, rate?.unit]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="normal-case tracking-normal">
            {isEdit ? "Edit labour rate" : "Add labour rate"}
          </DialogTitle>
          <DialogDescription>
            Set cost and charge rates for internal labour roles.
          </DialogDescription>
        </DialogHeader>

        <form key={rate?.id ?? "new"} action={formAction} className="space-y-4">
          <input type="hidden" name="unit" value={unit} />
          {!isEdit && <input type="hidden" name="isActive" value="true" />}

          <div className="space-y-2">
            <Label htmlFor="labour-name">Name</Label>
            <Input
              id="labour-name"
              name="name"
              defaultValue={rate?.name ?? ""}
              placeholder="e.g. Carpenter"
              required
            />
            {state.fieldErrors?.name && (
              <p className="text-sm text-destructive">{state.fieldErrors.name[0]}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="labour-category">Category</Label>
            <Input
              id="labour-category"
              name="category"
              list="labour-categories"
              defaultValue={rate?.category ?? ""}
              placeholder="e.g. Carpentry"
            />
            <datalist id="labour-categories">
              {LABOUR_CATEGORIES.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="labour-cost">Cost rate</Label>
              <Input
                id="labour-cost"
                name="costRate"
                type="number"
                min={0}
                step="0.01"
                defaultValue={rate?.cost_rate ?? ""}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="labour-charge">Charge rate</Label>
              <Input
                id="labour-charge"
                name="chargeRate"
                type="number"
                min={0}
                step="0.01"
                defaultValue={rate?.charge_rate ?? ""}
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Unit</Label>
            <Select value={unit} onValueChange={setUnit}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RATE_UNITS.map((u) => (
                  <SelectItem key={u.value} value={u.value}>
                    {u.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isEdit && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="isActive"
                value="true"
                defaultChecked={rate?.is_active}
                className="rounded border-input"
              />
              Active
            </label>
          )}

          {state.error && (
            <p className="text-sm text-destructive">{state.error}</p>
          )}

          <div className="flex gap-2">
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : isEdit ? "Save changes" : "Add rate"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
