import type { PricingQuestion } from "@/lib/assistant-v2/get-next-pricing-question";
import {
  formatKnownFactLabels,
  type WorkAreaCompletenessInput,
} from "@/lib/assistant-v2/compute-information-completeness";
import { resolveWorkAreaTypeKey } from "@/lib/project-assistant-questions";
import type { DiscoveryResult } from "@/lib/ai/discovery/types";
import type {
  ProjectScope,
  ProjectScopeBuilderInput,
} from "@/types/database";

export type AssistantMessage =
  | { type: "greeting" }
  | { type: "user_note"; content: string }
  | { type: "discovery_summary"; workAreaName: string; facts: string[] }
  | { type: "confirm_work_areas"; suggestions: { id: string; name: string }[] }
  | { type: "question"; question: PricingQuestion; completenessPercent: number }
  | { type: "ready"; completenessPercent: number }
  | {
      type: "answer_acknowledgement";
      scopeName: string;
      answerLabel: string;
      previousPercent: number;
      newPercent: number;
    };

export function buildAssistantMessages(input: {
  inputs: ProjectScopeBuilderInput[];
  confirmedScopes: (ProjectScope & { scope_types: { name: string } | null })[];
  suggestions: { id: string; suggested_name: string; status: string }[];
  discovery: DiscoveryResult | null;
  nextQuestion: PricingQuestion | null;
  workAreas: WorkAreaCompletenessInput[];
  completenessPercent: number;
}): AssistantMessage[] {
  const messages: AssistantMessage[] = [{ type: "greeting" }];

  const latestNote = input.inputs[input.inputs.length - 1];
  if (latestNote) {
    messages.push({ type: "user_note", content: latestNote.content });
  }

  if (input.inputs.length === 0) return messages;

  const pendingSuggestions = input.suggestions.filter((s) => s.status === "pending");

  if (input.discovery && input.confirmedScopes.length > 0) {
    const primary = input.confirmedScopes[0];
    const typeKey = resolveWorkAreaTypeKey(
      primary.scope_types?.name,
      primary.name
    );
    const areaInput = input.workAreas.find(
      (a) => a.workAreaTypeKey === typeKey
    );
    const facts = areaInput
      ? formatKnownFactLabels(typeKey, areaInput.answers)
      : [];

    messages.push({
      type: "discovery_summary",
      workAreaName: primary.name,
      facts,
    });
  } else if (pendingSuggestions.length > 0 && input.confirmedScopes.length === 0) {
    messages.push({
      type: "confirm_work_areas",
      suggestions: pendingSuggestions.map((s) => ({
        id: s.id,
        name: s.suggested_name,
      })),
    });
  }

  if (input.nextQuestion && input.confirmedScopes.length > 0) {
    messages.push({
      type: "question",
      question: input.nextQuestion,
      completenessPercent: input.completenessPercent,
    });
  } else if (
    !input.nextQuestion &&
    input.confirmedScopes.length > 0 &&
    input.discovery
  ) {
    messages.push({
      type: "ready",
      completenessPercent: input.completenessPercent,
    });
  }

  return messages;
}

export function buildQuestionIntro(
  question: PricingQuestion,
  knownFacts: string[]
): string {
  const lines: string[] = [];

  if (knownFacts.length > 0) {
    lines.push(`I found a ${question.scopeName.toLowerCase()} project.`);
    lines.push("");
    lines.push("Current information:");
  } else {
    lines.push(`To price the ${question.scopeName.toLowerCase()}, I need:`);
  }

  return lines.join("\n");
}

const PLAIN_QUESTION_LABELS: Record<string, string> = {
  "deck.level_type": "Is the deck ground-level or elevated?",
  "deck.has_balustrade": "Does the deck need balustrades?",
  "deck.has_stairs": "Are stairs included?",
  "deck.area_m2": "What's the deck area in square metres?",
  "deck.material_type": "What type of decking should I assume?",
  "retaining_wall.length_m": "How long is the retaining wall?",
  "retaining_wall.height_m": "How high is the retaining wall?",
  "retaining_wall.material": "What type of retaining wall should I assume?",
  "retaining_wall.drainage": "Is drainage required behind the wall?",
  "bathroom.area_m2": "What's the bathroom floor area?",
  "bathroom.finish_level": "What finish level should I assume for fixtures and finishes?",
  "bathroom.tile_extent": "How high are the tiles going?",
  "bathroom.layout_change": "Is the layout staying the same?",
  "fence.material_type": "What type of fencing should I assume?",
};

export function contextualQuestionText(question: PricingQuestion): string {
  return (
    PLAIN_QUESTION_LABELS[question.questionKey] ?? question.questionText
  );
}
