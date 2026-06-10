import { z } from "zod";
import {
  DEFAULT_SCOPE_BUILDER_INPUT_STATUS,
  SCOPE_BUILDER_INPUT_TYPE_VALUES,
} from "@/lib/constants/scope-builder";

export const scopeBuilderInputSchema = z.object({
  inputType: z.enum(SCOPE_BUILDER_INPUT_TYPE_VALUES, {
    errorMap: () => ({ message: "Select what kind of note this is" }),
  }),
  content: z
    .string()
    .min(1, "Write something about the project")
    .max(10000, "Note is too long — try splitting into shorter entries"),
});

export type ScopeBuilderInput = z.infer<typeof scopeBuilderInputSchema>;

export const scopeBuilderInputIdSchema = z.string().uuid("Invalid note");

export const scopeBuilderInputUpdateSchema = scopeBuilderInputSchema;

export type ScopeBuilderActionState = {
  error?: string;
  success?: boolean;
  message?: string;
  fieldErrors?: Record<string, string[]>;
};

export { DEFAULT_SCOPE_BUILDER_INPUT_STATUS };
