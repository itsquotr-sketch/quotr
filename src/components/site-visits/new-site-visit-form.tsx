"use client";

import { useActionState, useState } from "react";
import { Camera, Plus, Trash2 } from "lucide-react";
import {
  createSiteVisit,
  type SiteVisitActionState,
} from "@/actions/site-visits";
import { Button } from "@/components/ui/button";
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
import { JOB_TYPES } from "@/lib/validations/site-visit";

const initialState: SiteVisitActionState = {};

interface Measurement {
  label: string;
  value: string;
  unit: string;
}

export function NewSiteVisitForm() {
  const [state, formAction, pending] = useActionState(
    createSiteVisit,
    initialState
  );
  const [jobType, setJobType] = useState<string>("");
  const [measurements, setMeasurements] = useState<Measurement[]>([
    { label: "", value: "", unit: "" },
  ]);
  const [photoPreview, setPhotoPreview] = useState<string[]>([]);

  function addMeasurement() {
    setMeasurements([...measurements, { label: "", value: "", unit: "" }]);
  }

  function removeMeasurement(index: number) {
    setMeasurements(measurements.filter((_, i) => i !== index));
  }

  function updateMeasurement(
    index: number,
    field: keyof Measurement,
    value: string
  ) {
    const updated = [...measurements];
    updated[index] = { ...updated[index], [field]: value };
    setMeasurements(updated);
  }

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    setPhotoPreview(files.map((f) => URL.createObjectURL(f)));
  }

  const validMeasurements = measurements.filter(
    (m) => m.label.trim() && m.value.trim()
  );

  return (
    <form action={formAction} className="space-y-6">
      <input
        type="hidden"
        name="measurements"
        value={JSON.stringify(
          validMeasurements.map((m) => ({
            label: m.label.trim(),
            value: m.value.trim(),
            unit: m.unit.trim() || undefined,
          }))
        )}
      />
      <input type="hidden" name="jobType" value={jobType} />

      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Visit details
        </h2>

        <div className="space-y-2">
          <Label htmlFor="title">Visit title</Label>
          <Input
            id="title"
            name="title"
            placeholder="e.g. Kitchen reno — Smith residence"
            required
          />
          {state.fieldErrors?.title && (
            <p className="text-sm text-destructive">{state.fieldErrors.title[0]}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="clientName">Client name</Label>
          <Input id="clientName" name="clientName" placeholder="Client name" required />
          {state.fieldErrors?.clientName && (
            <p className="text-sm text-destructive">
              {state.fieldErrors.clientName[0]}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="clientPhone">Client phone</Label>
          <Input
            id="clientPhone"
            name="clientPhone"
            type="tel"
            placeholder="04xx xxx xxx"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="siteAddress">Site address</Label>
          <Input
            id="siteAddress"
            name="siteAddress"
            placeholder="Street address"
            required
          />
          {state.fieldErrors?.siteAddress && (
            <p className="text-sm text-destructive">
              {state.fieldErrors.siteAddress[0]}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label>Job type</Label>
          <Select value={jobType} onValueChange={setJobType} required>
            <SelectTrigger>
              <SelectValue placeholder="Select job type" />
            </SelectTrigger>
            <SelectContent>
              {JOB_TYPES.map((type) => (
                <SelectItem key={type} value={type}>
                  {type}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {state.fieldErrors?.jobType && (
            <p className="text-sm text-destructive">{state.fieldErrors.jobType[0]}</p>
          )}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Notes
        </h2>
        <Textarea
          name="notes"
          placeholder="What did you see on site? Scope, issues, access, materials…"
          rows={5}
        />
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Quick measurements
          </h2>
          <Button type="button" variant="ghost" size="sm" onClick={addMeasurement}>
            <Plus className="h-4 w-4" />
            Add
          </Button>
        </div>

        <div className="space-y-3">
          {measurements.map((m, index) => (
            <div key={index} className="space-y-2 rounded-lg border p-3">
              <Input
                placeholder="Label (e.g. Kitchen width)"
                value={m.label}
                onChange={(e) => updateMeasurement(index, "label", e.target.value)}
              />
              <div className="flex gap-2">
                <Input
                  placeholder="Value"
                  value={m.value}
                  onChange={(e) => updateMeasurement(index, "value", e.target.value)}
                  className="flex-1"
                />
                <Input
                  placeholder="Unit"
                  value={m.unit}
                  onChange={(e) => updateMeasurement(index, "unit", e.target.value)}
                  className="w-24"
                />
                {measurements.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeMeasurement(index)}
                  >
                    <Trash2 className="h-4 w-4 text-muted-foreground" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Photos
        </h2>

        <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-input bg-muted/30 px-6 py-10 transition-colors hover:bg-muted/50">
          <Camera className="mb-3 h-8 w-8 text-muted-foreground" />
          <span className="text-sm font-medium">Tap to add photos</span>
          <span className="mt-1 text-xs text-muted-foreground">
            Take photos or choose from gallery
          </span>
          <input
            type="file"
            name="photos"
            accept="image/*"
            capture="environment"
            multiple
            className="hidden"
            onChange={handlePhotoChange}
          />
        </label>

        {photoPreview.length > 0 && (
          <div className="grid grid-cols-3 gap-2">
            {photoPreview.map((src, i) => (
              <div
                key={i}
                className="aspect-square overflow-hidden rounded-lg border bg-muted"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt={`Preview ${i + 1}`} className="h-full w-full object-cover" />
              </div>
            ))}
          </div>
        )}
      </section>

      {state.error && (
        <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.error}
        </p>
      )}

      <Button type="submit" className="w-full" size="lg" disabled={pending}>
        {pending ? "Saving visit…" : "Save site visit"}
      </Button>
    </form>
  );
}
