import { z } from "zod";

export const ASSISTANT_INTENT_VALUES = [
  "new_scope_notes",
  "update_existing_fact",
  "update_allowance",
  "remove_allowance",
  "update_constraint",
  "update_finish_level",
  "update_margin",
  "include_work_area",
  "exclude_work_area",
  "add_work_area",
  "remove_work_area",
  "only_include_work_areas",
  "ask_question",
  "ask_refinement_question",
  "unknown",
] as const;

export type AssistantIntent = (typeof ASSISTANT_INTENT_VALUES)[number];

export const assistantIntentSchema = z.enum(ASSISTANT_INTENT_VALUES);

/** >= 0.85: apply directly. 0.60–0.84: confirmation. < 0.60: clarification. */
export const CONFIDENCE_EXECUTE_THRESHOLD = 0.85;
export const CONFIDENCE_CONFIRM_THRESHOLD = 0.6;

export const ASSISTANT_RESPONSE_TYPES = [
  "action_applied",
  "confirmation_required",
  "clarification_required",
  "included_excluded_summary",
  "confidence_explanation",
  "sensitivity_summary",
  "rate_source_summary",
  "command_echo",
] as const;

export type AssistantResponseType = (typeof ASSISTANT_RESPONSE_TYPES)[number];

export const updateAllowancePayloadSchema = z.object({
  allowanceKey: z.string(),
  label: z.string(),
  amount: z.number().positive(),
  previousAmount: z.number().nullable().optional(),
});

export const removeAllowancePayloadSchema = z.object({
  allowanceKey: z.string(),
  label: z.string(),
});

export const updateFinishLevelPayloadSchema = z.object({
  qualityLevel: z.enum(["budget", "standard", "premium"]),
});

export const updateConstraintPayloadSchema = z.object({
  slug: z.string(),
  label: z.string(),
  apply: z.boolean(),
});

export const workAreaCommandPayloadSchema = z.object({
  workAreaName: z.string(),
  scopeId: z.string().uuid().optional(),
  isCustom: z.boolean().optional(),
  permanentDelete: z.boolean().optional(),
});

export const scopeFactUpdateItemSchema = z.object({
  factKey: z.string(),
  factLabel: z.string(),
  newValue: z.string(),
  previousValue: z.string().optional(),
  unit: z.string().optional(),
});

export const updateScopeFactPayloadSchema = z.object({
  scopeId: z.string().uuid(),
  scopeName: z.string(),
  factKey: z.string(),
  factLabel: z.string(),
  newValue: z.string(),
  previousValue: z.string().optional(),
  unit: z.string().optional(),
  additionalFacts: z.array(scopeFactUpdateItemSchema).optional(),
});

export const onlyIncludeWorkAreasPayloadSchema = z.object({
  includedWorkAreaNames: z.array(z.string()).min(1),
});

export const askQuestionPayloadSchema = z.object({
  questionType: z.enum([
    "breakdown",
    "whats_included",
    "whats_excluded",
    "assumptions",
    "confidence",
    "sensitivity",
    "rates",
    "sharpen_estimate",
    "internal_alteration",
    "general",
  ]),
  sensitivityMode: z.enum(["general", "cheaper", "expensive"]).optional(),
});

export const updateMarginPayloadSchema = z.object({
  targetMarginPercent: z.number().min(0).max(100),
  previousMarginPercent: z.number().nullable().optional(),
});

export type UpdateAllowancePayload = z.infer<typeof updateAllowancePayloadSchema>;
export type RemoveAllowancePayload = z.infer<typeof removeAllowancePayloadSchema>;
export type UpdateFinishLevelPayload = z.infer<
  typeof updateFinishLevelPayloadSchema
>;
export type UpdateConstraintPayload = z.infer<
  typeof updateConstraintPayloadSchema
>;
export type WorkAreaCommandPayload = z.infer<typeof workAreaCommandPayloadSchema>;
export type UpdateScopeFactPayload = z.infer<typeof updateScopeFactPayloadSchema>;
export type OnlyIncludeWorkAreasPayload = z.infer<
  typeof onlyIncludeWorkAreasPayloadSchema
>;
export type AskQuestionPayload = z.infer<typeof askQuestionPayloadSchema>;
export type UpdateMarginPayload = z.infer<typeof updateMarginPayloadSchema>;

export const askRefinementPayloadSchema = z.object({
  scopeId: z.string().uuid().optional(),
  scopeName: z.string().optional(),
});

export type AskRefinementPayload = z.infer<typeof askRefinementPayloadSchema>;

export type ScopeFactUpdateItem = z.infer<typeof scopeFactUpdateItemSchema>;

export type AssistantIntentPayload =
  | UpdateAllowancePayload
  | RemoveAllowancePayload
  | UpdateFinishLevelPayload
  | UpdateMarginPayload
  | UpdateConstraintPayload
  | WorkAreaCommandPayload
  | UpdateScopeFactPayload
  | OnlyIncludeWorkAreasPayload
  | AskQuestionPayload
  | AskRefinementPayload
  | Record<string, unknown>;

export type ClassifiedAssistantIntent = {
  intent: AssistantIntent;
  confidence: number;
  extractedPayload: AssistantIntentPayload | null;
  requiresConfirmation: boolean;
  confirmationMessage?: string;
  confirmationOptions?: { id: string; label: string }[];
  responseType?: AssistantResponseType;
  commandEcho?: string;
};

export type PendingAssistantCommand = {
  intent: AssistantIntent;
  confidence: number;
  extractedPayload: AssistantIntentPayload;
  requiresConfirmation: true;
};

export const FALLBACK_ACTION_OPTIONS = [
  { id: "update_allowance", label: "Update allowance" },
  { id: "add_work_area", label: "Add work area" },
  { id: "ask_question", label: "Ask question" },
  { id: "ignore", label: "Ignore" },
] as const;
