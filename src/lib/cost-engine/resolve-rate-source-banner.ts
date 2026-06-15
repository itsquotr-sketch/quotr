import type { WorkAreaRateSourceLine } from "@/lib/cost-engine/estimate-trace";
import {
  contractorRateSourceLabel,
} from "@/lib/cost-engine/contractor-rate-source-label";
import {
  isBenchmarkRateSource,
  type RateSource,
} from "@/lib/cost-engine/rates/get-base-rate-for-scope";
import { TRUST_COPY } from "@/lib/assistant-v2/trust-messages";

export type RateSourceBannerKind = "all_saved" | "all_benchmark" | "mixed";

export type RateSourceBanner = {
  kind: RateSourceBannerKind;
  message: string;
  perScopeLines: { scopeName: string; label: string }[];
};

function isSavedRateSource(source: RateSource): boolean {
  return !isBenchmarkRateSource(source);
}

export function resolveRateSourceBanner(
  lines: WorkAreaRateSourceLine[]
): RateSourceBanner | null {
  if (lines.length === 0) return null;

  const perScopeLines = lines.map((line) => ({
    scopeName: line.workAreaName,
    label: contractorRateSourceLabel(line.rateSource, {
      scopeLabel: line.label,
    }),
  }));

  const savedCount = lines.filter((line) =>
    isSavedRateSource(line.rateSource)
  ).length;
  const benchmarkCount = lines.length - savedCount;

  if (savedCount === lines.length) {
    return {
      kind: "all_saved",
      message: `${TRUST_COPY.ratesSaved}.`,
      perScopeLines,
    };
  }

  if (benchmarkCount === lines.length) {
    return {
      kind: "all_benchmark",
      message: `${TRUST_COPY.ratesBenchmark} — add your rates to improve accuracy.`,
      perScopeLines,
    };
  }

  return {
    kind: "mixed",
    message: "Some scopes use your rates. Some use industry benchmarks.",
    perScopeLines,
  };
}
