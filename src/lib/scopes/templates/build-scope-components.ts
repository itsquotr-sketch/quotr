import { getAnswerValue } from "@/lib/question-keys";
import type { ScopeComponentDefinition } from "@/lib/scopes/templates/types";
import { getCanonicalScopeTemplate } from "@/lib/scopes/templates";

export type ComponentInclusionStatus =
  | "included"
  | "excluded"
  | "client_supplied"
  | "not_confirmed"
  | "benchmark_assumed";

export type ResolvedScopeComponent = {
  key: string;
  label: string;
  category: ScopeComponentDefinition["category"];
  amount: number | null;
  source: "allowance" | "allocation" | "benchmark" | "none";
  included: boolean;
  inclusionStatus: ComponentInclusionStatus;
  assumption: string | null;
};

function isYes(value: string | undefined): boolean {
  return value === "yes";
}

function isClientSuppliedFact(key: string, value: string | undefined): boolean {
  if (!value) return false;
  if (key.includes("client_supplied") && (value === "yes" || value === "partial")) {
    return true;
  }
  if (key.includes("supplied_by") && value === "client") return true;
  if (key.includes("material_supply") && value === "client_supplied") return true;
  if (key.includes("balustrade_supply") && value === "client_supplied") return true;
  return false;
}

function isExcludedFact(key: string, value: string | undefined): boolean {
  if (!value) return false;
  if (key.includes("balustrade_supply") && value === "excluded") return true;
  if (key.includes("material_supply") && value === "labour_only") return true;
  return false;
}

function resolveComponentInclusion(
  component: ScopeComponentDefinition,
  answers: Record<string, string>
): { included: boolean; status: ComponentInclusionStatus; assumption: string | null } {
  for (const factKey of component.excludeWhenFacts ?? []) {
    const value = getAnswerValue(answers, factKey);
    if (isExcludedFact(factKey, value)) {
      return {
        included: false,
        status: "excluded",
        assumption: `${component.label} excluded`,
      };
    }
    if (isClientSuppliedFact(factKey, value)) {
      return {
        included: false,
        status: "client_supplied",
        assumption: `${component.label} client supplied`,
      };
    }
  }

  if (component.includeWhenFacts?.length) {
    const matched = component.includeWhenFacts.some((factKey) => {
      const value = getAnswerValue(answers, factKey);
      return isYes(value) || value === "supply_and_install" || value === "yes";
    });
    if (matched) {
      return {
        included: true,
        status: "included",
        assumption: null,
      };
    }
    return {
      included: false,
      status: "not_confirmed",
      assumption: null,
    };
  }

  if (component.defaultIncluded) {
    return {
      included: true,
      status: "benchmark_assumed",
      assumption: "Included in benchmark rate",
    };
  }

  return {
    included: false,
    status: "not_confirmed",
    assumption: null,
  };
}

function matchAllowanceToComponent(
  component: ScopeComponentDefinition,
  allowances: string[]
): string | null {
  const labelWords = component.label.toLowerCase().split(/\s+/);
  for (const allowance of allowances) {
    const lower = allowance.toLowerCase();
    if (labelWords.some((word) => word.length > 3 && lower.includes(word))) {
      return allowance;
    }
  }
  return null;
}

function extractAllowanceAmount(allowance: string): number | null {
  const match = allowance.match(/\$([\d,]+)/);
  if (!match) return null;
  const num = Number(match[1].replace(/,/g, ""));
  return Number.isFinite(num) ? num : null;
}

export function resolveScopeComponents(input: {
  scopeTypeKey: string;
  answers: Record<string, string>;
  centralEstimate: number;
  allowances: string[];
  rateSource: string;
}): ResolvedScopeComponent[] {
  const template = getCanonicalScopeTemplate(input.scopeTypeKey);
  if (!template?.pricing.components?.length) return [];

  const isBenchmark =
    input.rateSource === "template_benchmark" ||
    input.rateSource === "regional_fallback";

  return template.pricing.components.map((component) => {
    const { included, status, assumption } = resolveComponentInclusion(
      component,
      input.answers
    );

    const matchedAllowance = matchAllowanceToComponent(component, input.allowances);
    let amount: number | null = null;
    let source: ResolvedScopeComponent["source"] = "none";

    if (matchedAllowance) {
      amount = extractAllowanceAmount(matchedAllowance);
      source = "allowance";
    } else if (included && isBenchmark && input.centralEstimate > 0) {
      amount = null;
      source = "benchmark";
    }

    return {
      key: component.key,
      label: component.label,
      category: component.category,
      amount,
      source,
      included,
      inclusionStatus: status,
      assumption:
        assumption ??
        (source === "benchmark" ? "Allocated from benchmark rate" : null),
    };
  });
}

export function buildComponentSummaryLines(
  components: ResolvedScopeComponent[]
): string[] {
  return components
    .filter((c) => c.included || c.inclusionStatus === "excluded" || c.inclusionStatus === "client_supplied")
    .map((c) => {
      if (c.inclusionStatus === "excluded") return `${c.label} excluded`;
      if (c.inclusionStatus === "client_supplied") return `${c.label} client supplied`;
      if (c.source === "benchmark") return c.label;
      if (c.amount != null && c.source === "allowance") {
        return `${c.label} (allowance)`;
      }
      return c.label;
    });
}

export function buildScopeExclusionsFromComponents(
  components: ResolvedScopeComponent[],
  templateDefaults: string[]
): string[] {
  const fromComponents = components
    .filter((c) => c.inclusionStatus === "excluded" || c.inclusionStatus === "client_supplied")
    .map((c) =>
      c.inclusionStatus === "client_supplied"
        ? `${c.label} — client supplied`
        : `${c.label} — excluded`
    );
  return [...new Set([...templateDefaults, ...fromComponents])];
}

export function buildScopeInclusionsFromComponents(
  components: ResolvedScopeComponent[],
  assumptions: string[],
  allowances: string[]
): string[] {
  const fromComponents = components
    .filter((c) => c.included && c.inclusionStatus !== "benchmark_assumed")
    .map((c) => c.label);
  return [...new Set([...assumptions, ...allowances.map((a) => a.split(":")[0]?.trim() ?? a), ...fromComponents])].slice(0, 8);
}
