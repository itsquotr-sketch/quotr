import { z } from "zod";

export const measurementSchema = z.object({
  label: z.string().min(1, "Label is required"),
  value: z.string().min(1, "Value is required"),
  unit: z.string().optional(),
});

export const scopeSchema = z
  .object({
    scopeTypeId: z.string().optional(),
    isCustom: z.boolean().default(false),
    customScopeName: z.string().optional(),
    name: z.string().optional(),
    description: z.string().optional(),
    locationArea: z.string().optional(),
    notes: z.string().optional(),
    measurements: z.array(measurementSchema).default([]),
  })
  .superRefine((data, ctx) => {
    if (data.isCustom) {
      if (!data.customScopeName?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Enter a name for your custom scope",
          path: ["customScopeName"],
        });
      }
    } else if (!data.scopeTypeId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Select a scope type",
        path: ["scopeTypeId"],
      });
    }
  });

export type ScopeInput = z.infer<typeof scopeSchema>;
export type MeasurementInput = z.infer<typeof measurementSchema>;

export type ScopeActionState = {
  error?: string;
  fieldErrors?: Record<string, string[]>;
};
