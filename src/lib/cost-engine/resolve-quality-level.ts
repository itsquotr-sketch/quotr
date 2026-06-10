import {
  normaliseQualityLevel,
  type QualityLevel,
} from "@/lib/constants/quality-level";
import type { DiscoveryResult } from "@/lib/discovery";
import { getAnswerValue } from "@/lib/question-keys";
import type { QuickEstimateWorkAreaInput } from "@/lib/cost-engine/quick-estimate-input";

/** Project-level quality wins, then scope answers, then discovery. */
export function resolveEffectiveQualityLevel(
  projectQuality: string | null | undefined,
  workAreas: QuickEstimateWorkAreaInput[],
  discovery: DiscoveryResult | null
): QualityLevel {
  const fromProject = normaliseQualityLevel(projectQuality);
  if (fromProject !== "unknown") return fromProject;

  const mergedAnswers: Record<string, string> = {};
  for (const area of workAreas) {
    Object.assign(mergedAnswers, area.answers);
  }

  const fromBathroom = getAnswerValue(mergedAnswers, "bathroom.finish_level");
  if (fromBathroom && fromBathroom !== "unknown") {
    return normaliseQualityLevel(fromBathroom);
  }

  const discoveryQuality = discovery?.qualityLevel?.value;
  if (discoveryQuality && discoveryQuality !== "unknown") {
    return normaliseQualityLevel(discoveryQuality);
  }

  return "unknown";
}
