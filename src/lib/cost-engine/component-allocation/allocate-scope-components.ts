import { getAnswerValue } from "@/lib/question-keys";
import type {
  AllocationComponentDefinition,
  ScopeAllocations,
  ScopeComponentAllocationTemplate,
} from "@/lib/scopes/templates/types";
import {
  getCanonicalScopeTemplate,
  getCanonicalScopeTemplateByWorkAreaType,
} from "@/lib/scopes/templates";

export type AllocatedComponentCategory =
  | "labour"
  | "materials"
  | "subcontractors"
  | "allowances";

export type AllocatedScopeComponent = {
  key: string;
  label: string;
  category: AllocatedComponentCategory;
  amount: number;
  included: boolean;
};

export type PricedComponentHint = {
  key: string;
  label?: string;
  amount: number;
  category?: string;
};

type CategoryKey = keyof ScopeComponentAllocationTemplate;

const CATEGORY_ORDER: AllocatedComponentCategory[] = [
  "labour",
  "materials",
  "subcontractors",
  "allowances",
];

const TEMPLATE_CATEGORY_MAP: Record<CategoryKey, AllocatedComponentCategory> = {
  labour: "labour",
  materials: "materials",
  subcontractors: "subcontractors",
  allowances: "allowances",
};

/** Maps Sprint 13A priced component keys to insight allocation lines. */
const PRICED_COMPONENT_SPLITS: Record<
  string,
  Array<{ allocationKey: string; category: AllocatedComponentCategory; share: number }>
> = {
  waterproofing: [
    { allocationKey: "waterproofer", category: "subcontractors", share: 0.55 },
    {
      allocationKey: "waterproofing_materials",
      category: "materials",
      share: 0.45,
    },
  ],
  demolition: [
    { allocationKey: "demo_labour", category: "labour", share: 0.45 },
    { allocationKey: "demolition_allowance", category: "allowances", share: 0.55 },
  ],
  tiling: [
    { allocationKey: "tiler", category: "subcontractors", share: 0.6 },
    { allocationKey: "tile_materials", category: "materials", share: 0.4 },
  ],
  plumbing: [{ allocationKey: "plumber", category: "subcontractors", share: 1 }],
  electrical: [{ allocationKey: "electrician", category: "subcontractors", share: 1 }],
  fixtures: [{ allocationKey: "fixtures_allowance", category: "materials", share: 1 }],
  painting_stopping: [
    { allocationKey: "painting_stopping", category: "labour", share: 1 },
  ],
  rubbish_removal: [
    { allocationKey: "cartage_allowance", category: "allowances", share: 1 },
  ],
  substructure: [{ allocationKey: "framing_labour", category: "labour", share: 0.55 }],
  decking_boards: [
    { allocationKey: "decking_materials", category: "materials", share: 1 },
  ],
  fixings: [{ allocationKey: "fixings_materials", category: "materials", share: 1 }],
  excavation: [{ allocationKey: "excavation_labour", category: "labour", share: 1 }],
  wall_materials: [
    { allocationKey: "wall_materials", category: "materials", share: 1 },
  ],
  drainage: [{ allocationKey: "drainage_subcontractor", category: "subcontractors", share: 1 }],
  backfill: [{ allocationKey: "backfill_allowance", category: "allowances", share: 1 }],
  spoil_removal: [
    { allocationKey: "cartage_allowance", category: "allowances", share: 1 },
  ],
};

function isYes(value: string | undefined): boolean {
  return value === "yes" || value === "supply_and_install";
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

export function resolveAllocationComponentIncluded(
  component: AllocationComponentDefinition,
  answers: Record<string, string>
): boolean {
  for (const factKey of component.excludeWhenFacts ?? []) {
    const value = getAnswerValue(answers, factKey);
    if (isExcludedFact(factKey, value) || isClientSuppliedFact(factKey, value)) {
      return false;
    }
  }

  if (component.includeWhenFacts?.length) {
    return component.includeWhenFacts.some((factKey) => {
      const value = getAnswerValue(answers, factKey);
      return isYes(value);
    });
  }

  return component.defaultIncluded !== false;
}

export function getScopeComponentAllocationTemplate(input: {
  scopeTypeKey?: string;
  workAreaTypeKey?: string;
}): ScopeComponentAllocationTemplate | null {
  const template =
    (input.scopeTypeKey
      ? getCanonicalScopeTemplate(input.scopeTypeKey)
      : undefined) ??
    (input.workAreaTypeKey
      ? getCanonicalScopeTemplateByWorkAreaType(input.workAreaTypeKey)
      : undefined);

  return template?.pricing.componentAllocation ?? null;
}

function resolveCategoryTotals(input: {
  scopeCentral: number;
  allocations: ScopeAllocations;
}): Record<AllocatedComponentCategory, number> {
  const scale = input.scopeCentral / 100;
  return {
    labour: Math.round(input.allocations.labour * scale),
    materials: Math.round(input.allocations.materials * scale),
    subcontractors: Math.round(input.allocations.subcontractors * scale),
    allowances: Math.round(input.allocations.allowances * scale),
  };
}

function reconcileCategoryTotal(
  components: AllocatedScopeComponent[],
  targetTotal: number
): AllocatedScopeComponent[] {
  if (components.length === 0) return components;

  const current = components.reduce((sum, row) => sum + row.amount, 0);
  const delta = targetTotal - current;
  if (delta === 0) return components;

  const last = components[components.length - 1]!;
  return [
    ...components.slice(0, -1),
    {
      ...last,
      amount: Math.max(0, last.amount + delta),
    },
  ];
}

function distributeCategory(
  category: AllocatedComponentCategory,
  categoryTotal: number,
  definitions: AllocationComponentDefinition[],
  answers: Record<string, string>,
  weightBoosts: Map<string, number>
): AllocatedScopeComponent[] {
  const included = definitions
    .map((definition) => ({
      definition,
      included: resolveAllocationComponentIncluded(definition, answers),
    }))
    .filter((row) => row.included);

  if (included.length === 0 || categoryTotal <= 0) {
    return [];
  }

  const weights = included.map(({ definition }) => {
    const boost = weightBoosts.get(definition.key) ?? 0;
    return Math.max(1, (definition.weight ?? 1) + boost);
  });
  const weightSum = weights.reduce((sum, weight) => sum + weight, 0);

  const rows = included.map(({ definition }, index) => ({
    key: definition.key,
    label: definition.label,
    category,
    amount:
      index === included.length - 1
        ? 0
        : Math.round(categoryTotal * (weights[index]! / weightSum)),
    included: true,
  }));

  const assigned = rows.slice(0, -1).reduce((sum, row) => sum + row.amount, 0);
  const last = rows[rows.length - 1];
  if (last) {
    last.amount = Math.max(0, categoryTotal - assigned);
  }

  return reconcileCategoryTotal(rows, categoryTotal);
}

function buildWeightBoosts(pricedComponents: PricedComponentHint[]): Map<string, number> {
  const boosts = new Map<string, number>();

  for (const priced of pricedComponents) {
    if (priced.amount <= 0) continue;
    const splits = PRICED_COMPONENT_SPLITS[priced.key];
    if (!splits) continue;

    for (const split of splits) {
      const boost = Math.round((priced.amount * split.share) / 500);
      boosts.set(
        split.allocationKey,
        (boosts.get(split.allocationKey) ?? 0) + Math.max(1, boost)
      );
    }
  }

  return boosts;
}

function matchAllowanceAmount(
  component: AllocationComponentDefinition,
  projectAllowances: string[]
): number | null {
  const labelWords = component.label.toLowerCase().split(/\s+/);
  for (const allowance of projectAllowances) {
    const lower = allowance.toLowerCase();
    if (!labelWords.some((word) => word.length > 3 && lower.includes(word))) {
      continue;
    }
    const match = allowance.match(/\$([\d,]+)/);
    if (!match) continue;
    const amount = Number(match[1].replace(/,/g, ""));
    if (Number.isFinite(amount) && amount > 0) return amount;
  }
  return null;
}

function applyAllowanceOverrides(
  rows: AllocatedScopeComponent[],
  definitions: AllocationComponentDefinition[],
  projectAllowances: string[],
  categoryTotal: number
): AllocatedScopeComponent[] {
  if (projectAllowances.length === 0) return rows;

  const overridden = rows.map((row) => {
    const definition = definitions.find((item) => item.key === row.key);
    if (!definition) return row;
    const allowanceAmount = matchAllowanceAmount(definition, projectAllowances);
    if (allowanceAmount == null) return row;
    return { ...row, amount: allowanceAmount };
  });

  const fixed = overridden.filter((row) =>
    definitions.some(
      (definition) =>
        definition.key === row.key &&
        matchAllowanceAmount(definition, projectAllowances) != null
    )
  );
  const fixedTotal = fixed.reduce((sum, row) => sum + row.amount, 0);
  const flexible = overridden.filter(
    (row) => !fixed.some((fixedRow) => fixedRow.key === row.key)
  );

  if (flexible.length === 0) {
    return reconcileCategoryTotal(overridden, categoryTotal);
  }

  const remainder = Math.max(0, categoryTotal - fixedTotal);
  const weightSum = flexible.reduce((sum, row) => sum + Math.max(row.amount, 1), 0);
  const redistributed = flexible.map((row, index) => {
    if (index === flexible.length - 1) {
      const prior = flexible
        .slice(0, -1)
        .reduce((sum, priorRow) => sum + priorRow.amount, 0);
      return { ...row, amount: Math.max(0, remainder - prior) };
    }
    const weight = Math.max(row.amount, 1);
    return {
      ...row,
      amount: Math.round(remainder * (weight / weightSum)),
    };
  });

  return reconcileCategoryTotal([...fixed, ...redistributed], categoryTotal);
}

export function allocateScopeComponents(input: {
  scopeTypeKey?: string;
  workAreaTypeKey: string;
  answers?: Record<string, string>;
  scopeCentral: number;
  allocations?: Partial<ScopeAllocations> | null;
  projectAllowances?: string[];
  pricedComponents?: PricedComponentHint[];
}): AllocatedScopeComponent[] {
  const template = getScopeComponentAllocationTemplate({
    scopeTypeKey: input.scopeTypeKey,
    workAreaTypeKey: input.workAreaTypeKey,
  });

  if (!template || input.scopeCentral <= 0) return [];

  const scopeTemplate =
    getCanonicalScopeTemplate(input.scopeTypeKey ?? "") ??
    getCanonicalScopeTemplateByWorkAreaType(input.workAreaTypeKey);

  const allocationPercents: ScopeAllocations = {
    labour:
      input.allocations?.labour ??
      scopeTemplate?.pricing.defaultAllocations.labour ??
      25,
    materials:
      input.allocations?.materials ??
      scopeTemplate?.pricing.defaultAllocations.materials ??
      25,
    subcontractors:
      input.allocations?.subcontractors ??
      scopeTemplate?.pricing.defaultAllocations.subcontractors ??
      25,
    allowances:
      input.allocations?.allowances ??
      scopeTemplate?.pricing.defaultAllocations.allowances ??
      15,
    contingency:
      input.allocations?.contingency ??
      scopeTemplate?.pricing.defaultAllocations.contingency ??
      10,
  };

  const answers = input.answers ?? {};
  const categoryTotals = resolveCategoryTotals({
    scopeCentral: input.scopeCentral,
    allocations: allocationPercents,
  });
  const weightBoosts = buildWeightBoosts(input.pricedComponents ?? []);
  const projectAllowances = input.projectAllowances ?? [];

  const allocated: AllocatedScopeComponent[] = [];

  for (const templateCategory of Object.keys(
    template
  ) as CategoryKey[]) {
    const category = TEMPLATE_CATEGORY_MAP[templateCategory];
    const definitions = template[templateCategory];
    const categoryTotal = categoryTotals[category];

    let rows = distributeCategory(
      category,
      categoryTotal,
      definitions,
      answers,
      weightBoosts
    );

    if (category === "allowances") {
      rows = applyAllowanceOverrides(
        rows,
        definitions,
        projectAllowances,
        categoryTotal
      );
    }

    allocated.push(...rows);
  }

  return allocated.filter((row) => row.included && row.amount >= 0);
}

export function mergeAllocatedComponents(
  scopes: AllocatedScopeComponent[]
): AllocatedScopeComponent[] {
  const merged = new Map<string, AllocatedScopeComponent>();

  for (const row of scopes) {
    const mergeKey = `${row.category}:${row.key}`;
    const existing = merged.get(mergeKey);
    if (existing) {
      merged.set(mergeKey, {
        ...existing,
        amount: existing.amount + row.amount,
      });
    } else {
      merged.set(mergeKey, { ...row });
    }
  }

  return CATEGORY_ORDER.flatMap((category) =>
    [...merged.values()]
      .filter((row) => row.category === category)
      .sort((a, b) => b.amount - a.amount)
  );
}

export function groupAllocatedComponents(
  components: AllocatedScopeComponent[]
): Array<{
  key: AllocatedComponentCategory;
  label: string;
  totalAmount: number;
  components: Array<{ key: string; label: string; amount: number }>;
}> {
  const labels: Record<AllocatedComponentCategory, string> = {
    labour: "Labour",
    materials: "Materials",
    subcontractors: "Subcontractors",
    allowances: "Allowances",
  };

  return CATEGORY_ORDER.map((category) => {
    const rows = components.filter((row) => row.category === category);
    return {
      key: category,
      label: labels[category],
      totalAmount: rows.reduce((sum, row) => sum + row.amount, 0),
      components: rows.map((row) => ({
        key: row.key,
        label: row.label,
        amount: row.amount,
      })),
    };
  }).filter((group) => group.components.length > 0);
}
