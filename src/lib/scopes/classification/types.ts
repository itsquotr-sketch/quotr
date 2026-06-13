import { z } from "zod";

export const scopeClassificationValues = [
  "work_area",
  "work_package",
  "broad_category",
  "unknown",
] as const;

export type ScopeClassification = (typeof scopeClassificationValues)[number];

export const scopeClassificationSchema = z.enum(scopeClassificationValues);

export const classifiedScopeResultSchema = z.object({
  inputLabel: z.string(),
  classification: scopeClassificationSchema,
  canonicalKey: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  reason: z.string(),
  suggestedChildren: z.array(z.string()).optional(),
});

export type ClassifiedScopeResult = z.infer<typeof classifiedScopeResultSchema>;

export type BroadCategoryClarification = {
  broadCategoryKey: string;
  displayLabel: string;
  sourceLabel: string;
  confidence: number;
};

export type HeldWorkPackage = {
  packageKey: string;
  label: string;
  parentWorkAreaKey: string | null;
  confidence: number;
  sourceLabel: string;
};

export type ProcessedDiscoveryItems = {
  workAreas: {
    typeKey: string;
    name: string;
    description: string;
    locationArea: string | null;
    confidence: number;
    matchedKeywords: string[];
    canonicalKey: string;
  }[];
  broadCategories: BroadCategoryClarification[];
  heldPackages: HeldWorkPackage[];
  unknownItems: { label: string; reason: string }[];
};

export const INTERNAL_WORKS_CLARIFICATION_OPTIONS = [
  { key: "demolition", label: "Demolition" },
  { key: "partitions", label: "New partitions/walls" },
  { key: "ceiling_works", label: "Ceiling works" },
  { key: "flooring", label: "Flooring" },
  { key: "painting", label: "Painting" },
  { key: "electrical", label: "Electrical changes" },
  { key: "plumbing", label: "Plumbing changes" },
  { key: "joinery", label: "Joinery/cabinetry" },
  { key: "rubbish_removal", label: "Rubbish removal" },
  { key: "other", label: "Other" },
] as const;

export type InternalWorksPackageKey =
  (typeof INTERNAL_WORKS_CLARIFICATION_OPTIONS)[number]["key"];
