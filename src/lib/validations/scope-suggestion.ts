import { z } from "zod";

export const scopeSuggestionIdSchema = z.string().uuid("Invalid suggestion");

export const SCOPE_SUGGESTION_STATUSES = [
  "pending",
  "accepted",
  "rejected",
  "converted",
] as const;

export const scopeSuggestionStatusSchema = z.enum(SCOPE_SUGGESTION_STATUSES);

export type ScopeSuggestionActionState = {
  error?: string;
  success?: boolean;
  message?: string;
  fieldErrors?: Record<string, string[]>;
};

export const acceptScopeSuggestionSchema = z.object({
  name: z.string().min(1, "Work area name is required."),
  description: z.string().optional(),
  locationArea: z.string().optional(),
});
