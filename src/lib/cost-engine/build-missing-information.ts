import type { QualityLevel } from "@/lib/constants/quality-level";
import type { QuickEstimateWorkAreaInput } from "@/lib/cost-engine/quick-estimate-input";
import {
  getAllFactsForScope,
  getScopeByWorkAreaType,
} from "@/lib/scopes";
import { getMissingFactsForScope } from "@/lib/scopes/missing-facts";

export type ScopeQuestionForMissing = {
  questionKey: string | null;
  questionText: string;
  workAreaTypeKey: string;
  workAreaName: string;
  answerRaw: string | null;
  answerSource: string | null;
  inputType: import("@/lib/scope-answer-state").AnswerInputType;
  options: { value: string; label: string }[];
};

/** Local fallback when a scope fact key has no ScopeFactDefinition.label. */
const FALLBACK_FACT_LABELS: Record<string, string> = {
  "retaining_wall.height_m": "Wall height",
  "retaining_wall.length_m": "Wall length",
  "retaining_wall.material": "Wall material",
  "retaining_wall.has_drainage": "Drainage",
  "retaining_wall.drainage_required": "Drainage",
  "retaining_wall.carting_distance_m": "Carting distance",
  "retaining_wall.machine_access": "Machine access",
  "deck.area_m2": "Deck area",
  "deck.material": "Deck material",
  "deck.material_type": "Deck material",
  "deck.level": "Deck level",
  "deck.level_type": "Deck level",
  "bathroom.floor_area_m2": "Bathroom floor area",
  "bathroom.tile_extent": "Tile extent",
  "kitchen.size": "Kitchen size",
};

function humanizeFactKey(key: string): string {
  const segment = key.includes(".") ? key.split(".").pop()! : key;
  return segment
    .replace(/_m2$/, " area")
    .replace(/_m$/, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function resolveContractorLabel(
  value: string,
  workAreaTypeKey?: string
): string {
  const scope = workAreaTypeKey
    ? getScopeByWorkAreaType(workAreaTypeKey)
    : undefined;

  if (scope) {
    const fact = getAllFactsForScope(scope).find((f) => f.key === value);
    if (fact?.label) return fact.label;
  }

  if (FALLBACK_FACT_LABELS[value]) {
    return FALLBACK_FACT_LABELS[value];
  }

  if (/^[a-z_]+\.[a-z0-9_]+$/i.test(value)) {
    return humanizeFactKey(value);
  }

  return value;
}

/** Missing = required scope facts minus known facts. No duplicate question loops. */
export function buildMissingInformation(input: {
  workAreas: QuickEstimateWorkAreaInput[];
  effectiveQualityLevel: QualityLevel;
}): string[] {
  const missing: string[] = [];

  for (const area of input.workAreas) {
    const scope = getScopeByWorkAreaType(area.workAreaTypeKey);
    if (!scope) continue;

    for (const fact of getMissingFactsForScope(scope, area.answers)) {
      missing.push(
        resolveContractorLabel(fact.label || fact.key, area.workAreaTypeKey)
      );
    }
  }

  const normalized = [...new Set(missing.map((label) => resolveContractorLabel(label)))];

  if (input.effectiveQualityLevel === "unknown") {
    const hasBathroom = input.workAreas.some(
      (a) => a.workAreaTypeKey === "Bathroom renovation"
    );
    if (hasBathroom && !normalized.some((m) => m.toLowerCase().includes("finish"))) {
      normalized.push("Finish level");
    }
  }

  return normalized;
}
