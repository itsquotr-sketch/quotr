import { getAnswerValue } from "@/lib/question-keys";
import { shouldSuppressQuestionForDerivedValue } from "@/lib/assistant-v2/facts/measurement-resolver";

const ELEVATED_HEIGHT_THRESHOLD_M = 0.3;

function parsePositiveNumber(value: string | undefined | null): number | null {
  if (!value?.trim()) return null;
  const num = Number(value.trim());
  return Number.isFinite(num) && num > 0 ? num : null;
}

function hasMeaningfulAnswer(
  answers: Record<string, string>,
  factKey: string
): boolean {
  const value = getAnswerValue(answers, factKey);
  if (!value?.trim() || value.trim() === "unknown") return false;
  return true;
}

/**
 * Derive related facts from known measurements and mentions so the assistant
 * does not re-ask questions already answered implicitly.
 */
export function applyInferredFacts(
  answers: Record<string, string>
): Record<string, string> {
  const result = { ...answers };

  const deckHeight = parsePositiveNumber(getAnswerValue(result, "deck.height_m"));
  if (deckHeight != null && !hasMeaningfulAnswer(result, "deck.level_type")) {
    result["deck.level_type"] =
      deckHeight > ELEVATED_HEIGHT_THRESHOLD_M ? "elevated" : "ground";
  }

  const length = parsePositiveNumber(getAnswerValue(result, "deck.length_m"));
  const width = parsePositiveNumber(getAnswerValue(result, "deck.width_m"));
  if (
    length != null &&
    width != null &&
    !hasMeaningfulAnswer(result, "deck.area_m2")
  ) {
    const area = Math.round(length * width * 100) / 100;
    result["deck.area_m2"] = String(area);
  }

  const wallLength = parsePositiveNumber(
    getAnswerValue(result, "retaining_wall.length_m")
  );
  const wallHeight = parsePositiveNumber(
    getAnswerValue(result, "retaining_wall.height_m")
  );
  if (
    wallLength != null &&
    wallHeight != null &&
    !hasMeaningfulAnswer(result, "retaining_wall.wall_area_m2")
  ) {
    const wallArea = Math.round(wallLength * wallHeight * 100) / 100;
    result["retaining_wall.wall_area_m2"] = String(wallArea);
  }

  return result;
}

export function shouldSuppressQuestionAfterInference(
  factKey: string,
  answers: Record<string, string>
): boolean {
  const inferred = applyInferredFacts(answers);

  if (factKey === "deck.level_type") {
    const height = parsePositiveNumber(getAnswerValue(inferred, "deck.height_m"));
    if (height != null) return true;
  }

  if (
    factKey === "deck.area_m2" ||
    factKey === "retaining_wall.wall_area_m2"
  ) {
    return shouldSuppressQuestionForDerivedValue(factKey, inferred);
  }

  if (factKey === "fence.length_m") {
    return hasMeaningfulAnswer(inferred, "fence.length_m");
  }

  if (factKey === "bathroom.floor_area_m2" || factKey === "kitchen.floor_area_m2") {
    return shouldSuppressQuestionForDerivedValue(factKey, inferred);
  }

  return shouldSuppressQuestionForDerivedValue(factKey, inferred);
}
