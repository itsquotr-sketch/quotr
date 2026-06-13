import { z } from "zod";

export const estimateItemCandidateTypeSchema = z.enum([
  "allowance",
  "work_area",
  "trade",
  "scope_component",
  "unknown",
]);

export type EstimateItemCandidateType = z.infer<
  typeof estimateItemCandidateTypeSchema
>;

export const estimateItemSuggestedActionSchema = z.enum([
  "update",
  "add",
  "remove",
  "confirm",
]);

export type EstimateItemSuggestedAction = z.infer<
  typeof estimateItemSuggestedActionSchema
>;

export type EstimateItemCandidate = {
  itemType: EstimateItemCandidateType;
  itemId?: string;
  itemKey: string;
  label: string;
  currentAmount?: number;
  source: "project_allowance" | "estimate_trace" | "scope_template" | "breakdown" | "project_scope";
};

export const resolveEstimateItemResultSchema = z.object({
  matched: z.boolean(),
  confidence: z.number().min(0).max(1),
  itemType: estimateItemCandidateTypeSchema,
  itemId: z.string().optional(),
  itemKey: z.string().optional(),
  label: z.string().optional(),
  currentAmount: z.number().optional(),
  suggestedAction: estimateItemSuggestedActionSchema,
  reason: z.string(),
});

export type ResolveEstimateItemResult = z.infer<
  typeof resolveEstimateItemResultSchema
>;

export type ResolveEstimateItemParams = {
  projectId: string;
  organisationId: string;
  userCommand: string;
  candidateType: EstimateItemCandidateType;
  /** When set, prefer update/remove over add */
  commandIntent?: "update" | "remove" | "add";
  /** Parsed amount from command, if any */
  targetAmount?: number | null;
};
