import { z } from "zod";
import {
  DEFAULT_PROJECT_STATUS,
  ENQUIRY_SOURCES,
  PROJECT_PRIORITIES,
  PROJECT_STATUS_VALUES,
} from "@/lib/constants/projects";

const enquirySourceValues = ENQUIRY_SOURCES.map((s) => s.value) as [
  string,
  ...string[],
];

const priorityValues = PROJECT_PRIORITIES.map((p) => p.value) as [
  string,
  ...string[],
];

export const projectStatusSchema = z.enum(PROJECT_STATUS_VALUES, {
  errorMap: () => ({ message: "Invalid project status" }),
});

export const projectSchema = z.object({
  title: z.string().min(1, "Give this project a title"),
  clientName: z.string().min(1, "Client name is required"),
  clientPhone: z.string().optional(),
  clientEmail: z
    .string()
    .email("Enter a valid email")
    .optional()
    .or(z.literal("")),
  siteAddress: z.string().min(1, "Site address is required"),
  enquirySource: z.enum(enquirySourceValues, {
    errorMap: () => ({ message: "Select how this enquiry came in" }),
  }),
  clientBrief: z.string().optional(),
  priority: z.enum(priorityValues, {
    errorMap: () => ({ message: "Select a priority" }),
  }),
  initialNotes: z.string().optional(),
});

export type ProjectInput = z.infer<typeof projectSchema>;

export { DEFAULT_PROJECT_STATUS };

export type ProjectActionState = {
  error?: string;
  fieldErrors?: Record<string, string[]>;
};
