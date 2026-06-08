"use client";

import { useActionState } from "react";
import {
  createOrganisation,
  type OnboardingActionState,
} from "@/actions/onboarding";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: OnboardingActionState = {};

export function OnboardingForm() {
  const [state, formAction, pending] = useActionState(
    createOrganisation,
    initialState
  );

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="organisationName">Business name</Label>
        <Input
          id="organisationName"
          name="organisationName"
          type="text"
          placeholder="Smith Building Co."
          autoFocus
          required
        />
        {state.fieldErrors?.organisationName && (
          <p className="text-sm text-destructive">
            {state.fieldErrors.organisationName[0]}
          </p>
        )}
      </div>

      {state.error && (
        <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.error}
        </p>
      )}

      <Button type="submit" className="w-full" size="lg" disabled={pending}>
        {pending ? "Setting up…" : "Get started"}
      </Button>
    </form>
  );
}
