"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export function AssistantV2NextSteps({ estimateReady }: { estimateReady: boolean }) {
  const [open, setOpen] = useState(false);

  if (!estimateReady) return null;

  return (
    <div className="border-t pt-3">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between text-left"
      >
        <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          Next steps
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 text-muted-foreground transition-transform",
            open && "rotate-180"
          )}
        />
      </button>
      {open && (
        <p className="mt-2 text-xs text-muted-foreground">
          Refine this draft with more site detail, then export or share when you
          are ready.
        </p>
      )}
    </div>
  );
}
