import { z } from "zod";

export const JOB_TYPES = [
  "New build",
  "Renovation",
  "Extension",
  "Repair",
  "Maintenance",
  "Other",
] as const;

export const measurementSchema = z.object({
  label: z.string().min(1, "Label is required"),
  value: z.string().min(1, "Value is required"),
  unit: z.string().optional(),
});

export const siteVisitSchema = z.object({
  title: z.string().min(1, "Give this visit a title"),
  clientName: z.string().min(1, "Client name is required"),
  clientPhone: z.string().optional(),
  siteAddress: z.string().min(1, "Site address is required"),
  jobType: z.enum(JOB_TYPES, {
    errorMap: () => ({ message: "Select a job type" }),
  }),
  notes: z.string().optional(),
  measurements: z.array(measurementSchema).default([]),
});

export type SiteVisitInput = z.infer<typeof siteVisitSchema>;
export type MeasurementInput = z.infer<typeof measurementSchema>;
