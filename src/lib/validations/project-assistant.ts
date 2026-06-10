import { qualityLevelSchema } from "@/lib/constants/quality-level";
import { z } from "zod";

export const scopeQuestionAnswersSchema = z.object({
  answers: z.array(
    z.object({
      questionId: z.string().uuid(),
      answer: z.string().min(1),
    })
  ),
});

export const assistantConstraintsSchema = z.object({
  constraintSlugs: z.array(z.string()).default([]),
  qualityLevel: qualityLevelSchema.default("unknown"),
});

export const quickEstimateMarginSchema = z.object({
  targetMarginPercent: z.coerce
    .number()
    .min(0, "Margin must be at least 0%")
    .max(100, "Margin cannot exceed 100%"),
});

export type ScopeQuestionAnswersInput = z.infer<
  typeof scopeQuestionAnswersSchema
>;
