import type { ScopeTemplate, ScopeAllocations } from "@/lib/scopes/templates/types";

export type TemplateValidationIssue = {
  path: string;
  message: string;
};

const VALID_PRICING_MODES = new Set([
  "benchmark_rate",
  "scope_rate",
  "component_rate",
  "hybrid",
  "not_supported",
]);

function allFacts(template: ScopeTemplate) {
  return [
    ...template.facts.required,
    ...template.facts.useful,
    ...template.facts.optional,
  ];
}

function factKeys(template: ScopeTemplate): Set<string> {
  return new Set(allFacts(template).map((f) => f.key));
}

function validateAllocations(
  allocations: ScopeAllocations,
  path: string,
  issues: TemplateValidationIssue[]
) {
  const sum =
    allocations.labour +
    allocations.materials +
    allocations.subcontractors +
    allocations.allowances +
    allocations.contingency;
  if (sum !== 100) {
    issues.push({
      path,
      message: `Allocations must sum to 100 (got ${sum})`,
    });
  }
  for (const [key, value] of Object.entries(allocations)) {
    if (value < 0 || value > 100) {
      issues.push({
        path: `${path}.${key}`,
        message: `Allocation ${key} must be between 0 and 100`,
      });
    }
  }
}

export function validateScopeTemplate(template: ScopeTemplate): TemplateValidationIssue[] {
  const issues: TemplateValidationIssue[] = [];

  if (!template.scopeTypeKey?.trim()) {
    issues.push({ path: "scopeTypeKey", message: "scopeTypeKey is required" });
  }
  if (!template.label?.trim()) {
    issues.push({ path: "label", message: "label is required" });
  }
  if (!template.workAreaTypeKey?.trim()) {
    issues.push({ path: "workAreaTypeKey", message: "workAreaTypeKey is required" });
  }
  if (!template.aliases?.length) {
    issues.push({ path: "aliases", message: "aliases must not be empty" });
  }

  if (!template.quantity?.primaryUnit?.trim()) {
    issues.push({ path: "quantity.primaryUnit", message: "primaryUnit is required" });
  }

  const keys = factKeys(template);
  for (const tier of ["required", "useful", "optional"] as const) {
    for (const [index, fact] of template.facts[tier].entries()) {
      if (!fact.key?.trim()) {
        issues.push({
          path: `facts.${tier}[${index}].key`,
          message: "Fact key is required",
        });
      }
      if (!fact.label?.trim()) {
        issues.push({
          path: `facts.${tier}[${index}].label`,
          message: "Fact label is required",
        });
      }
    }
  }

  for (const [index, derived] of (template.quantity.derivedFields ?? []).entries()) {
    for (const source of derived.sourceFields) {
      if (!keys.has(source)) {
        issues.push({
          path: `quantity.derivedFields[${index}]`,
          message: `Derived field references missing source field: ${source}`,
        });
      }
    }
  }

  if (!VALID_PRICING_MODES.has(template.pricing.pricingMode)) {
    issues.push({
      path: "pricing.pricingMode",
      message: `Invalid pricingMode: ${template.pricing.pricingMode}`,
    });
  }

  validateAllocations(
    template.pricing.defaultAllocations,
    "pricing.defaultAllocations",
    issues
  );

  if (!Array.isArray(template.assumptions.default)) {
    issues.push({ path: "assumptions.default", message: "assumptions.default must be an array" });
  }
  if (!Array.isArray(template.exclusions.default)) {
    issues.push({ path: "exclusions.default", message: "exclusions.default must be an array" });
  }

  for (const [index, component] of (template.pricing.components ?? []).entries()) {
    if (!component.key?.trim()) {
      issues.push({
        path: `pricing.components[${index}].key`,
        message: "Component key is required",
      });
    }
    if (!component.label?.trim()) {
      issues.push({
        path: `pricing.components[${index}].label`,
        message: "Component label is required",
      });
    }
  }

  if (template.materialCategories) {
    const mc = template.materialCategories;
    if (!mc.factKey?.trim()) {
      issues.push({ path: "materialCategories.factKey", message: "factKey is required" });
    }
    if (!mc.questionText?.trim()) {
      issues.push({
        path: "materialCategories.questionText",
        message: "questionText is required",
      });
    }
    if (!mc.defaultCategoryKey?.trim()) {
      issues.push({
        path: "materialCategories.defaultCategoryKey",
        message: "defaultCategoryKey is required",
      });
    }
    if (!mc.categories.some((c) => c.value === "unknown")) {
      issues.push({
        path: "materialCategories.categories",
        message: 'Must include a "Not Sure" option (value: unknown)',
      });
    }
    if (!mc.categories.some((c) => c.value === mc.defaultCategoryKey)) {
      issues.push({
        path: "materialCategories.defaultCategoryKey",
        message: "defaultCategoryKey must match a category value",
      });
    }
  }

  return issues;
}

export function assertValidScopeTemplate(template: ScopeTemplate): void {
  const issues = validateScopeTemplate(template);
  if (issues.length > 0) {
    const detail = issues.map((i) => `${i.path}: ${i.message}`).join("; ");
    throw new Error(`Invalid scope template "${template.scopeTypeKey}": ${detail}`);
  }
}

export function validateAllScopeTemplates(
  templates: ScopeTemplate[]
): Map<string, TemplateValidationIssue[]> {
  const results = new Map<string, TemplateValidationIssue[]>();
  for (const template of templates) {
    results.set(template.scopeTypeKey, validateScopeTemplate(template));
  }
  return results;
}
