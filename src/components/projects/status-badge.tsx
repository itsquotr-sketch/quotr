import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface StatusBadgeProps {
  label: string;
  className?: string;
}

export function StatusBadge({ label, className }: StatusBadgeProps) {
  return (
    <Badge
      variant="secondary"
      className={cn(
        "rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium normal-case tracking-normal",
        className
      )}
    >
      {label}
    </Badge>
  );
}
