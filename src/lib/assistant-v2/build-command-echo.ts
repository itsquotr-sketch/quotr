import { finishLevelLabel } from "@/lib/assistant-v2/intent/classify-assistant-intent";
import type {
  AssistantIntent,
  AssistantIntentPayload,
  ClassifiedAssistantIntent,
  UpdateFinishLevelPayload,
  UpdateMarginPayload,
  UpdateScopeFactPayload,
  WorkAreaCommandPayload,
} from "@/lib/assistant-v2/intent/types";
import { labelForAllowanceKey } from "@/lib/assistant-v2/intent/allowance-keys";

function formatFactValue(value: string, unit?: string): string {
  if (unit === "m²") return `${value}m²`;
  if (unit === "m") return `${value}m`;
  return value;
}

/**
 * Short acknowledgement shown immediately after classification, before recalculation.
 */
export function buildCommandEcho(
  classification: ClassifiedAssistantIntent
): string | null {
  const { intent, extractedPayload } = classification;
  const payload = extractedPayload as AssistantIntentPayload | null;

  switch (intent) {
    case "update_existing_fact": {
      const p = payload as UpdateScopeFactPayload | null;
      if (!p?.scopeName || !p.newValue) return null;
      const formatted = formatFactValue(p.newValue, p.unit);
      if (p.factKey.includes("material_supply") || p.factKey.includes("supplied")) {
        return `Got it — updating ${p.scopeName} material supply.`;
      }
      return `Got it — updating ${p.scopeName} ${p.factLabel.toLowerCase()} to ${formatted}.`;
    }
    case "exclude_work_area":
    case "remove_work_area": {
      const p = payload as WorkAreaCommandPayload | null;
      if (!p?.workAreaName) return null;
      return intent === "remove_work_area"
        ? `Got it — permanently removing ${p.workAreaName}.`
        : `Got it — removing ${p.workAreaName} from this estimate.`;
    }
    case "include_work_area": {
      const p = payload as WorkAreaCommandPayload | null;
      if (!p?.workAreaName) return null;
      return `Got it — including ${p.workAreaName} in this estimate.`;
    }
    case "add_work_area": {
      const p = payload as WorkAreaCommandPayload | null;
      if (!p?.workAreaName) return null;
      return `Got it — adding ${p.workAreaName}.`;
    }
    case "update_finish_level": {
      const p = payload as UpdateFinishLevelPayload | null;
      if (!p?.qualityLevel) return null;
      return `Got it — setting finish level to ${finishLevelLabel(p.qualityLevel)}.`;
    }
    case "update_allowance": {
      const p = payload as { label?: string; allowanceKey?: string; amount?: number } | null;
      const label =
        p?.label ??
        (p?.allowanceKey ? labelForAllowanceKey(p.allowanceKey) : "allowance");
      if (p?.amount && p.amount > 0) {
        return `Got it — updating ${label.toLowerCase()} to $${p.amount.toLocaleString("en-NZ")}.`;
      }
      return `Got it — updating ${label.toLowerCase()}.`;
    }
    case "remove_allowance": {
      const p = payload as { label?: string; allowanceKey?: string } | null;
      const label =
        p?.label ??
        (p?.allowanceKey ? labelForAllowanceKey(p.allowanceKey) : "allowance");
      return `Got it — removing ${label.toLowerCase()} from this estimate.`;
    }
    case "update_constraint": {
      const p = payload as { label?: string; apply?: boolean } | null;
      if (!p?.label) return null;
      return p.apply
        ? `Got it — applying ${p.label}.`
        : `Got it — removing ${p.label}.`;
    }
    case "update_margin": {
      const p = payload as UpdateMarginPayload | null;
      if (!p?.targetMarginPercent) return null;
      return `Got it — setting sell margin to ${p.targetMarginPercent}%.`;
    }
    default:
      return null;
  }
}

export function isActionIntent(intent: AssistantIntent): boolean {
  return ![
    "ask_question",
    "ask_refinement_question",
    "new_scope_notes",
    "unknown",
  ].includes(intent);
}
