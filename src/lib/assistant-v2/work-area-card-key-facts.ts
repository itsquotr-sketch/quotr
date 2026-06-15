import { getScopeByWorkAreaType } from "@/lib/scopes/index";
import type { ScopeFactDefinition } from "@/lib/scopes/types";

/** Priority-ordered fact keys shown in work area card summaries (max 5). */
const CARD_KEY_FACT_KEYS: Record<string, string[]> = {
  Deck: [
    "deck.area_m2",
    "deck.material_type",
    "deck.level_type",
    "deck.has_stairs",
    "deck.has_balustrade",
    "deck.has_pergola",
  ],
  Fence: [
    "fence.length_m",
    "fence.height_m",
    "fence.fence_type",
    "fence.material_type",
    "fence.gate_included",
    "fence.demolition_existing",
  ],
  "Retaining Wall": [
    "retaining_wall.length_m",
    "retaining_wall.height_m",
    "retaining_wall.material",
    "retaining_wall.has_drainage",
    "retaining_wall.machine_access",
  ],
  "Bathroom renovation": [
    "bathroom.floor_area_m2",
    "bathroom.finish_level",
    "bathroom.tile_extent",
    "bathroom.layout_changing",
    "bathroom.fixtures_client_supplied",
  ],
  "Kitchen renovation": [
    "kitchen.kitchen_size_type",
    "kitchen.demolition_required",
    "kitchen.layout_changing",
    "kitchen.benchtop_type",
    "kitchen.appliances_client_supplied",
  ],
};

export function getCardKeyFactDefinitions(
  workAreaTypeKey: string
): ScopeFactDefinition[] {
  const scope = getScopeByWorkAreaType(workAreaTypeKey);
  if (!scope) return [];

  const priorityKeys = CARD_KEY_FACT_KEYS[workAreaTypeKey];
  if (!priorityKeys?.length) {
    return scope.requiredFacts.slice(0, 5);
  }

  const allFacts = [...scope.requiredFacts, ...scope.optionalFacts];
  const byKey = new Map(allFacts.map((f) => [f.key, f]));

  const ordered: ScopeFactDefinition[] = [];
  for (const key of priorityKeys) {
    const fact = byKey.get(key);
    if (fact) ordered.push(fact);
  }
  return ordered.slice(0, 5);
}
