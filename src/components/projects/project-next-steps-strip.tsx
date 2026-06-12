"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

const NEXT_STEPS = [
  { label: "Detailed estimate", note: "coming later" },
  { label: "RFQs", note: "coming later" },
  { label: "Quote", note: "coming later" },
];

export function ProjectNextStepsStrip() {
  const [open, setOpen] = useState(false);

  return (
    <section className="mb-6">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between rounded-xl border bg-card px-4 py-3 text-left shadow-sm"
      >
        <span className="text-sm font-medium text-muted-foreground">Next steps</span>
        <ChevronDown
          className={cn(
            "h-4 w-4 text-muted-foreground transition-transform",
            open && "rotate-180"
          )}
        />
      </button>
      {open && (
        <ul className="mt-2 space-y-1 rounded-xl border bg-card px-4 py-3 text-sm text-muted-foreground">
          {NEXT_STEPS.map((step) => (
            <li key={step.label}>
              {step.label} — {step.note}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
