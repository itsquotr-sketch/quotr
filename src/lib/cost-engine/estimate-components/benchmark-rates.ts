import type { QualityLevel } from "@/lib/constants/quality-level";

export type ComponentBenchmarkRate = {
  budget: number;
  standard: number;
  premium: number;
  unit: string;
};

/** Per-component benchmark rates ($/unit) — calibrated to decompose scope benchmarks. */
export const DECK_COMPONENT_BENCHMARKS: Record<string, ComponentBenchmarkRate> = {
  substructure: { budget: 145, standard: 210, premium: 290, unit: "m²" },
  decking_boards: { budget: 195, standard: 285, premium: 395, unit: "m²" },
  fixings: { budget: 45, standard: 65, premium: 90, unit: "m²" },
  piles: { budget: 55, standard: 75, premium: 95, unit: "each" },
  stairs: { budget: 2200, standard: 2500, premium: 3200, unit: "each" },
  balustrade: { budget: 320, standard: 400, premium: 520, unit: "m" },
  rubbish_removal: { budget: 800, standard: 1200, premium: 1500, unit: "each" },
  access_allowance: { budget: 0, standard: 0, premium: 0, unit: "each" },
};

export const BATHROOM_COMPONENT_BENCHMARKS: Record<string, ComponentBenchmarkRate> = {
  demolition: { budget: 280, standard: 380, premium: 480, unit: "m²" },
  waterproofing: { budget: 95, standard: 125, premium: 165, unit: "m²" },
  tiling: { budget: 185, standard: 245, premium: 320, unit: "m²" },
  plumbing: { budget: 420, standard: 520, premium: 680, unit: "m²" },
  electrical: { budget: 220, standard: 280, premium: 360, unit: "m²" },
  fixtures: { budget: 380, standard: 520, premium: 780, unit: "m²" },
  painting_stopping: { budget: 65, standard: 85, premium: 110, unit: "m²" },
  rubbish_removal: { budget: 600, standard: 900, premium: 1200, unit: "each" },
};

export const RETAINING_WALL_COMPONENT_BENCHMARKS: Record<string, ComponentBenchmarkRate> = {
  excavation: { budget: 95, standard: 140, premium: 195, unit: "m²" },
  wall_materials: { budget: 220, standard: 340, premium: 520, unit: "m²" },
  drainage: { budget: 180, standard: 250, premium: 320, unit: "each" },
  backfill: { budget: 180, standard: 250, premium: 320, unit: "each" },
  spoil_removal: { budget: 1500, standard: 2000, premium: 2800, unit: "each" },
  machine_labour: { budget: 85, standard: 120, premium: 165, unit: "m²" },
  engineering_allowance: { budget: 2500, standard: 3500, premium: 5000, unit: "each" },
};

export function pickBenchmarkComponentRate(
  benchmarks: Record<string, ComponentBenchmarkRate>,
  componentType: string,
  finishLevel: "budget" | "standard" | "premium" | "unknown"
): { rate: number; unit: string } | null {
  const row = benchmarks[componentType];
  if (!row) return null;

  let rate = row.standard;
  if (finishLevel === "budget") rate = row.budget;
  if (finishLevel === "premium") rate = row.premium;

  return { rate, unit: row.unit };
}

export function confidenceForSource(
  source: import("./types").EstimateComponentSource
): number {
  switch (source) {
    case "contractor_component_rate":
      return 85;
    case "contractor_scope_rate":
      return 75;
    case "benchmark_component_rate":
      return 55;
    case "benchmark_scope_rate":
      return 45;
    case "placeholder":
      return 25;
  }
}

export function mapQualityToFinish(
  level: QualityLevel
): "budget" | "standard" | "premium" | "unknown" {
  if (level === "budget" || level === "standard" || level === "premium") {
    return level;
  }
  return "unknown";
}
