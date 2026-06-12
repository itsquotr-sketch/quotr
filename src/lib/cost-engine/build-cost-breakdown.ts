import type { ScopeRateAllocation } from "@/lib/cost-engine/rates/scope-rate-utils";

export type CostBreakdown = {
  labour: number;
  materials: number;
  subcontractors: number;
  allowances: number;
  contingency: number;
  byWorkArea: {
    name: string;
    workAreaTypeKey: string;
    total: number;
    labour: number;
    materials: number;
    subcontractors: number;
    allowances: number;
    contingency: number;
  }[];
  isIndicative: boolean;
};

type Allocation = {
  labour: number;
  materials: number;
  subcontractors: number;
  allowances: number;
  contingency: number;
};

const WORK_AREA_ALLOCATIONS: Record<string, Allocation> = {
  Deck: {
    labour: 0.45,
    materials: 0.4,
    subcontractors: 0.05,
    allowances: 0.05,
    contingency: 0.05,
  },
  "Retaining Wall": {
    labour: 0.3,
    materials: 0.35,
    subcontractors: 0.2,
    allowances: 0.1,
    contingency: 0.05,
  },
  "Bathroom renovation": {
    labour: 0.25,
    materials: 0.3,
    subcontractors: 0.35,
    allowances: 0.05,
    contingency: 0.05,
  },
};

const DEFAULT_ALLOCATION: Allocation = {
  labour: 0.4,
  materials: 0.4,
  subcontractors: 0.1,
  allowances: 0.05,
  contingency: 0.05,
};

function getTemplateAllocation(workAreaTypeKey: string): Allocation {
  return WORK_AREA_ALLOCATIONS[workAreaTypeKey] ?? DEFAULT_ALLOCATION;
}

function scopeAllocationToSplit(
  allocation: ScopeRateAllocation,
  contingency: number
): Allocation {
  const labour = allocation.labour;
  const materials = allocation.materials;
  const subcontractors = allocation.subcontractors;
  const allowances = allocation.allowances;
  const directTotal = labour + materials + subcontractors + allowances;
  if (directTotal <= 0) {
    return getTemplateAllocation("");
  }
  const scale = (1 - contingency) / directTotal;
  return {
    labour: labour * scale,
    materials: materials * scale,
    subcontractors: subcontractors * scale,
    allowances: allowances * scale,
    contingency,
  };
}

function splitAmount(total: number, allocation: Allocation) {
  return {
    labour: Math.round(total * allocation.labour),
    materials: Math.round(total * allocation.materials),
    subcontractors: Math.round(total * allocation.subcontractors),
    allowances: Math.round(total * allocation.allowances),
    contingency: Math.round(total * allocation.contingency),
  };
}

/** Indicative quick-estimate cost split — not a detailed quote. */
export function buildCostBreakdown(input: {
  centralEstimate: number;
  contingencyPercent: number;
  workAreas: {
    name: string;
    workAreaTypeKey: string;
    centralEstimate: number;
    scopeAllocation?: ScopeRateAllocation | null;
  }[];
}): CostBreakdown {
  const contingencyFraction = input.contingencyPercent / 100;

  const byWorkArea = input.workAreas.map((area) => {
    const allocation = area.scopeAllocation
      ? scopeAllocationToSplit(area.scopeAllocation, contingencyFraction)
      : getTemplateAllocation(area.workAreaTypeKey);
    const split = splitAmount(area.centralEstimate, allocation);
    return {
      name: area.name,
      workAreaTypeKey: area.workAreaTypeKey,
      total: area.centralEstimate,
      ...split,
    };
  });

  const labour = byWorkArea.reduce((sum, row) => sum + row.labour, 0);
  const materials = byWorkArea.reduce((sum, row) => sum + row.materials, 0);
  const subcontractors = byWorkArea.reduce(
    (sum, row) => sum + row.subcontractors,
    0
  );
  const allowances = byWorkArea.reduce((sum, row) => sum + row.allowances, 0);
  const contingencyFromSplit = byWorkArea.reduce(
    (sum, row) => sum + row.contingency,
    0
  );
  const contingencyFromPercent = Math.round(
    input.centralEstimate * contingencyFraction
  );
  const contingency = Math.max(contingencyFromSplit, contingencyFromPercent);

  return {
    labour,
    materials,
    subcontractors,
    allowances,
    contingency,
    byWorkArea,
    isIndicative: true,
  };
}

export type WorkAreaAllocationBreakdownPercents = {
  labourPercent: number;
  materialsPercent: number;
  subcontractorsPercent: number;
  allowancesPercent: number;
  source: "scope_rate" | "template" | "fallback";
};

export function templateAllocationPercents(
  workAreaTypeKey: string
): WorkAreaAllocationBreakdownPercents {
  const allocation = getTemplateAllocation(workAreaTypeKey);
  return {
    labourPercent: Math.round(allocation.labour * 100),
    materialsPercent: Math.round(allocation.materials * 100),
    subcontractorsPercent: Math.round(allocation.subcontractors * 100),
    allowancesPercent: Math.round(allocation.allowances * 100),
    source: "template",
  };
}
