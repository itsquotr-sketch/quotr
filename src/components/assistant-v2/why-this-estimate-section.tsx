"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import type { EstimateTrace as CalculationTrace } from "@/lib/cost-engine/trace/types";
import {
  formatTraceForUi,
  type FormattedEstimateTrace,
} from "@/lib/cost-engine/trace/format-trace-for-ui";

type WhyThisEstimateSectionProps = {
  calculationTrace: CalculationTrace | null;
  defaultOpen?: boolean;
  openRequest?: number;
};

function formatCurrencyCompact(value: number): string {
  return value.toLocaleString("en-NZ", {
    style: "currency",
    currency: "NZD",
    maximumFractionDigits: 0,
  });
}

export function WhyThisEstimateSection({
  calculationTrace,
  defaultOpen = false,
  openRequest = 0,
}: WhyThisEstimateSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    if (openRequest > 0) {
      setOpen(true);
    }
  }, [openRequest]);

  const formatted: FormattedEstimateTrace | null = useMemo(() => {
    if (!calculationTrace?.scopes.length) return null;
    return formatTraceForUi(calculationTrace);
  }, [calculationTrace]);

  if (!formatted) return null;

  const showOpen = open || openRequest > 0;

  return (
    <div className="border-t pt-3">
      {!showOpen ? (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">{formatted.summaryLine}</p>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="text-xs font-medium text-primary hover:underline"
          >
            Show why
          </button>
        </div>
      ) : (
        <div className="space-y-4 text-xs">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="flex w-full items-center justify-between text-left"
          >
            <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Why this estimate?
            </span>
            <ChevronDown className="h-4 w-4 rotate-180 text-muted-foreground" />
          </button>

          <p className="text-muted-foreground">{formatted.summaryLine}</p>

          {formatted.mainCostDrivers.length > 0 && (
            <div>
              <p className="font-medium text-foreground">Main cost drivers</p>
              <ul className="mt-1 space-y-0.5 text-muted-foreground">
                {formatted.mainCostDrivers.map((driver) => (
                  <li key={driver}>• {driver}</li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <p className="font-medium text-foreground">Breakdown by scope</p>
            <div className="mt-2 space-y-3">
              {formatted.scopes.map((scope) => (
                <div
                  key={scope.scopeName}
                  className="rounded-lg border bg-muted/20 px-3 py-2"
                >
                  <p className="font-medium text-foreground">{scope.scopeName}</p>
                  <p className="mt-1 text-muted-foreground">
                    Cost:{" "}
                    <span className="text-foreground">{scope.costRange}</span>
                  </p>
                  <p className="text-muted-foreground">
                    Sell:{" "}
                    <span className="text-foreground">{scope.sellRange}</span>
                  </p>
                  {scope.quantity && (
                    <p className="text-muted-foreground">
                      Quantity:{" "}
                      <span className="text-foreground">{scope.quantity}</span>
                    </p>
                  )}
                  <p className="text-muted-foreground">
                    Rate:{" "}
                    <span className="text-foreground">{scope.rateSource}</span>
                  </p>
                  {scope.topDrivers.length > 0 && (
                    <div className="mt-2">
                      <p className="font-medium text-foreground">Main drivers</p>
                      <ul className="mt-0.5 space-y-0.5 text-muted-foreground">
                        {scope.topDrivers.map((driver) => (
                          <li key={driver}>• {driver}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {scope.missingKey && (
                    <p className="mt-2 text-muted-foreground">
                      Missing:{" "}
                      <span className="text-foreground">{scope.missingKey}</span>
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div>
            <p className="font-medium text-foreground">Cost allocation</p>
            <ul className="mt-1.5 space-y-1">
              {(
                [
                  ["Labour", formatted.totalAllocations.labour],
                  ["Materials", formatted.totalAllocations.materials],
                  ["Subcontractors", formatted.totalAllocations.subcontractors],
                  ["Allowances", formatted.totalAllocations.allowances],
                  ["Contingency", formatted.totalAllocations.contingency],
                ] as const
              )
                .filter(([, amount]) => amount > 0)
                .map(([label, amount]) => (
                  <li key={label} className="flex justify-between gap-2">
                    <span className="text-muted-foreground">{label}</span>
                    <span>{formatCurrencyCompact(amount)}</span>
                  </li>
                ))}
            </ul>
            <p className="mt-2 text-[10px] text-muted-foreground">
              Indicative allocation only — not a detailed quote.
            </p>
          </div>

          {formatted.assumptions.length > 0 && (
            <div>
              <p className="font-medium text-foreground">Assumptions</p>
              <ul className="mt-1 space-y-0.5 text-muted-foreground">
                {formatted.assumptions.map((item) => (
                  <li key={item}>• {item}</li>
                ))}
              </ul>
            </div>
          )}

          {formatted.exclusions.length > 0 && (
            <div>
              <p className="font-medium text-foreground">Not included</p>
              <ul className="mt-1 space-y-0.5 text-muted-foreground">
                {formatted.exclusions.map((item) => (
                  <li key={item}>• {item}</li>
                ))}
              </ul>
            </div>
          )}

          {formatted.rateSourceSummary.length > 0 && (
            <div>
              <p className="font-medium text-foreground">Rate source</p>
              <ul className="mt-1 space-y-0.5 text-muted-foreground">
                {formatted.rateSourceSummary.map((line) => (
                  <li key={line}>• {line}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
