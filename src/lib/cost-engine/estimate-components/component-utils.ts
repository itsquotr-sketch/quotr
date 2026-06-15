import { getAnswerValue } from "@/lib/question-keys";
import type { ScopeComponentDefinition } from "@/lib/scopes/templates/types";

export function parsePositiveNumber(value: string | undefined): number | null {
  if (value === undefined) return null;
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? num : null;
}

export function isYes(value: string | undefined): boolean {
  return value === "yes";
}

export function isComponentIncluded(
  component: ScopeComponentDefinition,
  answers: Record<string, string>
): boolean {
  for (const factKey of component.excludeWhenFacts ?? []) {
    const value = getAnswerValue(answers, factKey);
    if (value === "excluded" || value === "labour_only") return false;
    if (factKey.includes("client_supplied") && (value === "yes" || value === "partial")) {
      return false;
    }
    if (factKey.includes("supplied_by") && value === "client") return false;
    if (factKey.includes("material_supply") && value === "client_supplied") return false;
    if (factKey.includes("balustrade_supply") && value === "client_supplied") return false;
  }

  if (component.includeWhenFacts?.length) {
    return component.includeWhenFacts.some((factKey) => {
      const value = getAnswerValue(answers, factKey);
      return isYes(value) || value === "supply_and_install";
    });
  }

  return component.defaultIncluded ?? false;
}

export function derivePileCount(areaM2: number): number {
  return Math.max(4, Math.round(Math.sqrt(areaM2) * 2.5));
}

export function deriveBalustradeLengthM(areaM2: number): number {
  return Math.round(4 * Math.sqrt(areaM2) * 10) / 10;
}

export function deriveWetAreaM2(floorAreaM2: number): number {
  return Math.round(floorAreaM2 * 2.8 * 10) / 10;
}

export function deriveTileAreaM2(
  floorAreaM2: number,
  answers: Record<string, string>
): number {
  const extent =
    getAnswerValue(answers, "bathroom.tile_extent") ??
    getAnswerValue(answers, "bathroom.tile_height");
  if (extent === "full") return deriveWetAreaM2(floorAreaM2);
  if (extent === "partial") return Math.round(floorAreaM2 * 1.4 * 10) / 10;
  return Math.round(floorAreaM2 * 1.2 * 10) / 10;
}
