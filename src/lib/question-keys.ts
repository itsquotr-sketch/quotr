/** Canonical namespaced question keys used across seeding, facts, and calculation. */

export const LEGACY_QUESTION_KEY_MAP: Record<string, string> = {
  deck_area: "deck.area_m2",
  elevated: "deck.level_type",
  deck_material: "deck.material_type",
  stairs: "deck.has_stairs",
  balustrade: "deck.has_balustrade",
  pergola: "deck.has_pergola",
  wall_length: "retaining_wall.length_m",
  wall_height: "retaining_wall.height_m",
  drainage: "retaining_wall.has_drainage",
  backfill: "retaining_wall.has_backfill",
  machine_access: "retaining_wall.machine_access",
  spoil_removal: "retaining_wall.has_spoil_removal",
  carting_distance: "retaining_wall.carting_distance_m",
  floor_area: "bathroom.floor_area_m2",
  layout_same: "bathroom.layout_changing",
  fixtures_client: "bathroom.fixtures_client_supplied",
  tiling_height: "bathroom.tile_height",
  waterproofing: "bathroom.waterproofing_included",
  rubbish_removal: "bathroom.rubbish_removal",
  bathroom_floor_area: "bathroom.floor_area_m2",
  retaining_wall_length: "retaining_wall.length_m",
  retaining_wall_height: "retaining_wall.height_m",
  paint_area: "painting.area_m2",
};

export function normalizeQuestionKey(
  key: string | null | undefined
): string | null {
  if (!key) return null;
  return LEGACY_QUESTION_KEY_MAP[key] ?? key;
}

function isNonEmptyAnswer(value: string | undefined): value is string {
  return value !== undefined && value !== null && value.trim() !== "";
}

/** Read an answer using canonical or legacy key names. */
export function getAnswerValue(
  answers: Record<string, string>,
  canonicalKey: string
): string | undefined {
  if (isNonEmptyAnswer(answers[canonicalKey])) {
    return answers[canonicalKey].trim();
  }
  for (const [legacy, canonical] of Object.entries(LEGACY_QUESTION_KEY_MAP)) {
    if (canonical === canonicalKey && isNonEmptyAnswer(answers[legacy])) {
      return answers[legacy].trim();
    }
  }
  return undefined;
}
