import type {
  ConfidenceEvaluationResult,
  ConfidenceStatus,
} from "@/lib/assistant-v2/confidence/evaluate-confidence";

/** Minimum per-scope target for proactive discovery (MVP). */
export const SCOPE_CONTINUATION_TARGET_SCORE = 70;

/** Project-level score where proactive questioning may stop if no scope is LOW. */
export const PROJECT_STOP_OVERALL_SCORE = 80;

export function scopeMeetsContinuationTarget(
  status: ConfidenceStatus
): boolean {
  return status === "good" || status === "ready";
}

export function scopeBelowFair(status: ConfidenceStatus): boolean {
  return status === "low";
}

export function countActionableConfidenceGaps(
  evaluation: ConfidenceEvaluationResult
): number {
  let count = 0;
  for (const scope of evaluation.scopes) {
    count += scope.missingCritical.length + scope.missingUseful.length;
  }
  return count;
}

export function scopesHeldBackByRatesOnly(
  evaluation: ConfidenceEvaluationResult
): string[] {
  return evaluation.scopes
    .filter(
      (s) =>
        !scopeMeetsContinuationTarget(s.status) &&
        s.missingCritical.length === 0 &&
        s.missingUseful.length === 0 &&
        s.nextBestAction.toLowerCase().includes("rate")
    )
    .map((s) => s.label);
}

export function shouldStopProactiveQuestions(input: {
  evaluation: ConfidenceEvaluationResult;
  userSkippedDetails?: boolean;
}): boolean {
  if (input.userSkippedDetails) return true;

  const { evaluation } = input;

  if (
    evaluation.scopes.length > 0 &&
    evaluation.scopes.every((s) => scopeMeetsContinuationTarget(s.status))
  ) {
    return true;
  }

  if (evaluation.optionalOnlyMissing) return true;

  const noScopeBelowFair = evaluation.scopes.every(
    (s) => !scopeBelowFair(s.status)
  );
  if (evaluation.overallScore >= PROJECT_STOP_OVERALL_SCORE && noScopeBelowFair) {
    return true;
  }

  return false;
}

export function needsConfidenceContinuation(input: {
  evaluation: ConfidenceEvaluationResult;
  userSkippedDetails?: boolean;
}): boolean {
  if (shouldStopProactiveQuestions(input)) return false;

  return input.evaluation.scopes.some(
    (s) => !scopeMeetsContinuationTarget(s.status)
  );
}

export function buildPostEstimateBatchIntro(
  evaluation: ConfidenceEvaluationResult
): string {
  const tier = evaluation.overallStatus.toUpperCase();
  const grouped = formatGroupedImprovementIntro(evaluation);

  if (evaluation.overallStatus === "low" || evaluation.overallStatus === "fair") {
    return `I have a rough estimate. To make it stronger, I need a few more details.\n\nYour estimate is currently ${tier}. These details will improve it:\n\n${grouped}`;
  }

  return `I have a draft estimate. These details will sharpen it:\n\n${grouped}`;
}

export function buildPreEstimateUsefulIntro(
  evaluation: ConfidenceEvaluationResult,
  questionCount: number
): string {
  const label =
    questionCount === 1
      ? "1 question to improve this estimate"
      : `${questionCount} questions to improve this estimate`;
  return `${label}\nThese are the highest-impact details. Site conditions come next.`;
}

function formatGroupedImprovementIntro(
  evaluation: ConfidenceEvaluationResult
): string {
  const sections: string[] = [];

  for (const scope of evaluation.scopes) {
    if (scopeMeetsContinuationTarget(scope.status)) continue;
    const gaps = [...scope.missingCritical, ...scope.missingUseful].slice(0, 3);
    if (gaps.length === 0) continue;
    const lines = gaps.map((g) => `- ${g}?`);
    sections.push(`${scope.label}:\n${lines.join("\n")}`);
  }

  return sections.join("\n\n");
}

export function buildStoppingStatusMessage(
  evaluation: ConfidenceEvaluationResult
): { title: string; subtitle: string } {
  const rateOnly = scopesHeldBackByRatesOnly(evaluation);
  if (rateOnly.length > 0) {
    const strong = evaluation.scopes.filter((s) =>
      scopeMeetsContinuationTarget(s.status)
    );
    if (strong.length > 0) {
      const strongLabel = strong.map((s) => s.label).join(" is strong. ");
      return {
        title: "You've provided enough information for a strong draft estimate.",
        subtitle: `${strongLabel}${rateOnly.join(" and ")} could still be improved by adding your rate.`,
      };
    }
    return {
      title: "You've provided enough information for a strong draft estimate.",
      subtitle: `Add your rate to improve pricing for ${rateOnly.join(" and ")}.`,
    };
  }

  return {
    title: "You've provided enough information for a strong draft estimate.",
    subtitle: "Check the live estimate — add more detail anytime to sharpen it.",
  };
}
