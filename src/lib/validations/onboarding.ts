import { z } from "zod";
import {
  BUSINESS_TYPES,
  COMPANY_SIZES,
  QUOTING_VOLUMES,
} from "@/lib/constants/onboarding";

const businessTypeValues = BUSINESS_TYPES.map((t) => t.value) as [
  string,
  ...string[],
];

const companySizeValues = COMPANY_SIZES.map((s) => s.value) as [
  string,
  ...string[],
];

const quotingVolumeValues = QUOTING_VOLUMES.map((v) => v.value) as [
  string,
  ...string[],
];

export const onboardingSchema = z.object({
  firstName: z.string().min(1, "Enter your first name"),
  lastName: z.string().min(1, "Enter your last name"),
  phone: z.string().min(1, "Enter your phone number"),
  jobTitle: z.string().min(1, "Enter your job title"),
  tradingName: z
    .string()
    .min(2, "Enter your company or trading name")
    .max(100, "Name is too long"),
  legalName: z.string().optional(),
  businessType: z.enum(businessTypeValues, {
    errorMap: () => ({ message: "Select your business type" }),
  }),
  primaryTrade: z.string().min(1, "Enter your primary trade"),
  companySize: z.enum(companySizeValues, {
    errorMap: () => ({ message: "Select your company size" }),
  }),
  quotingVolume: z.enum(quotingVolumeValues, {
    errorMap: () => ({ message: "Select your quoting volume" }),
  }),
  companyPhone: z.string().min(1, "Enter a company phone number"),
  companyEmail: z.string().email("Enter a valid company email"),
  website: z
    .string()
    .url("Enter a valid website URL")
    .optional()
    .or(z.literal("")),
  city: z.string().min(1, "Enter your city"),
  region: z.string().min(1, "Enter your region"),
});

export type OnboardingInput = z.infer<typeof onboardingSchema>;

export type OnboardingActionState = {
  error?: string;
  success?: string;
  fieldErrors?: Record<string, string[]>;
};
