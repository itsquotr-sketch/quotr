import type { QualityLevel } from "@/lib/constants/quality-level";

export type DetectedQualityLevel = {
  value: QualityLevel;
  confidence: number;
  reason: string;
};

const PREMIUM_KEYWORDS = [
  "high-end",
  "high end",
  "premium",
  "architectural",
  "designer",
  "luxury",
  "top spec",
  "high spec",
];

const BUDGET_KEYWORDS = [
  "cheap",
  "budget",
  "basic",
  "keep costs down",
  "cost effective",
  "cost-effective",
  "economy",
  "low cost",
  "affordable",
];

const STANDARD_KEYWORDS = [
  "standard",
  "mid-range",
  "mid range",
  "mid spec",
  "mid-spec",
  "normal finish",
  "typical finish",
  "standard finish",
];

function normaliseText(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function matchKeywords(text: string, keywords: string[]): string | null {
  for (const keyword of keywords) {
    if (text.includes(keyword)) {
      return keyword;
    }
  }
  return null;
}

/** Rule-based finish level detection from project notes. */
export function extractQualityLevelFromNotes(
  sourceNotes: string
): DetectedQualityLevel | null {
  const normalised = normaliseText(sourceNotes);
  if (!normalised) return null;

  const premium = matchKeywords(normalised, PREMIUM_KEYWORDS);
  if (premium) {
    return {
      value: "premium",
      confidence: 0.75,
      reason: `Notes mention "${premium}".`,
    };
  }

  const budget = matchKeywords(normalised, BUDGET_KEYWORDS);
  if (budget) {
    return {
      value: "budget",
      confidence: 0.75,
      reason: `Notes mention "${budget}".`,
    };
  }

  const standard = matchKeywords(normalised, STANDARD_KEYWORDS);
  if (standard) {
    return {
      value: "standard",
      confidence: 0.7,
      reason: `Notes mention "${standard}".`,
    };
  }

  return null;
}
