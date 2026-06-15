import type { EstimateComponent } from "@/lib/cost-engine/estimate-components/types";
import type { EstimateTraceComponent } from "@/lib/cost-engine/trace/types";
import type { RateSource } from "@/lib/cost-engine/rates/get-base-rate-for-scope";
import { getCanonicalScopeTemplate } from "@/lib/scopes/templates";
import type { ResolvedScopeComponent } from "@/lib/scopes/templates/build-scope-components";

export function mapComponentSourceToTrace(
  source: EstimateComponent["source"],
  scopeRateSource: RateSource
): EstimateTraceComponent["source"] {
  if (source === "contractor_component_rate" || source === "contractor_scope_rate") {
    return "user_rate";
  }
  if (source === "benchmark_component_rate" || source === "benchmark_scope_rate") {
    return "benchmark";
  }
  if (scopeRateSource === "scope_rate" || scopeRateSource === "org_rate") {
    return "user_rate";
  }
  return "assumed";
}

export function mapComponentSourceToStructured(
  source: EstimateComponent["source"]
): ResolvedScopeComponent["source"] {
  if (
    source === "contractor_component_rate" ||
    source === "contractor_scope_rate"
  ) {
    return "allocation";
  }
  if (
    source === "benchmark_component_rate" ||
    source === "benchmark_scope_rate"
  ) {
    return "benchmark";
  }
  return "none";
}

export function estimateComponentsToTrace(
  components: EstimateComponent[],
  scopeRateSource: RateSource
): EstimateTraceComponent[] {
  return components
    .filter((c) => c.estimated_cost > 0)
    .map((c) => {
      const template = getCanonicalScopeTemplate(c.scope_type);
      const def = template?.pricing.components?.find(
        (row) => row.key === c.component_type
      );
      return {
        key: c.component_type,
        label: def?.label ?? c.component_type,
        category: mapTraceCategory(def?.category ?? "allowance"),
        amount: c.estimated_cost,
        source: mapComponentSourceToTrace(c.source, scopeRateSource),
        included: true,
        explanation: `${def?.label ?? c.component_type}: ${c.quantity}${c.unit} (${formatSourceLabel(c.source)})`,
      };
    });
}

export function estimateComponentsToStructured(
  components: EstimateComponent[]
): ResolvedScopeComponent[] {
  return components.map((c) => {
    const template = getCanonicalScopeTemplate(c.scope_type);
    const def = template?.pricing.components?.find(
      (row) => row.key === c.component_type
    );
    return {
      key: c.component_type,
      label: def?.label ?? c.component_type,
      category: def?.category ?? "allowance",
      amount: c.estimated_cost > 0 ? c.estimated_cost : null,
      source: mapComponentSourceToStructured(c.source),
      included: c.estimated_cost > 0,
      inclusionStatus: c.estimated_cost > 0 ? "included" : "not_confirmed",
      assumption:
        c.source === "benchmark_component_rate" || c.source === "benchmark_scope_rate"
          ? "Allocated from benchmark rate"
          : null,
    };
  });
}

export function formatComponentTraceSummary(
  scopeLabel: string,
  components: EstimateComponent[]
): string {
  const priced = components.filter((c) => c.estimated_cost > 0);
  if (priced.length === 0) return scopeLabel;

  const parts = priced.map(
    (c) =>
      `${labelForComponent(c)} $${Math.round(c.estimated_cost / 1000)}k`.replace(
        /\$0k$/,
        `$${c.estimated_cost.toLocaleString("en-NZ")}`
      )
  );
  return `${scopeLabel} = ${parts.join(" + ")}`;
}

function labelForComponent(component: EstimateComponent): string {
  const template = getCanonicalScopeTemplate(component.scope_type);
  const def = template?.pricing.components?.find(
    (row) => row.key === component.component_type
  );
  return def?.label ?? component.component_type;
}

function formatSourceLabel(source: EstimateComponent["source"]): string {
  switch (source) {
    case "contractor_component_rate":
      return "your component rate";
    case "contractor_scope_rate":
      return "your scope rate";
    case "benchmark_component_rate":
      return "benchmark component rate";
    case "benchmark_scope_rate":
      return "benchmark scope rate";
    case "placeholder":
      return "placeholder";
  }
}

function mapTraceCategory(
  category: string
): EstimateTraceComponent["category"] {
  if (category === "subcontractor") return "subcontractors";
  if (category === "allowance") return "allowances";
  if (
    category === "labour" ||
    category === "materials" ||
    category === "subcontractors" ||
    category === "allowances" ||
    category === "contingency"
  ) {
    return category;
  }
  return "allowances";
}
