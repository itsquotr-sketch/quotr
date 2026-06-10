"use client";

import { useActionState, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import {
  createMaterialRate,
  deleteMaterialRate,
  updateMaterialRate,
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
import { MATERIAL_CATEGORIES, RATE_UNITS } from "@/lib/constants/rates";
import type { RateActionState } from "@/lib/validations/rates";
import type { MaterialRate } from "@/types/database";

interface MaterialRatesTabProps {
  rates: MaterialRate[];
}

export function MaterialRatesTab({ rates }: MaterialRatesTabProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<MaterialRate | null>(null);
  const [deletePending, startDelete] = useTransition();

  const filtered = useMemo(
    () =>
      rates.filter((r) =>
        matchesSearch(
          search,
          r.material_name,
          r.category,
          r.supplier,
          r.unit
        )
      ),
    [rates, search]
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search materials…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button
          type="button"
          size="sm"
          onClick={() => {
            setEditing(null);
            setDialogOpen(true);
          }}
        >
          <Plus className="h-4 w-4" />
          Add material rate
        </Button>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
          {rates.length === 0
            ? "No material rates yet. Add timber, GIB, decking, concrete, and other materials."
            : "No materials match your search."}
        </div>
      ) : (
        <div className="rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Material</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Supplier</TableHead>
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
                  <TableCell className="font-medium">{rate.material_name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {rate.category ?? "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {rate.supplier ?? "—"}
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
                        onClick={() => {
                          setEditing(rate);
                          setDialogOpen(true);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        disabled={deletePending}
                        onClick={() => {
                          if (!window.confirm(`Delete "${rate.material_name}"?`)) return;
                          startDelete(async () => {
                            await deleteMaterialRate(rate.id);
                            router.refresh();
                          });
                        }}
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

      <MaterialRateDialog
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

function MaterialRateDialog({
  open,
  onOpenChange,
  rate,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rate: MaterialRate | null;
  onSuccess: () => void;
}) {
  const isEdit = Boolean(rate);
  const action = isEdit
    ? updateMaterialRate.bind(null, rate!.id)
    : createMaterialRate;
  const [state, formAction, pending] = useActionState(action, {} as RateActionState);
  const [unit, setUnit] = useState(rate?.unit ?? "each");

  useEffect(() => {
    if (state.success) onSuccess();
  }, [state.success, onSuccess]);

  useEffect(() => {
    if (open) setUnit(rate?.unit ?? "each");
  }, [open, rate?.unit]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="normal-case tracking-normal">
            {isEdit ? "Edit material rate" : "Add material rate"}
          </DialogTitle>
          <DialogDescription>
            Set cost and charge rates for materials you supply.
          </DialogDescription>
        </DialogHeader>
        <form key={rate?.id ?? "new"} action={formAction} className="space-y-4">
          <input type="hidden" name="unit" value={unit} />
          <div className="space-y-2">
            <Label htmlFor="mat-name">Material name</Label>
            <Input id="mat-name" name="materialName" defaultValue={rate?.material_name ?? ""} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="mat-category">Category</Label>
            <Input id="mat-category" name="category" list="mat-categories" defaultValue={rate?.category ?? ""} />
            <datalist id="mat-categories">
              {MATERIAL_CATEGORIES.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
          <div className="space-y-2">
            <Label htmlFor="mat-supplier">Supplier</Label>
            <Input id="mat-supplier" name="supplier" defaultValue={rate?.supplier ?? ""} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="mat-cost">Cost rate</Label>
              <Input id="mat-cost" name="costRate" type="number" min={0} step="0.01" defaultValue={rate?.cost_rate ?? ""} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="mat-charge">Charge rate</Label>
              <Input id="mat-charge" name="chargeRate" type="number" min={0} step="0.01" defaultValue={rate?.charge_rate ?? ""} required />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Unit</Label>
            <Select value={unit} onValueChange={setUnit}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {RATE_UNITS.map((u) => (
                  <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {isEdit && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="isActive" value="true" defaultChecked={rate?.is_active} className="rounded border-input" />
              Active
            </label>
          )}
          {state.error && <p className="text-sm text-destructive">{state.error}</p>}
          <div className="flex gap-2">
            <Button type="submit" disabled={pending}>{pending ? "Saving…" : isEdit ? "Save changes" : "Add rate"}</Button>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
