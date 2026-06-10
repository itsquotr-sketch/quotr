export function parseQuickEstimateSummary(notes: string | null): {
  workAreasIncluded: string[];
  questionsAnswered: number;
  questionsTotal: number;
  constraintsIncluded: string[];
  includedTrades: string[];
  allowances: string[];
  assumptions: string[];
  risks: string[];
  missingInformation: string[];
  inputsUsed: string[];
  ratesSource: "saved" | "fallback" | null;
  constraintsApplied: string[];
  qualityLevel?: string;
  qualityLevelNote?: string | null;
  templatesUsed?: string[];
  keyFactsUsed?: string[];
  confidenceReason?: string | null;
} | null {
  if (!notes) return null;
  try {
    const parsed = JSON.parse(notes) as {
      workAreasIncluded?: string[];
      questionsAnswered?: number;
      questionsTotal?: number;
      constraintsIncluded?: string[];
      includedTrades?: string[];
      allowances?: string[];
      assumptions?: string[];
      risks?: string[];
      missingInformation?: string[];
      inputsUsed?: string[];
      ratesSource?: "saved" | "fallback";
      constraintsApplied?: string[];
      qualityLevel?: string;
      qualityLevelNote?: string | null;
      templatesUsed?: string[];
      keyFactsUsed?: string[];
      confidenceReason?: string | null;
    };
    if (Array.isArray(parsed.includedTrades) || Array.isArray(parsed.workAreasIncluded)) {
      return {
        workAreasIncluded: parsed.workAreasIncluded ?? [],
        questionsAnswered: parsed.questionsAnswered ?? 0,
        questionsTotal: parsed.questionsTotal ?? 0,
        constraintsIncluded:
          parsed.constraintsApplied ?? parsed.constraintsIncluded ?? [],
        includedTrades: parsed.includedTrades ?? [],
        allowances: parsed.allowances ?? [],
        assumptions: parsed.assumptions ?? [],
        risks: parsed.risks ?? [],
        missingInformation: parsed.missingInformation ?? [],
        inputsUsed: parsed.inputsUsed ?? [],
        ratesSource: parsed.ratesSource ?? null,
        constraintsApplied:
          parsed.constraintsApplied ?? parsed.constraintsIncluded ?? [],
        qualityLevel: parsed.qualityLevel,
        qualityLevelNote: parsed.qualityLevelNote ?? null,
        templatesUsed: parsed.templatesUsed ?? [],
        keyFactsUsed: parsed.keyFactsUsed ?? [],
        confidenceReason: parsed.confidenceReason ?? null,
      };
    }
  } catch {
    return null;
  }
  return null;
}
