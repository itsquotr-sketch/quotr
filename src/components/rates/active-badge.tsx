import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function ActiveBadge({ active }: { active: boolean }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "font-normal",
        active
          ? "border-primary/30 bg-primary/10 text-primary"
          : "text-muted-foreground"
      )}
    >
      {active ? "Active" : "Inactive"}
    </Badge>
  );
}
