"use client";

import { useActionState, useState } from "react";
import { Camera, FileUp, Plus, Trash2 } from "lucide-react";
import { createScope } from "@/actions/scopes";
import type { ScopeActionState } from "@/lib/validations/scope";
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
import type { ScopeType } from "@/types/database";

interface Measurement {
  label: string;
  value: string;
  unit: string;
}

interface AddScopeFormProps {
  projectId: string;
  scopeTypes: ScopeType[];
}

export function AddScopeForm({ projectId, scopeTypes }: AddScopeFormProps) {
  const boundAction = createScope.bind(null, projectId);
  const [state, formAction, pending] = useActionState(boundAction, {} as ScopeActionState);

  const [isCustom, setIsCustom] = useState(false);
  const [scopeTypeId, setScopeTypeId] = useState("");
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
      <input type="hidden" name="isCustom" value={String(isCustom)} />
      <input type="hidden" name="scopeTypeId" value={isCustom ? "" : scopeTypeId} />
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

      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Scope type
        </h2>

        <div className="flex gap-2">
          <Button
            type="button"
            variant={!isCustom ? "default" : "outline"}
            className="flex-1"
            onClick={() => setIsCustom(false)}
          >
            From list
          </Button>
          <Button
            type="button"
            variant={isCustom ? "default" : "outline"}
            className="flex-1"
            onClick={() => setIsCustom(true)}
          >
            Custom scope
          </Button>
        </div>

        {isCustom ? (
          <div className="space-y-2">
            <Label htmlFor="customScopeName">Custom scope name</Label>
            <Input
              id="customScopeName"
              name="customScopeName"
              placeholder="e.g. Pool cabana"
            />
            {state.fieldErrors?.customScopeName && (
              <p className="text-sm text-destructive">
                {state.fieldErrors.customScopeName[0]}
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <Label>Scope type</Label>
            <Select value={scopeTypeId} onValueChange={setScopeTypeId}>
              <SelectTrigger>
                <SelectValue placeholder="Select scope of work" />
              </SelectTrigger>
              <SelectContent>
                {scopeTypes.map((type) => (
                  <SelectItem key={type.id} value={type.id}>
                    {type.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {state.fieldErrors?.scopeTypeId && (
              <p className="text-sm text-destructive">
                {state.fieldErrors.scopeTypeId[0]}
              </p>
            )}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Scope details
        </h2>

        <div className="space-y-2">
          <Label htmlFor="locationArea">Location / area</Label>
          <Input
            id="locationArea"
            name="locationArea"
            placeholder="e.g. Ground floor bathroom"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="description">Description</Label>
          <Textarea
            id="description"
            name="description"
            placeholder="What work is included in this scope?"
            rows={3}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="notes">Notes</Label>
          <Textarea
            id="notes"
            name="notes"
            placeholder="Site conditions, finishes, exclusions…"
            rows={4}
          />
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Measurements
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
                placeholder="Label"
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

      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Documents
        </h2>
        <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-input bg-muted/30 px-6 py-8 transition-colors hover:bg-muted/50">
          <FileUp className="mb-3 h-7 w-7 text-muted-foreground" />
          <span className="text-sm font-medium">Upload plans or specs</span>
          <input
            type="file"
            name="documents"
            accept=".pdf,.doc,.docx,image/*"
            multiple
            className="hidden"
          />
        </label>
      </section>

      {state.error && (
        <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.error}
        </p>
      )}

      <Button type="submit" className="w-full" size="lg" disabled={pending}>
        {pending ? "Saving scope…" : "Add scope of work"}
      </Button>
    </form>
  );
}
