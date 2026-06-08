"use client";

import { useActionState, useState } from "react";
import { completeOnboarding } from "@/actions/onboarding";
import type { OnboardingActionState } from "@/lib/validations/onboarding";
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
import {
  BUSINESS_TYPES,
  COMPANY_SIZES,
  QUOTING_VOLUMES,
} from "@/lib/constants/onboarding";

const initialState: OnboardingActionState = {};

function FieldError({
  errors,
}: {
  errors?: string[];
}) {
  if (!errors?.[0]) return null;
  return <p className="text-sm text-destructive">{errors[0]}</p>;
}

export function OnboardingForm() {
  const [state, formAction, pending] = useActionState(
    completeOnboarding,
    initialState
  );
  const [businessType, setBusinessType] = useState("");
  const [companySize, setCompanySize] = useState("");
  const [quotingVolume, setQuotingVolume] = useState("");

  return (
    <form action={formAction} className="space-y-8">
      <input type="hidden" name="businessType" value={businessType} />
      <input type="hidden" name="companySize" value={companySize} />
      <input type="hidden" name="quotingVolume" value={quotingVolume} />

      <section className="space-y-4">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            About you
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            So we know who&apos;s using Quotr on site.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="firstName">First name</Label>
            <Input id="firstName" name="firstName" autoComplete="given-name" required />
            <FieldError errors={state.fieldErrors?.firstName} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="lastName">Last name</Label>
            <Input id="lastName" name="lastName" autoComplete="family-name" required />
            <FieldError errors={state.fieldErrors?.lastName} />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="phone">Your phone</Label>
          <Input id="phone" name="phone" type="tel" autoComplete="tel" required />
          <FieldError errors={state.fieldErrors?.phone} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="jobTitle">Job title</Label>
          <Input
            id="jobTitle"
            name="jobTitle"
            placeholder="e.g. Director, Estimator, Site manager"
            required
          />
          <FieldError errors={state.fieldErrors?.jobTitle} />
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Your company
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            This sets up your workspace for projects and quotes.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="tradingName">Company / trading name</Label>
          <Input
            id="tradingName"
            name="tradingName"
            placeholder="Smith Building Co."
            required
          />
          <FieldError errors={state.fieldErrors?.tradingName} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="legalName">Legal name (optional)</Label>
          <Input
            id="legalName"
            name="legalName"
            placeholder="Smith Building Pty Ltd"
          />
          <FieldError errors={state.fieldErrors?.legalName} />
        </div>

        <div className="space-y-2">
          <Label>Business type</Label>
          <Select value={businessType} onValueChange={setBusinessType} required>
            <SelectTrigger>
              <SelectValue placeholder="Select business type" />
            </SelectTrigger>
            <SelectContent>
              {BUSINESS_TYPES.map((type) => (
                <SelectItem key={type.value} value={type.value}>
                  {type.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldError errors={state.fieldErrors?.businessType} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="primaryTrade">Primary trade</Label>
          <Input
            id="primaryTrade"
            name="primaryTrade"
            placeholder="e.g. General builder, Carpenter, Plumber"
            required
          />
          <FieldError errors={state.fieldErrors?.primaryTrade} />
        </div>

        <div className="space-y-2">
          <Label>Company size</Label>
          <Select value={companySize} onValueChange={setCompanySize} required>
            <SelectTrigger>
              <SelectValue placeholder="How many people?" />
            </SelectTrigger>
            <SelectContent>
              {COMPANY_SIZES.map((size) => (
                <SelectItem key={size.value} value={size.value}>
                  {size.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldError errors={state.fieldErrors?.companySize} />
        </div>

        <div className="space-y-2">
          <Label>Quotes per month</Label>
          <Select value={quotingVolume} onValueChange={setQuotingVolume} required>
            <SelectTrigger>
              <SelectValue placeholder="How many quotes do you send?" />
            </SelectTrigger>
            <SelectContent>
              {QUOTING_VOLUMES.map((volume) => (
                <SelectItem key={volume.value} value={volume.value}>
                  {volume.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldError errors={state.fieldErrors?.quotingVolume} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="companyPhone">Company phone</Label>
          <Input id="companyPhone" name="companyPhone" type="tel" required />
          <FieldError errors={state.fieldErrors?.companyPhone} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="companyEmail">Company email</Label>
          <Input
            id="companyEmail"
            name="companyEmail"
            type="email"
            autoComplete="email"
            required
          />
          <FieldError errors={state.fieldErrors?.companyEmail} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="website">Website (optional)</Label>
          <Input
            id="website"
            name="website"
            type="url"
            placeholder="https://"
          />
          <FieldError errors={state.fieldErrors?.website} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="city">City</Label>
            <Input id="city" name="city" required />
            <FieldError errors={state.fieldErrors?.city} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="region">Region</Label>
            <Input id="region" name="region" placeholder="e.g. NSW, Auckland" required />
            <FieldError errors={state.fieldErrors?.region} />
          </div>
        </div>
      </section>

      {state.error && (
        <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.error}
        </p>
      )}

      {state.success && (
        <p className="rounded-lg bg-primary/10 px-3 py-2 text-sm text-primary">
          {state.success}
        </p>
      )}

      <Button type="submit" className="w-full" size="lg" disabled={pending}>
        {pending ? "Setting up your workspace…" : "Complete setup"}
      </Button>
    </form>
  );
}
