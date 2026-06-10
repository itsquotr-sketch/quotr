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

export type ScopeQuestionAnswersInput = z.infer<
  typeof scopeQuestionAnswersSchema
>;
