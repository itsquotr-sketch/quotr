import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface AssistantSectionProps {
  title: string;
  children: ReactNode;
  className?: string;
}

export function AssistantSection({
  title,
  children,
  className,
}: AssistantSectionProps) {
  return (
    <section className={cn("rounded-lg border bg-card", className)}>
      <div className="border-b px-3 py-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </h3>
      </div>
      <div className="p-3">{children}</div>
    </section>
  );
}
