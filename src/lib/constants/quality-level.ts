import { z } from "zod";

export const QUALITY_LEVEL_VALUES = [
  "budget",
  "standard",
  "premium",
  "unknown",
] as const;

export type QualityLevel = (typeof QUALITY_LEVEL_VALUES)[number];

export const qualityLevelSchema = z.enum(QUALITY_LEVEL_VALUES);

export const QUALITY_LEVEL_OPTIONS: {
  value: QualityLevel;
  label: string;
  description: string;
}[] = [
  {
    value: "budget",
    label: "Budget / basic",
    description: "Lower specification materials and allowances.",
  },
  {
    value: "standard",
    label: "Standard / mid-range",
    description: "Typical residential specification.",
  },
  {
    value: "premium",
    label: "Premium / high-end",
    description: "Higher specification materials and subcontractor allowances.",
  },
  {
    value: "unknown",
    label: "Unknown",
    description: "Finish level not confirmed — estimate range kept wider.",
  },
];

export function labelForQualityLevel(value: string | null | undefined): string {
  const option = QUALITY_LEVEL_OPTIONS.find((item) => item.value === value);
  return option?.label ?? "Unknown";
}

export function normaliseQualityLevel(
  value: string | null | undefined
): QualityLevel {
  const parsed = qualityLevelSchema.safeParse(value);
  return parsed.success ? parsed.data : "unknown";
}
