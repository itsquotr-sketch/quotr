"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Briefcase,
  Calculator,
  ClipboardList,
  HardHat,
  Home,
  Layers,
  MapPin,
  Settings,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/dashboard", label: "Home", icon: Home },
  { href: "/site-visits", label: "Visits", icon: MapPin },
  { href: "/jobs", label: "Jobs", icon: Briefcase },
  { href: "/estimates", label: "Estimates", icon: Calculator },
  { href: "/settings", label: "More", icon: Settings },
];

const moreItems = [
  { href: "/rates", label: "Rates", icon: ClipboardList },
  { href: "/assemblies", label: "Assemblies", icon: Layers },
  { href: "/subcontractors", label: "Subbies", icon: Users },
];

export function BottomNav() {
  const pathname = usePathname();
  const isMoreSection = moreItems.some((item) => pathname.startsWith(item.href));

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto flex h-16 max-w-lg items-center justify-around px-2 pb-safe">
        {navItems.map((item) => {
          const isActive =
            item.href === "/settings"
              ? pathname.startsWith("/settings") || isMoreSection
              : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex min-w-[56px] flex-col items-center gap-1 rounded-lg px-2 py-1.5 text-xs transition-colors",
                isActive
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <item.icon className={cn("h-5 w-5", isActive && "stroke-[2.5]")} />
              <span className="font-medium">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export function SettingsNavLinks() {
  const pathname = usePathname();

  const links = [
    { href: "/rates", label: "Rates", description: "Your labour and material rates", icon: ClipboardList },
    { href: "/assemblies", label: "Assemblies", description: "Reusable build-up items", icon: Layers },
    { href: "/subcontractors", label: "Subcontractors", description: "Your trade contacts", icon: Users },
    { href: "/settings", label: "Settings", description: "Account and business", icon: Settings },
  ];

  return (
    <div className="space-y-2">
      {links.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className={cn(
            "flex items-center gap-4 rounded-xl border p-4 transition-colors hover:bg-accent",
            pathname === link.href && "border-primary bg-accent"
          )}
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
            <link.icon className="h-5 w-5 text-muted-foreground" />
          </div>
          <div>
            <p className="font-medium">{link.label}</p>
            <p className="text-sm text-muted-foreground">{link.description}</p>
          </div>
        </Link>
      ))}
    </div>
  );
}

export function AppLogo() {
  return (
    <div className="flex items-center gap-2">
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
        <HardHat className="h-4 w-4 text-primary-foreground" />
      </div>
      <span className="text-lg font-bold tracking-tight">Quotr</span>
    </div>
  );
}
