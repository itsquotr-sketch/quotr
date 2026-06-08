import {
  Briefcase,
  Calculator,
  ClipboardList,
  FileText,
  Home,
  Layers,
  LayoutDashboard,
  MessageSquareQuote,
  Settings,
  Users,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  matchPaths?: string[];
  excludePaths?: string[];
}

export const desktopNavItems: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/projects", label: "Projects", icon: Briefcase },
  { href: "/estimates", label: "Estimates", icon: Calculator },
  { href: "/quotes", label: "Quotes", icon: FileText },
  { href: "/rates", label: "Rates", icon: ClipboardList },
  { href: "/assemblies", label: "Assemblies", icon: Layers },
  { href: "/subcontractors", label: "Subcontractors", icon: Users },
  { href: "/rfqs", label: "RFQs", icon: MessageSquareQuote },
  { href: "/settings", label: "Settings", icon: Settings },
];

export const mobileNavItems: NavItem[] = [
  { href: "/dashboard", label: "Home", icon: Home },
  {
    href: "/projects",
    label: "Projects",
    icon: Briefcase,
    excludePaths: ["/projects/new"],
  },
  {
    href: "/projects/new",
    label: "Capture",
    icon: ClipboardList,
    matchPaths: ["/projects/new"],
  },
  { href: "/estimates", label: "Estimates", icon: Calculator },
  {
    href: "/settings",
    label: "More",
    icon: Settings,
    matchPaths: ["/settings", "/rates", "/assemblies", "/subcontractors", "/quotes"],
  },
];

export const mobileMoreItems: NavItem[] = [
  { href: "/quotes", label: "Quotes", icon: FileText },
  { href: "/rates", label: "Rates", icon: ClipboardList },
  { href: "/assemblies", label: "Assemblies", icon: Layers },
  { href: "/subcontractors", label: "Subcontractors", icon: Users },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function isNavItemActive(
  pathname: string,
  item: NavItem
): boolean {
  if (
    item.excludePaths?.some(
      (ex) => pathname === ex || pathname.startsWith(`${ex}/`)
    )
  ) {
    return false;
  }

  const paths = item.matchPaths ?? [item.href];

  return paths.some((path) => {
    if (path === "/dashboard") {
      return pathname === "/dashboard";
    }

    return pathname === path || pathname.startsWith(`${path}/`);
  });
}
