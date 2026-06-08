import { z } from "zod";

export const onboardingSchema = z.object({
  organisationName: z
    .string()
    .min(2, "Enter your business name")
    .max(100, "Business name is too long"),
});

export type OnboardingInput = z.infer<typeof onboardingSchema>;
