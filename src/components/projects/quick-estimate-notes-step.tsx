"use client";

import { useActionState, useEffect } from "react";
import { saveQuickEstimateNotes } from "@/actions/quick-estimate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { QuickEstimateActionState } from "@/lib/validations/quick-estimate";

const initialState: QuickEstimateActionState = {};

interface QuickEstimateNotesStepProps {
  projectId: string;
  defaultNotes?: string | null;
  defaultBudget?: number | null;
  onStepComplete: (step: number) => void;
}

export function QuickEstimateNotesStep({
  projectId,
  defaultNotes,
  defaultBudget,
  onStepComplete,
}: QuickEstimateNotesStepProps) {
  const boundAction = saveQuickEstimateNotes.bind(null, projectId);
  const [state, formAction, pending] = useActionState(
    boundAction,
    initialState
  );

  useEffect(() => {
    if (state.success && state.redirectStep) {
      onStepComplete(state.redirectStep);
    }
  }, [state.success, state.redirectStep, onStepComplete]);

  return (
    <form action={formAction} className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="sourceNotes">What do you know about this job?</Label>
        <Textarea
          id="sourceNotes"
          name="sourceNotes"
          defaultValue={defaultNotes ?? ""}
          rows={8}
          required
          placeholder="Example: Client wants bathroom renovated. Replace shower, vanity and toilet. Keep same layout. Possible water damage behind shower — needs checking."
          className="min-h-[160px] resize-y text-base"
        />
        {state.fieldErrors?.sourceNotes && (
          <p className="text-sm text-destructive">
            {state.fieldErrors.sourceNotes[0]}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="clientBudget">
          Client budget{" "}
          <span className="font-normal text-muted-foreground">(optional)</span>
        </Label>
        <Input
          id="clientBudget"
          name="clientBudget"
          type="number"
          min={0}
          step={100}
          defaultValue={defaultBudget ?? ""}
          placeholder="e.g. 25000"
          className="text-base"
        />
        {state.fieldErrors?.clientBudget && (
          <p className="text-sm text-destructive">
            {state.fieldErrors.clientBudget[0]}
          </p>
        )}
      </div>

      {state.error && (
        <p className="text-sm text-destructive">{state.error}</p>
      )}

      <Button type="submit" disabled={pending} className="w-full md:w-auto">
        {pending ? "Saving…" : "Continue"}
      </Button>
    </form>
  );
}
