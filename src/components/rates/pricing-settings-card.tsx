"use client";

import { useActionState } from "react";
import { updatePricingSettings } from "@/actions/rates";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { RateActionState } from "@/lib/validations/rates";
import type { OrganisationPricingSettings } from "@/types/database";

interface PricingSettingsCardProps {
  settings: OrganisationPricingSettings;
}

export function PricingSettingsCard({ settings }: PricingSettingsCardProps) {
  const [state, formAction, pending] = useActionState(
    updatePricingSettings,
    {} as RateActionState
  );

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="text-base font-semibold normal-case tracking-normal">
          Pricing settings
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Default margin, contingency, and GST applied across your estimates.
        </p>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-2">
            <Label htmlFor="defaultMarginPercent">Default margin (%)</Label>
            <Input
              id="defaultMarginPercent"
              name="defaultMarginPercent"
              type="number"
              min={0}
              max={100}
              step="0.1"
              defaultValue={Number(settings.default_margin_percent)}
              required
            />
            {state.fieldErrors?.defaultMarginPercent && (
              <p className="text-sm text-destructive">
                {state.fieldErrors.defaultMarginPercent[0]}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="contingencyPercent">Contingency (%)</Label>
            <Input
              id="contingencyPercent"
              name="contingencyPercent"
              type="number"
              min={0}
              max={100}
              step="0.1"
              defaultValue={Number(settings.contingency_percent)}
              required
            />
            {state.fieldErrors?.contingencyPercent && (
              <p className="text-sm text-destructive">
                {state.fieldErrors.contingencyPercent[0]}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="gstPercent">GST (%)</Label>
            <Input
              id="gstPercent"
              name="gstPercent"
              type="number"
              min={0}
              max={100}
              step="0.1"
              defaultValue={Number(settings.gst_percent)}
              required
            />
            {state.fieldErrors?.gstPercent && (
              <p className="text-sm text-destructive">
                {state.fieldErrors.gstPercent[0]}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="currency">Currency</Label>
            <Input
              id="currency"
              name="currency"
              defaultValue={settings.currency}
              maxLength={3}
              required
              className="uppercase"
            />
            {state.fieldErrors?.currency && (
              <p className="text-sm text-destructive">
                {state.fieldErrors.currency[0]}
              </p>
            )}
          </div>
          <div className="sm:col-span-2 lg:col-span-4 flex flex-col gap-2 sm:flex-row sm:items-center">
            <Button type="submit" disabled={pending} size="sm">
              {pending ? "Saving…" : "Save settings"}
            </Button>
            {state.message && (
              <p className="text-sm text-primary">{state.message}</p>
            )}
            {state.error && (
              <p className="text-sm text-destructive">{state.error}</p>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
