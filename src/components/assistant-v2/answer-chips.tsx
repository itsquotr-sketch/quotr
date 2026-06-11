"use client";

import { cn } from "@/lib/utils";

interface AnswerChipsProps {
  options: { value: string; label: string }[];
  value?: string;
  onSelect: (value: string) => void;
  disabled?: boolean;
}

export function AnswerChips({
  options,
  value = "",
  onSelect,
  disabled = false,
}: AnswerChipsProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          disabled={disabled}
          onClick={() => onSelect(opt.value)}
          className={cn(
            "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
            value === opt.value
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-background hover:bg-muted",
            disabled && "pointer-events-none opacity-60"
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
