import type { CurrentMissingItem } from "@/lib/assistant-v2/missing/get-current-missing-items";
import {
  getCriticalOrUsefulMissing,
  getOptionalMissing,
} from "@/lib/assistant-v2/missing/get-current-missing-items";

export type RefinementPathForward = {
  success: true;
  message: string;
  pathType: "missing_critical" | "optional_refinements" | "highly_refined";
};

/**
 * Always provides a path forward when user asks for more detail.
 * Never returns a dead-end message.
 */
export function buildRefinementPathForward(
  missingItems: CurrentMissingItem[],
  options?: { scopeName?: string }
): RefinementPathForward {
  const critical = getCriticalOrUsefulMissing(missingItems);
  const optional = getOptionalMissing(missingItems);
  const scopeLabel = options?.scopeName ? ` for ${options.scopeName}` : "";

  if (critical.length > 0) {
    const lines = critical.slice(0, 5).map((item) => {
      const short = item.label.replace(/^[^:]+:\s*/, "").replace(/ not confirmed$/, "");
      return `• ${short}`;
    });
    return {
      success: true,
      pathType: "missing_critical",
      message: [
        `These details would improve confidence${scopeLabel}:`,
        "",
        ...lines,
        "",
        `${critical.length} item${critical.length === 1 ? "" : "s"} remaining — answer in chat or use the buttons below.`,
      ].join("\n"),
    };
  }

  if (optional.length > 0) {
    const lines = optional.slice(0, 5).map((item) => {
      const short = item.label.replace(/^[^:]+:\s*/, "").replace(/ not confirmed$/, "");
      return `• ${short}`;
    });
    return {
      success: true,
      pathType: "optional_refinements",
      message: [
        `Critical items are complete. These details could narrow the estimate range${scopeLabel}:`,
        "",
        ...lines,
        "",
        "Share any of these in chat, or add your contractor rates to sharpen further.",
      ].join("\n"),
    };
  }

  return {
    success: true,
    pathType: "highly_refined",
    message: [
      "You've provided enough information for a strong estimate.",
      "",
      "Next steps:",
      "• Review assumptions in the estimate breakdown",
      "• Review the cost breakdown",
      "• Add contractor rates for tighter pricing",
      "• Generate a detailed estimate when ready",
    ].join("\n"),
  };
}
