"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { EstimateTrace } from "@/lib/cost-engine/estimate-trace";
import { rateSourceLabel } from "@/lib/cost-engine/rates/get-base-rate-for-scope";
import type { RateSource } from "@/lib/cost-engine/rates/get-base-rate-for-scope";
import { formatCurrency, formatCurrencyRange } from "@/lib/format-currency";

interface EstimateTracePanelProps {
  trace: EstimateTrace | null | undefined;
}

export function EstimateTracePanel({ trace }: EstimateTracePanelProps) {
  const [open, setOpen] = useState(false);

  if (!trace || (!trace.scopeKey && !trace.centralEstimate)) return null;

  const rateLabel =
    typeof trace.rateSource === "string" &&
    [
      "scope_rate",
      "org_rate",
      "package_rate",
      "template_benchmark",
      "regional_fallback",
      "placeholder",
    ].includes(trace.rateSource)
      ? rateSourceLabel(trace.rateSource as RateSource)
      : String(trace.rateSource);

  return (
    <div className="border-t pt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        {open ? (
          <ChevronDown className="h-3.5 w-3.5" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5" />
        )}
        Show calculation basis
      </button>

      {open && (
        <div className="mt-2 space-y-2 rounded-lg border border-dashed bg-muted/10 p-3 text-xs">
          <p>
            <span className="text-muted-foreground">Scope: </span>
            {trace.scopeKey}
            {trace.quantity > 0 && (
              <span>
                {" "}
                · {trace.quantity} {trace.unit} × ${Math.round(trace.baseRate)}/
                {trace.unit}
              </span>
            )}
          </p>

          <p>
            <span className="text-muted-foreground">Central estimate: </span>
            {formatCurrency(trace.centralEstimate)}
          </p>

          <p>
            <span className="text-muted-foreground">Rate source: </span>
            {rateLabel}
          </p>

          {(trace.finishAdjustments?.length ?? 0) > 0 && (
            <div>
              <p className="font-medium text-muted-foreground">Finish</p>
              <ul className="mt-0.5 space-y-0.5">
                {(trace.finishAdjustments ?? []).map((a) => (
                  <li key={a.label}>{a.label}</li>
                ))}
              </ul>
            </div>
          )}

          {(trace.constraintAdjustments?.length ?? 0) > 0 && (
            <div>
              <p className="font-medium text-muted-foreground">Constraints</p>
              <ul className="mt-0.5 space-y-0.5">
                {(trace.constraintAdjustments ?? []).map((a) => (
                  <li key={a.label}>{a.label}</li>
                ))}
              </ul>
            </div>
          )}

          <p>
            <span className="text-muted-foreground">Contingency: </span>
            {trace.contingencyPercent}%
          </p>

          <p>
            <span className="text-muted-foreground">Margin: </span>
            {trace.marginPercent}%
          </p>

          <p>
            <span className="text-muted-foreground">Confidence: </span>
            {trace.confidenceScore}/100 (±{Math.round((trace.rangeFactor ?? 0) * 100)}%)
          </p>

          <p>
            <span className="text-muted-foreground">Cost range: </span>
            {formatCurrencyRange(
              trace.finalCostRange?.low ?? null,
              trace.finalCostRange?.high ?? null
            )}
          </p>

          <p>
            <span className="text-muted-foreground">Sell range: </span>
            {formatCurrencyRange(
              trace.finalSellRange?.low ?? null,
              trace.finalSellRange?.high ?? null
            )}
          </p>

          {(trace.missingCriticalFacts?.length ?? 0) > 0 && (
            <div>
              <p className="font-medium text-muted-foreground">Missing facts</p>
              <ul className="mt-0.5 space-y-0.5">
                {(trace.missingCriticalFacts ?? []).map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
