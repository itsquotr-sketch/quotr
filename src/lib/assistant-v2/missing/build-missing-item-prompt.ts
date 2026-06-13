import type { CurrentMissingItem } from "@/lib/assistant-v2/missing/get-current-missing-items";
import { getScopeByWorkAreaType } from "@/lib/scopes";

export type MissingItemPrompt = {
  questionText: string;
  factKey: string;
  scopeId?: string;
  scopeName: string;
  options: { value: string; label: string }[];
  inputType: "select" | "number" | "boolean" | "text";
};

export function buildMissingItemPrompt(
  item: CurrentMissingItem,
  workAreaTypeKey: string
): MissingItemPrompt | null {
  const scope = getScopeByWorkAreaType(workAreaTypeKey);
  if (!scope) return null;

  const fact =
    scope.requiredFacts.find((f) => f.key === item.factKey) ??
    scope.optionalFacts.find((f) => f.key === item.factKey);

  if (!fact) {
    const genericQuestion = item.label.replace(/ not confirmed$/i, "?");
    return {
      questionText: genericQuestion.startsWith("?")
        ? `What should I assume for ${item.scopeLabel.toLowerCase()}?`
        : `${genericQuestion.charAt(0).toUpperCase()}${genericQuestion.slice(1)}`,
      factKey: item.factKey,
      scopeId: item.scopeId,
      scopeName: item.scopeLabel,
      options: [],
      inputType: "text",
    };
  }

  const questionText =
    fact.questionText ??
    `What ${fact.label.toLowerCase()} should I assume for ${item.scopeLabel}?`;

  return {
    questionText,
    factKey: fact.key,
    scopeId: item.scopeId,
    scopeName: item.scopeLabel,
    options: fact.options ?? [],
    inputType: fact.type === "number" ? "number" : fact.type,
  };
}
