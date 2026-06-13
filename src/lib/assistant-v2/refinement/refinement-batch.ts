import { z } from "zod";
import { scopeRefinementSuggestionSchema } from "@/lib/assistant-v2/refinement/get-scope-refinement-suggestions";

export const refinementAnswerQuestionSchema = z.object({
  questionId: z.string().uuid(),
  questionKey: z.string(),
  questionText: z.string(),
  scopeId: z.string().uuid(),
  scopeName: z.string(),
  workAreaTypeKey: z.string(),
  inputType: z.enum(["text", "number", "select", "boolean"]),
  options: z.array(z.object({ value: z.string(), label: z.string() })),
  required: z.boolean().optional(),
  unit: z.string().optional(),
  placeholder: z.string().optional(),
});

export type RefinementAnswerQuestion = z.infer<
  typeof refinementAnswerQuestionSchema
>;

export const refinementSuggestionsMetadataSchema = z.object({
  messageType: z.literal("refinement_suggestions"),
  refinementBatchId: z.string(),
  suggestionsFingerprint: z.string(),
  suggestions: z.array(scopeRefinementSuggestionSchema),
  scopeId: z.string().uuid().nullable().optional(),
  scopeName: z.string().nullable().optional(),
  actionTaken: z.enum(["answer_now", "skipped", "add_rates"]).optional(),
  refinementSkipped: z.boolean().optional(),
});

export type RefinementSuggestionsMetadata = z.infer<
  typeof refinementSuggestionsMetadataSchema
>;

export function createRefinementBatchId(): string {
  return `ref_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function fingerprintSuggestions(
  suggestions: { factKey: string }[]
): string {
  return suggestions
    .map((s) => s.factKey)
    .filter((k) => k !== "contractor_rates")
    .sort()
    .join("|");
}

export function buildRefinementBatchIntro(
  questions: RefinementAnswerQuestion[],
  scopeNameHint?: string | null
): string {
  if (scopeNameHint) {
    return `Let's tighten the ${scopeNameHint.toLowerCase()} estimate.`;
  }

  const scopeNames = [...new Set(questions.map((q) => q.scopeName))];
  if (scopeNames.length === 1) {
    return `Let's tighten the ${scopeNames[0]!.toLowerCase()} estimate.`;
  }

  return "Let's tighten this estimate with a few quick details.";
}
