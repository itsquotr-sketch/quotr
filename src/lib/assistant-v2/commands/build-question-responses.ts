import { contractorRateSourceLabel } from "@/lib/cost-engine/contractor-rate-source-label";
import type { RateSource } from "@/lib/cost-engine/rates/get-base-rate-for-scope";
import {
  buildConfidenceExplanationFromEvaluation,
  type ConfidenceEvaluationResult,
} from "@/lib/assistant-v2/confidence/evaluate-confidence";

type Summary = {
  keyFactsUsed?: string[];
  missingInformation?: string[];
  rateSourceLines?: { workAreaName: string; label: string; rateSource: string }[];
  rangeQualityLabel?: string;
  rangeQualityReason?: string | null;
  rangeQuality?: string;
  tightenSuggestions?: string[];
  stagedRatePrompt?: string | null;
  rangeHighDrivers?: string[];
  risks?: string[];
  confidenceEvaluation?: ConfidenceEvaluationResult;
  confidenceScore?: number;
};

export function buildConfidenceExplanation(summary: Summary | null): string {
  if (!summary) {
    return "I don't have enough estimate data yet. Confirm work areas and answer a few key questions first.";
  }

  if (summary.confidenceEvaluation) {
    return buildConfidenceExplanationFromEvaluation(summary.confidenceEvaluation);
  }

  const tierLabel = summary.rangeQualityLabel ?? "draft";
  const tierReason =
    summary.rangeQualityReason ?? "answer a few more questions to sharpen the range";

  const knowns = (summary.keyFactsUsed ?? []).slice(0, 4);
  const unknowns = (summary.missingInformation ?? []).slice(0, 4);

  const lines: string[] = [];

  if (tierLabel && tierReason) {
    lines.push(`This is a ${tierLabel.toLowerCase()} estimate. ${tierReason}`);
  } else {
    lines.push("This is a fair draft estimate.");
  }

  if (knowns.length > 0) {
    lines.push("");
    lines.push("I'm confident on:");
    for (const fact of knowns) {
      lines.push(`• ${fact}`);
    }
  }

  if (unknowns.length > 0) {
    lines.push("");
    lines.push("Still useful:");
    for (const item of unknowns) {
      lines.push(`• ${item.replace(/^Missing:\s*/i, "")}`);
    }
  }

  const benchmarkLines = (summary.rateSourceLines ?? []).filter((line) =>
    ["template_benchmark", "regional_fallback", "placeholder"].includes(
      line.rateSource
    )
  );
  if (benchmarkLines.length > 0) {
    lines.push("");
    lines.push(
      `Note: ${benchmarkLines.map((l) => l.workAreaName).join(", ")} ${benchmarkLines.length === 1 ? "is" : "are"} using industry benchmarks rather than your saved rates.`
    );
  }

  const nextAction =
    summary.tightenSuggestions?.[0] ??
    summary.stagedRatePrompt ??
    (unknowns.length > 0
      ? `Adding ${unknowns[0]!.replace(/^Missing:\s*/i, "").toLowerCase()} would improve accuracy.`
      : null);

  if (nextAction) {
    lines.push("");
    lines.push(`Next best step: ${nextAction}`);
  }

  return lines.join("\n");
}

export function buildSensitivitySummary(summary: Summary | null): string {
  if (!summary) {
    return "Confirm work areas first — then I can explain what would move this estimate.";
  }

  const drivers = [
    ...(summary.rangeHighDrivers ?? []),
    ...(summary.risks ?? []),
    ...(summary.missingInformation ?? [])
      .filter((m) => /material|access|finish|machine/i.test(m))
      .map((m) => m.replace(/^Missing:\s*/i, "")),
  ];

  const uniqueDrivers = [...new Set(drivers)].slice(0, 5);

  if (uniqueDrivers.length === 0) {
    const fallback = [
      "Finish level — premium materials increase cost.",
      "Material choices — timber vs composite, block vs concrete.",
      "Site access — poor access increases labour and excavation.",
      "Client-supplied materials — could reduce material allowance.",
    ];
    return [
      "The biggest things that would move this estimate are:",
      "",
      ...fallback.map((item, i) => `${i + 1}. ${item}`),
    ].join("\n");
  }

  const lines = ["The biggest things that would move this estimate are:", ""];
  uniqueDrivers.forEach((driver, i) => {
    lines.push(`${i + 1}. ${driver}`);
  });

  if (summary.tightenSuggestions?.length) {
    lines.push("");
    lines.push(
      `To tighten the range: ${summary.tightenSuggestions.slice(0, 2).join("; ")}.`
    );
  }

  return lines.join("\n");
}

export function buildRateSourceSummary(
  summary: Summary | null,
  options?: { cheaper?: boolean }
): string {
  if (!summary?.rateSourceLines?.length) {
    return "I don't have per-scope rate details yet. Confirm work areas and I'll show which rates are being used.";
  }

  const lines = ["Here's what rates this estimate is using:", ""];

  for (const line of summary.rateSourceLines) {
    const sourceLabel = contractorRateSourceLabel(
      line.rateSource as RateSource,
      { scopeLabel: line.label }
    );
    const isSaved = line.rateSource === "scope_rate" || line.rateSource === "package_rate";
    lines.push(
      `${line.workAreaName} is using ${isSaved ? sourceLabel.toLowerCase() : `an ${sourceLabel.toLowerCase()}`}${isSaved ? "" : ` because you have not saved a ${line.label.toLowerCase()} rate yet`}.`
    );
  }

  const benchmarkScopes = summary.rateSourceLines.filter((line) =>
    ["template_benchmark", "regional_fallback", "placeholder"].includes(
      line.rateSource
    )
  );

  if (benchmarkScopes.length > 0 && !options?.cheaper) {
    lines.push("");
    lines.push(
      "Adding your own rates would improve confidence and tighten the range."
    );
  }

  return lines.join("\n");
}

export function buildCheaperSensitivitySummary(summary: Summary | null): string {
  const base = buildSensitivitySummary(summary);
  return `${base}\n\nTo reduce cost: confirm client-supplied materials, choose budget finish, or simplify scope inclusions.`;
}

export function buildExpensiveSensitivitySummary(
  summary: Summary | null
): string {
  const base = buildSensitivitySummary(summary);
  return `${base}\n\nTo understand higher cost: check premium finish, access constraints, and subcontractor allowances.`;
}
