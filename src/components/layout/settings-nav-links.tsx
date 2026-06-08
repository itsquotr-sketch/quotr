"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { mobileMoreItems } from "@/components/layout/nav-config";
import { cn } from "@/lib/utils";

export function SettingsNavLinks() {
  const pathname = usePathname();

  return (
    <div className="space-y-2">
      {mobileMoreItems.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className={cn(
            "flex items-center gap-4 rounded-xl border p-4 transition-colors hover:bg-accent",
            pathname.startsWith(link.href) && "border-primary bg-accent"
          )}
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
            <link.icon className="h-5 w-5 text-muted-foreground" />
          </div>
          <div>
            <p className="font-medium">{link.label}</p>
          </div>
        </Link>
      ))}
    </div>
  );
}
