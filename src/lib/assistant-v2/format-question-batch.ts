import { contextualQuestionText } from "@/lib/assistant-v2/build-assistant-messages";
import type { PricingQuestion } from "@/lib/assistant-v2/get-next-pricing-question";
import type { ConstraintQuestion } from "@/lib/assistant-v2/get-next-constraint-question";

export function formatScopeBatchContent(
  intro: string,
  questions: PricingQuestion[]
): string {
  const lines = questions.map(
    (q, i) => `${i + 1}. ${contextualQuestionText(q)}`
  );
  return `${intro}\n\n${lines.join("\n")}`;
}

export function formatConstraintBatchContent(
  constraints: ConstraintQuestion[]
): string {
  const items = constraints
    .map((c) => c.label.replace(/\?$/, "").replace(/^Is /, ""))
    .join(", ");
  return `Anything likely to make construction harder?\n${items}?`;
}

export function questionBatchFingerprint(
  kind: string,
  ids: string[]
): string {
  return `${kind}:${ids.sort().join(",")}`;
}
