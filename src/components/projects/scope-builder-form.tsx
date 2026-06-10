"use client";

import { useActionState, useEffect, useState } from "react";
import { saveScopeBuilderInput } from "@/actions/scope-builder";
import { SCOPE_BUILDER_INPUT_TYPES } from "@/lib/constants/scope-builder";
import type { ScopeBuilderActionState } from "@/lib/validations/scope-builder";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const initialState: ScopeBuilderActionState = {};

const CONTENT_PLACEHOLDER =
  "Example: Client wants bathroom renovated. Replace shower, vanity and toilet. Keep same layout. Tile floor and shower walls. Allow for demo, waterproofing, plumbing and electrical.";

interface ScopeBuilderFormProps {
  projectId: string;
}

export function ScopeBuilderForm({ projectId }: ScopeBuilderFormProps) {
  const boundAction = saveScopeBuilderInput.bind(null, projectId);
  const [state, formAction, pending] = useActionState(
    boundAction,
    initialState
  );
  const [inputType, setInputType] = useState("");
  const [formKey, setFormKey] = useState(0);

  useEffect(() => {
    if (state.success) {
      setInputType("");
      setFormKey((key) => key + 1);
    }
  }, [state.success]);

  return (
    <form key={formKey} action={formAction} className="space-y-4">
      <input type="hidden" name="inputType" value={inputType} />

      <div className="space-y-2">
        <Label htmlFor="scope-builder-input-type">What kind of note is this?</Label>
        <Select value={inputType} onValueChange={setInputType} required>
          <SelectTrigger id="scope-builder-input-type">
            <SelectValue placeholder="Choose a note type" />
          </SelectTrigger>
          <SelectContent>
            {SCOPE_BUILDER_INPUT_TYPES.map((type) => (
              <SelectItem key={type.value} value={type.value}>
                {type.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {state.fieldErrors?.inputType && (
          <p className="text-sm text-destructive">
            {state.fieldErrors.inputType[0]}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="scope-builder-content">What do you know about this job?</Label>
        <Textarea
          id="scope-builder-content"
          name="content"
          placeholder={CONTENT_PLACEHOLDER}
          rows={6}
          required
          className="min-h-[140px] resize-y"
        />
        {state.fieldErrors?.content && (
          <p className="text-sm text-destructive">
            {state.fieldErrors.content[0]}
          </p>
        )}
      </div>

      {state.error && (
        <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.error}
        </p>
      )}

      {state.success && (
        <p className="rounded-lg bg-primary/10 px-3 py-2 text-sm text-primary">
          {state.message ?? "Project notes saved."}
        </p>
      )}

      <Button type="submit" className="w-full sm:w-auto" disabled={pending}>
        {pending ? "Saving…" : "Save Project Notes"}
      </Button>
    </form>
  );
}
