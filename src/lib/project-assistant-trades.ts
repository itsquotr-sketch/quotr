import { getTemplateTradesForWorkArea } from "@/lib/scope-templates";

const WORK_AREA_TRADES: Record<string, string[]> = {
  "Kitchen renovation": [
    "Builder / Carpenter",
    "Joiner",
    "Plumber",
    "Electrician",
    "Tiler / Splashback installer",
    "Painter",
  ],
  Painting: ["Painter"],
  Flooring: ["Flooring installer"],
  "Internal Alteration": [
    "Builder / Carpenter",
    "Plasterer / Stopper",
    "Painter",
    "Electrician",
  ],
  Fence: ["Builder", "Labourer"],
  "Laundry renovation": [
    "Builder / Carpenter",
    "Plumber",
    "Tiler",
    "Electrician",
  ],
  "General Building Works": ["Builder / Carpenter", "Labourer"],
  "Custom Scope": ["Builder / Carpenter"],
};

export function getTradesForWorkAreaType(workAreaType: string): string[] {
  const templateTrades = getTemplateTradesForWorkArea(workAreaType);
  if (templateTrades.length > 0) return templateTrades;
  return WORK_AREA_TRADES[workAreaType] ?? WORK_AREA_TRADES["Custom Scope"];
}

export function getIncludedTradesForWorkAreas(
  workAreaTypes: string[]
): string[] {
  const trades = new Set<string>();
  for (const type of workAreaTypes) {
    for (const trade of getTradesForWorkAreaType(type)) {
      trades.add(trade);
    }
  }
  return [...trades].sort();
}
