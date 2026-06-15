import type { PricingQuestion } from "@/lib/assistant-v2/get-next-pricing-question";

function parseNumberToken(token: string): string | null {
  const match = token.match(/(\d+(?:\.\d+)?)/);
  return match?.[1] ?? null;
}

function matchSelectValue(
  question: PricingQuestion,
  token: string
): string | null {
  const lower = token.toLowerCase().trim();
  for (const option of question.options) {
    if (lower.includes(option.label.toLowerCase())) return option.value;
    if (lower.includes(option.value.toLowerCase())) return option.value;
  }

  if (question.questionKey.includes("material")) {
    if (/\bcomposite\b/i.test(token)) return "composite";
    if (/\btimber\b|\bhardwood\b|\bwood\b/i.test(token)) return "timber";
  }

  if (question.questionKey.includes("level")) {
    if (/\belevated\b|\braised\b/i.test(token)) return "elevated";
    if (/\bground\b/i.test(token)) return "ground";
  }

  if (question.inputType === "boolean" || question.options.length === 2) {
    if (/\byes\b|\btrue\b/i.test(token)) return "yes";
    if (/\bno\b|\bnone\b|\bfalse\b/i.test(token)) return "no";
  }

  return null;
}

/**
 * Parses natural-language batch answers like "40sqm, elevated, timber".
 */
export function parseNaturalLanguageBatchAnswers(
  text: string,
  questions: PricingQuestion[]
): {
  questionId: string;
  questionKey: string;
  scopeId: string;
  answer: string;
  label: string;
}[] {
  const tokens = text
    .split(/[,;\n]+/)
    .map((t) => t.trim())
    .filter(Boolean);

  if (tokens.length === 0) return [];

  const results: {
    questionId: string;
    questionKey: string;
    scopeId: string;
    answer: string;
    label: string;
  }[] = [];
  const used = new Set<string>();

  for (const token of tokens) {
    for (const question of questions) {
      if (used.has(question.questionKey)) continue;

      if (question.inputType === "number") {
        const num = parseNumberToken(token);
        if (num) {
          const label = question.unit ? `${num} ${question.unit}` : num;
          results.push({
            questionId: question.questionId,
            questionKey: question.questionKey,
            scopeId: question.scopeId,
            answer: num,
            label,
          });
          used.add(question.questionKey);
          break;
        }
        continue;
      }

      const value = matchSelectValue(question, token);
      if (value) {
        const label =
          question.options.find((o) => o.value === value)?.label ?? value;
        results.push({
          questionId: question.questionId,
          questionKey: question.questionKey,
          scopeId: question.scopeId,
          answer: value,
          label,
        });
        used.add(question.questionKey);
        break;
      }

      if (question.inputType === "text" && token.length > 0) {
        results.push({
          questionId: question.questionId,
          questionKey: question.questionKey,
          scopeId: question.scopeId,
          answer: token,
          label: token,
        });
        used.add(question.questionKey);
        break;
      }
    }
  }

  return results;
}
