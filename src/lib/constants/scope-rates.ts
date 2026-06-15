import { deckScope } from "@/lib/scopes/deck";
import { fenceScope } from "@/lib/scopes/fence";
import { bathroomRenovationScope } from "@/lib/scopes/bathroom-renovation";
import { kitchenRenovationScope } from "@/lib/scopes/kitchen-renovation";
import { retainingWallScope } from "@/lib/scopes/retaining-wall";

export type ScopeRateDefinition = {
  scopeTypeKey: string;
  label: string;
  workAreaTypeKey: string;
  unit: string;
  unitLabel: string;
  benchmarkLow: number;
  benchmarkStandard: number;
  benchmarkPremium: number;
};

export const SCOPE_RATE_DEFINITIONS: ScopeRateDefinition[] = [
  {
    scopeTypeKey: deckScope.id,
    label: "Deck",
    workAreaTypeKey: deckScope.workAreaTypeKey,
    unit: deckScope.benchmarkRates.unit,
    unitLabel: "m²",
    benchmarkLow: deckScope.benchmarkRates.low,
    benchmarkStandard: deckScope.benchmarkRates.typical,
    benchmarkPremium: deckScope.benchmarkRates.high,
  },
  {
    scopeTypeKey: bathroomRenovationScope.id,
    label: "Bathroom renovation",
    workAreaTypeKey: bathroomRenovationScope.workAreaTypeKey,
    unit: bathroomRenovationScope.benchmarkRates.unit,
    unitLabel: "m²",
    benchmarkLow: bathroomRenovationScope.benchmarkRates.low,
    benchmarkStandard: bathroomRenovationScope.benchmarkRates.typical,
    benchmarkPremium: bathroomRenovationScope.benchmarkRates.high,
  },
  {
    scopeTypeKey: retainingWallScope.id,
    label: "Retaining wall",
    workAreaTypeKey: retainingWallScope.workAreaTypeKey,
    unit: retainingWallScope.benchmarkRates.unit,
    unitLabel: "m² wall face",
    benchmarkLow: retainingWallScope.benchmarkRates.low,
    benchmarkStandard: retainingWallScope.benchmarkRates.typical,
    benchmarkPremium: retainingWallScope.benchmarkRates.high,
  },
  {
    scopeTypeKey: fenceScope.id,
    label: "Fence",
    workAreaTypeKey: fenceScope.workAreaTypeKey,
    unit: fenceScope.benchmarkRates.unit,
    unitLabel: "m",
    benchmarkLow: fenceScope.benchmarkRates.low,
    benchmarkStandard: fenceScope.benchmarkRates.typical,
    benchmarkPremium: fenceScope.benchmarkRates.high,
  },
  {
    scopeTypeKey: kitchenRenovationScope.id,
    label: "Kitchen renovation",
    workAreaTypeKey: kitchenRenovationScope.workAreaTypeKey,
    unit: kitchenRenovationScope.benchmarkRates.unit,
    unitLabel: "kitchen",
    benchmarkLow: kitchenRenovationScope.benchmarkRates.low,
    benchmarkStandard: kitchenRenovationScope.benchmarkRates.typical,
    benchmarkPremium: kitchenRenovationScope.benchmarkRates.high,
  },
];

const BY_WORK_AREA = new Map(
  SCOPE_RATE_DEFINITIONS.map((def) => [def.workAreaTypeKey.toLowerCase(), def])
);

const BY_SCOPE_TYPE = new Map(
  SCOPE_RATE_DEFINITIONS.map((def) => [def.scopeTypeKey, def])
);

export function getScopeRateDefinition(
  workAreaTypeKey: string
): ScopeRateDefinition | undefined {
  return BY_WORK_AREA.get(workAreaTypeKey.toLowerCase());
}

export function getScopeRateDefinitionByKey(
  scopeTypeKey: string
): ScopeRateDefinition | undefined {
  return BY_SCOPE_TYPE.get(scopeTypeKey);
}

export function resolveScopeTypeKey(
  workAreaTypeKey: string,
  templateKey?: string
): string | undefined {
  if (templateKey && BY_SCOPE_TYPE.has(templateKey)) {
    return templateKey;
  }
  return getScopeRateDefinition(workAreaTypeKey)?.scopeTypeKey;
}
