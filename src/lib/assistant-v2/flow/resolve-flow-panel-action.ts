import type { AssistantFlowResult } from "@/lib/assistant-v2/flow/resolve-assistant-flow-state";
import type { EstimatePanelState } from "@/lib/cost-engine/resolve-estimate-panel-state";

export type FlowPanelActionKind =
  | "scroll_chat"
  | "retry_estimate"
  | "view_estimate"
  | "add_rate";

export type FlowPanelAction = {
  kind: FlowPanelActionKind;
  label: string;
};

export function resolveFlowPanelAction(
  flow: AssistantFlowResult,
  panelState?: EstimatePanelState | null
): FlowPanelAction | null {
  if (panelState?.kind === "failed" && panelState.canRetry) {
    return { kind: "retry_estimate", label: "Retry estimate" };
  }

  switch (flow.state) {
    case "needs_work_area_confirmation":
      return { kind: "scroll_chat", label: "Confirm work areas" };
    case "needs_quality_confirmation":
      return { kind: "scroll_chat", label: "Choose spec level" };
    case "needs_required_scope_details":
      return { kind: "scroll_chat", label: "Answer missing details" };
    case "needs_pricing_source_confirmation":
      return { kind: "scroll_chat", label: "Resolve pricing" };
    case "needs_site_conditions":
      return { kind: "scroll_chat", label: "Confirm site conditions" };
    case "needs_confidence_refinement":
      if (flow.nextBestAction.type === "add_rate") {
        return { kind: "add_rate", label: "Add your rate" };
      }
      return {
        kind: "scroll_chat",
        label: flow.nextBestAction.label || "Improve estimate",
      };
    case "estimate_ready":
      return { kind: "view_estimate", label: "View estimate detail" };
    case "ready_for_estimate":
      return panelState?.canRetry
        ? { kind: "retry_estimate", label: "Retry estimate" }
        : null;
    default:
      return null;
  }
}
