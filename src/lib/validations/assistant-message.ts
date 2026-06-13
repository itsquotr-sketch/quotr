import { z } from "zod";
import { qualityLevelSchema } from "@/lib/constants/quality-level";

export const assistantMessageRoleSchema = z.enum(["user", "assistant", "system"]);

export const assistantMessageMetadataSchema = z
  .object({
    messageType: z
      .enum([
        "note",
        "answer",
        "quality_change",
        "constraint_answer",
        "assistant_text",
        "discovery_summary",
        "constraint_declined",
        "estimate_update",
        "command_confirmation",
        "fallback_options",
      ])
      .optional(),
    batchSize: z.number().optional(),
    questionId: z.string().uuid().optional(),
    questionKey: z.string().optional(),
    constraintSlug: z.string().optional(),
    qualityLevel: qualityLevelSchema.optional(),
    answerValue: z.string().optional(),
    optimisticId: z.string().optional(),
  })
  .passthrough();

export const insertAssistantMessageSchema = z.object({
  projectId: z.string().uuid(),
  role: assistantMessageRoleSchema,
  content: z.string().min(1).max(10000),
  metadata: assistantMessageMetadataSchema.optional(),
});

export type InsertAssistantMessageInput = z.infer<
  typeof insertAssistantMessageSchema
>;
