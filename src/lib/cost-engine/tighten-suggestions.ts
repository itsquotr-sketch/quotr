import { buildScopeTightenLabels } from "@/lib/scopes/missing-facts";
import {
  answerValueToString,
  isAnswered,
  isAnsweredSelect,
} from "@/lib/scope-answer-state";
import type { ScopeQuestionForMissing } from "@/lib/cost-engine/build-missing-information";

export type RangeDrivers = {
  lowDrivers: string[];
  highDrivers: string[];
  tightenSuggestions: string[];
};

const LOW_DRIVER_HINTS: Record<string, string> = {
  "deck.material_type": "Budget timber or composite selection",
  "deck.level_type": "Ground-level construction assumed",
  "bathroom.finish_level": "Budget or basic finish assumed",
  "bathroom.tile_extent": "Partial-height tiling assumed",
};

const HIGH_DRIVER_HINTS: Record<string, string> = {
  "deck.has_stairs": "Stairs allowance included",
  "deck.has_balustrade": "Balustrade allowance included",
  "deck.has_pergola": "Pergola allowance included",
  "deck.level_type": "Elevated deck construction",
  "retaining_wall.has_drainage": "Drainage allowance included",
  "retaining_wall.has_backfill": "Backfill allowance included",
  "bathroom.finish_level": "Premium finish selected",
  "bathroom.tile_extent": "Full-height tiling included",
  "bathroom.layout_changing": "Layout change allowance included",
};

export function buildRangeDrivers(input: {
  scopeQuestions: ScopeQuestionForMissing[];
  constraintsApplied: string[];
  qualityLevelNote: string | null;
  workAreaAnswers?: {
    workAreaTypeKey: string;
    workAreaName: string;
    answers: Record<string, string>;
  }[];
}): RangeDrivers {
  const lowDrivers: string[] = [];
  const highDrivers: string[] = [];

  const tightenSuggestions =
    input.workAreaAnswers && input.workAreaAnswers.length > 0
      ? buildScopeTightenLabels(
          input.workAreaAnswers.map((a) => ({
            name: a.workAreaName,
            workAreaTypeKey: a.workAreaTypeKey,
            answers: a.answers,
          }))
        )
      : [];

  for (const q of input.scopeQuestions) {
    const key = q.questionKey;
    if (!key) continue;

    const answered =
      q.inputType === "select" && q.options.length > 0
        ? isAnsweredSelect(q.answerRaw, q.answerSource, q.options)
        : isAnswered(q.answerRaw, q.answerSource, {
            inputType: q.inputType,
            requiresPositiveNumber: q.inputType === "number",
          });

    if (!answered) continue;

    const answerValue =
      answerValueToString(q.answerRaw, q.answerSource) ?? "";

    if (
      key in LOW_DRIVER_HINTS &&
      ["budget", "ground", "partial", "timber"].includes(answerValue)
    ) {
      lowDrivers.push(LOW_DRIVER_HINTS[key]!);
    }
    if (key in HIGH_DRIVER_HINTS) {
      if (
        answerValue === "yes" ||
        answerValue === "elevated" ||
        answerValue === "premium" ||
        answerValue === "full"
      ) {
        highDrivers.push(HIGH_DRIVER_HINTS[key]!);
      }
    }
  }

  for (const constraint of input.constraintsApplied) {
    highDrivers.push(`Site constraint: ${constraint}`);
  }

  if (input.qualityLevelNote?.toLowerCase().includes("unknown")) {
    tightenSuggestions.push("Finish level");
  }

  return {
    lowDrivers: [...new Set(lowDrivers)].slice(0, 4),
    highDrivers: [...new Set(highDrivers)].slice(0, 5),
    tightenSuggestions: [...new Set(tightenSuggestions)].slice(0, 6),
  };
}
