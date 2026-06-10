"use client";

import { useActionState, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import {
  createSubcontractorRate,
  deleteSubcontractorRate,
  updateSubcontractorRate,
} from "@/actions/rates";
import { ActiveBadge } from "@/components/rates/active-badge";
import { RateRangeInput } from "@/components/rates/rate-range-input";
import {
  formatSubcontractorChargeRange,
  formatSubcontractorCostRange,
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
import { RATE_CONFIDENCE_LEVELS, RATE_UNITS } from "@/lib/constants/rates";
import {
  subcontractorChargeRange,
  subcontractorCostRange,
} from "@/lib/rate-ranges";
import type { RateActionState } from "@/lib/validations/rates";
import type { SubcontractorRate } from "@/types/database";

const TRADE_SUGGESTIONS = [
  "Plumber",
  "Electrician",
  "Waterproofer",
  "Tiler",
  "Painter",
  "Drainlayer",
  "Earthworks",
  "Engineer",
];

interface SubcontractorRatesTabProps {
  rates: SubcontractorRate[];
}

export function SubcontractorRatesTab({ rates }: SubcontractorRatesTabProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<SubcontractorRate | null>(null);
  const [deletePending, startDelete] = useTransition();

  const filtered = useMemo(
    () =>
      rates.filter((r) =>
        matchesSearch(search, r.trade, r.description, r.unit)
      ),
    [rates, search]
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search subcontractor rates…"
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
          Add subcontractor rate
        </Button>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
          {rates.length === 0
            ? "No subcontractor rates yet. Add trades with low, typical, and high cost/charge bands."
            : "No rates match your search."}
        </div>
      ) : (
        <div className="rounded-xl border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Trade</TableHead>
                <TableHead>Cost (low / typical / high)</TableHead>
                <TableHead>Charge (low / typical / high)</TableHead>
                <TableHead>Unit</TableHead>
                <TableHead>Confidence</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((rate) => (
                <TableRow key={rate.id}>
                  <TableCell>
                    <p className="font-medium">{rate.trade}</p>
                    {rate.description && (
                      <p className="mt-0.5 max-w-[180px] truncate text-xs text-muted-foreground">
                        {rate.description}
                      </p>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">
                    {formatSubcontractorCostRange(rate)}
                  </TableCell>
                  <TableCell className="text-sm">
                    {formatSubcontractorChargeRange(rate)}
                  </TableCell>
                  <TableCell>{unitLabel(rate.unit)}</TableCell>
                  <TableCell className="capitalize">
                    {rate.default_confidence ?? "medium"}
                  </TableCell>
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
                          if (!window.confirm(`Delete "${rate.trade}"?`)) return;
                          startDelete(async () => {
                            await deleteSubcontractorRate(rate.id);
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

      <SubcontractorRateDialog
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

function SubcontractorRateDialog({
  open,
  onOpenChange,
  rate,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rate: SubcontractorRate | null;
  onSuccess: () => void;
}) {
  const isEdit = Boolean(rate);
  const action = isEdit
    ? updateSubcontractorRate.bind(null, rate!.id)
    : createSubcontractorRate;
  const [state, formAction, pending] = useActionState(action, {} as RateActionState);
  const [unit, setUnit] = useState(rate?.unit ?? "hour");
  const [confidence, setConfidence] = useState(rate?.default_confidence ?? "medium");

  const cost = rate ? subcontractorCostRange(rate) : null;
  const charge = rate ? subcontractorChargeRange(rate) : null;

  useEffect(() => {
    if (state.success) onSuccess();
  }, [state.success, onSuccess]);

  useEffect(() => {
    if (open) {
      setUnit(rate?.unit ?? "hour");
      setConfidence(rate?.default_confidence ?? "medium");
    }
  }, [open, rate?.unit, rate?.default_confidence]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="normal-case tracking-normal">
            {isEdit ? "Edit subcontractor rate" : "Add subcontractor rate"}
          </DialogTitle>
          <DialogDescription>
            Set low, typical, and high cost and charge rates for estimating ranges.
          </DialogDescription>
        </DialogHeader>
        <form key={rate?.id ?? "new"} action={formAction} className="space-y-4">
          <input type="hidden" name="unit" value={unit} />
          <input type="hidden" name="defaultConfidence" value={confidence} />

          <div className="space-y-2">
            <Label htmlFor="sub-trade">Trade</Label>
            <Input
              id="sub-trade"
              name="trade"
              list="sub-trades"
              defaultValue={rate?.trade ?? ""}
              required
            />
            <datalist id="sub-trades">
              {TRADE_SUGGESTIONS.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </div>

          <div className="space-y-2">
            <Label htmlFor="sub-desc">Description</Label>
            <Textarea
              id="sub-desc"
              name="description"
              rows={2}
              defaultValue={rate?.description ?? ""}
            />
          </div>

          <RateRangeInput
            label="Cost rate"
            namePrefix="CostRate"
            lowDefault={cost?.low}
            typicalDefault={cost?.typical}
            highDefault={cost?.high}
          />

          <RateRangeInput
            label="Charge rate"
            namePrefix="ChargeRate"
            lowDefault={charge?.low}
            typicalDefault={charge?.typical}
            highDefault={charge?.high}
          />

          <div className="grid grid-cols-2 gap-4">
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
            <div className="space-y-2">
              <Label>Default confidence</Label>
              <Select value={confidence} onValueChange={setConfidence}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {RATE_CONFIDENCE_LEVELS.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
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
            <Button type="submit" disabled={pending}>{pending ? "Saving…" : isEdit ? "Save changes" : "Add rate"}</Button>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
