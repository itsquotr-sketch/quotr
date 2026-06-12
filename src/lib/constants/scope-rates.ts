import { deckScope } from "@/lib/scopes/deck";
import { bathroomRenovationScope } from "@/lib/scopes/bathroom-renovation";
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
