import {
  buildRequiredScopeBatchIntro,
  describeFlowStatusMessage,
  flowBlocksSiteConditions,
  formatGroupedScopeQuestions,
  resolveAssistantFlowState,
  type AssistantFlowResult,
  type AssistantFlowState,
  type ResolveAssistantFlowInput,
} from "@/lib/assistant-v2/flow/resolve-assistant-flow-state";

export type AssistantStage = AssistantFlowState;

export type StageNextBestAction = AssistantFlowResult["nextBestAction"];

export type AssistantStageResult = AssistantFlowResult & { stage: AssistantFlowState };

export type ResolveAssistantStageInput = ResolveAssistantFlowInput;

export function resolveAssistantStage(
  input: ResolveAssistantStageInput
): AssistantStageResult {
  const result = resolveAssistantFlowState(input);
  return { ...result, stage: result.state };
}

export function stageBlocksSiteConditions(stage: AssistantStage): boolean {
  return flowBlocksSiteConditions(stage);
}

export { buildRequiredScopeBatchIntro, formatGroupedScopeQuestions, describeFlowStatusMessage };
