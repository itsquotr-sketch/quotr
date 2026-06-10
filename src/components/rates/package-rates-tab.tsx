"use client";

import { useActionState, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import {
  createPackageRate,
  deletePackageRate,
  updatePackageRate,
} from "@/actions/rates";
import { ActiveBadge } from "@/components/rates/active-badge";
import { RateRangeInput } from "@/components/rates/rate-range-input";
import {
  formatPackageCostRange,
  formatPackageSellRange,
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
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PACKAGE_WORK_AREA_TYPES, RATE_UNITS } from "@/lib/constants/rates";
import { packageCostRange, packageSellRange } from "@/lib/rate-ranges";
import type { RateActionState } from "@/lib/validations/rates";
import type { PackageRate } from "@/types/database";

interface PackageRatesTabProps {
  rates: PackageRate[];
}

export function PackageRatesTab({ rates }: PackageRatesTabProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PackageRate | null>(null);
  const [deletePending, startDelete] = useTransition();

  const filtered = useMemo(
    () =>
      rates.filter((r) =>
        matchesSearch(
          search,
          r.package_name,
          r.work_area_type,
          r.description,
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
            placeholder="Search packages…"
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
          Add package rate
        </Button>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
          {rates.length === 0
            ? "No package rates yet. Add bundled pricing with low, typical, and high cost/sell bands."
            : "No packages match your search."}
        </div>
      ) : (
        <div className="rounded-xl border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Package</TableHead>
                <TableHead>Work area</TableHead>
                <TableHead>Cost (low / typical / high)</TableHead>
                <TableHead>Sell (low / typical / high)</TableHead>
                <TableHead>Margin</TableHead>
                <TableHead>Unit</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((rate) => (
                <TableRow key={rate.id}>
                  <TableCell className="font-medium">{rate.package_name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {rate.work_area_type ?? "—"}
                  </TableCell>
                  <TableCell className="text-sm">
                    {formatPackageCostRange(rate)}
                  </TableCell>
                  <TableCell className="text-sm">
                    {formatPackageSellRange(rate)}
                  </TableCell>
                  <TableCell>
                    {rate.default_margin != null
                      ? `${Number(rate.default_margin)}%`
                      : "—"}
                  </TableCell>
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
                          if (!window.confirm(`Delete "${rate.package_name}"?`)) return;
                          startDelete(async () => {
                            await deletePackageRate(rate.id);
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

      <PackageRateDialog
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

function PackageRateDialog({
  open,
  onOpenChange,
  rate,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rate: PackageRate | null;
  onSuccess: () => void;
}) {
  const isEdit = Boolean(rate);
  const action = isEdit
    ? updatePackageRate.bind(null, rate!.id)
    : createPackageRate;
  const [state, formAction, pending] = useActionState(action, {} as RateActionState);
  const [unit, setUnit] = useState(rate?.unit ?? "each");
  const [workAreaType, setWorkAreaType] = useState(rate?.work_area_type ?? "");

  const cost = rate ? packageCostRange(rate) : null;
  const sell = rate ? packageSellRange(rate) : null;

  useEffect(() => {
    if (state.success) onSuccess();
  }, [state.success, onSuccess]);

  useEffect(() => {
    if (open) {
      setUnit(rate?.unit ?? "each");
      setWorkAreaType(rate?.work_area_type ?? "");
    }
  }, [open, rate?.unit, rate?.work_area_type]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="normal-case tracking-normal">
            {isEdit ? "Edit package rate" : "Add package rate"}
          </DialogTitle>
          <DialogDescription>
            Bundled base cost and sell with low, typical, and high bands.
          </DialogDescription>
        </DialogHeader>
        <form key={rate?.id ?? "new"} action={formAction} className="space-y-4">
          <input type="hidden" name="unit" value={unit} />
          <input type="hidden" name="workAreaType" value={workAreaType} />

          <div className="space-y-2">
            <Label htmlFor="pkg-name">Package name</Label>
            <Input
              id="pkg-name"
              name="packageName"
              defaultValue={rate?.package_name ?? ""}
              placeholder="e.g. Timber Deck"
              required
            />
          </div>

          <div className="space-y-2">
            <Label>Work area type</Label>
            <Select
              value={workAreaType || "none"}
              onValueChange={(v) => setWorkAreaType(v === "none" ? "" : v)}
            >
              <SelectTrigger><SelectValue placeholder="Select work area" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Not specified</SelectItem>
                {PACKAGE_WORK_AREA_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="pkg-desc">Description</Label>
            <Textarea id="pkg-desc" name="description" rows={2} defaultValue={rate?.description ?? ""} />
          </div>

          <RateRangeInput
            label="Base cost"
            namePrefix="BaseCost"
            lowDefault={cost?.low}
            typicalDefault={cost?.typical}
            highDefault={cost?.high}
          />

          <RateRangeInput
            label="Base sell"
            namePrefix="BaseSell"
            lowDefault={sell?.low}
            typicalDefault={sell?.typical}
            highDefault={sell?.high}
          />

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="pkg-margin">Default margin (%)</Label>
              <Input
                id="pkg-margin"
                name="defaultMargin"
                type="number"
                min={0}
                max={100}
                step="0.1"
                defaultValue={rate?.default_margin ?? ""}
              />
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
          </div>

          {isEdit && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="isActive" value="true" defaultChecked={rate?.is_active} className="rounded border-input" />
              Active
            </label>
          )}
          {!isEdit && <input type="hidden" name="isActive" value="true" />}

          {state.error && <p className="text-sm text-destructive">{state.error}</p>}
          <div className="flex gap-2">
            <Button type="submit" disabled={pending}>{pending ? "Saving…" : isEdit ? "Save changes" : "Add package"}</Button>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
