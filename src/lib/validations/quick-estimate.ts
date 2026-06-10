import { z } from "zod";
import {
  QUICK_ESTIMATE_BUDGET_FIT,
  QUICK_ESTIMATE_CONFIDENCE_LEVELS,
  QUICK_ESTIMATE_QUESTIONS,
  QUICK_ESTIMATE_STATUSES,
} from "@/lib/constants/quick-estimate";

const statusValues = QUICK_ESTIMATE_STATUSES.map((s) => s.value) as [
  string,
  ...string[],
];
const confidenceValues = QUICK_ESTIMATE_CONFIDENCE_LEVELS.map((s) => s.value) as [
  string,
  ...string[],
];
const budgetFitValues = QUICK_ESTIMATE_BUDGET_FIT.map((s) => s.value) as [
  string,
  ...string[],
];

export const quickEstimateIdSchema = z.string().uuid();

export const quickEstimateNotesSchema = z.object({
  sourceNotes: z
    .string()
    .min(1, "Add a few notes about the job so we can estimate later."),
  clientBudget: z
    .string()
    .optional()
    .transform((val) => {
      if (!val?.trim()) return undefined;
      const num = Number(val);
      return Number.isFinite(num) && num >= 0 ? num : undefined;
    }),
});

export const quickEstimateAnswersSchema = z.object(
  Object.fromEntries(
    QUICK_ESTIMATE_QUESTIONS.map((q) => [
      q.key,
      q.type === "textarea" || q.type === "text"
        ? z.string().optional()
        : z.string().optional(),
    ])
  )
);

export const quickEstimateDriversSchema = z.object({
  driverIds: z.array(z.string().uuid()).default([]),
});

export const quickEstimateStatusSchema = z.enum(statusValues);
export const quickEstimateConfidenceSchema = z.enum(confidenceValues);
export const quickEstimateBudgetFitSchema = z.enum(budgetFitValues);

export type QuickEstimateActionState = {
  success?: boolean;
  message?: string;
  error?: string;
  fieldErrors?: Record<string, string[]>;
  quickEstimateId?: string;
  redirectStep?: number;
};
