import {
  isBenchmarkRateSource,
  type RateSource,
} from "@/lib/cost-engine/rates/get-base-rate-for-scope";
import type { WorkAreaRateSourceLine } from "@/lib/cost-engine/estimate-trace";
import type {
  LabourRate,
  MaterialRate,
  ScopeRate,
} from "@/types/database";

export type StagedRateLevel = 0 | 1 | 2 | 3;

export type StagedRateDetail = {
  level: StagedRateLevel;
  label: string;
  prompt: string | null;
};

export function resolveStagedRateDetail(input: {
  rateSourceLines: WorkAreaRateSourceLine[];
  scopeRates: ScopeRate[];
  labourRates: LabourRate[];
  materialRates: MaterialRate[];
}): StagedRateDetail {
  const hasScopeRate = input.rateSourceLines.some(
    (line) => line.rateSource === "scope_rate" || line.rateSource === "org_rate"
  );
  const hasPackageRate = input.rateSourceLines.some(
    (line) => line.rateSource === "package_rate"
  );
  const hasLabourAndMaterial =
    input.labourRates.length > 0 && input.materialRates.length > 0;
  const allBenchmark = input.rateSourceLines.every((line) =>
    isBenchmarkRateSource(line.rateSource as RateSource)
  );

  if (hasLabourAndMaterial && (hasScopeRate || hasPackageRate)) {
    const tradeNames = [
      ...new Set([
        ...input.labourRates.slice(0, 2).map((r) => r.name),
        ...input.materialRates.slice(0, 1).map((r) => r.material_name),
      ]),
    ].filter(Boolean);

    return {
      level: 3,
      label:
        tradeNames.length > 0
          ? `Uses your ${tradeNames.join(", ")} rates`
          : "Uses your labour and material rates",
      prompt: "Add more rates to make this estimate more accurate.",
    };
  }

  if (hasScopeRate || hasPackageRate) {
    const primary = input.rateSourceLines.find(
      (line) =>
        line.rateSource === "scope_rate" ||
        line.rateSource === "org_rate" ||
        line.rateSource === "package_rate"
    );
    return {
      level: 1,
      label: primary
        ? `Uses your ${primary.label} rate`
        : "Uses your scope rates",
      prompt: "Add component rates to refine this estimate further.",
    };
  }

  if (input.scopeRates.length > 0 && allBenchmark) {
    return {
      level: 0,
      label: "Benchmark estimate",
      prompt: "Add your rates to make this estimate more accurate.",
    };
  }

  return {
    level: 0,
    label: "Benchmark estimate",
    prompt: "Add more rates to make this estimate more accurate.",
  };
}
