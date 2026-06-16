"use client";

import { useCallback, useMemo } from "react";
import { AssistantV2LiveEstimatePanel } from "@/components/assistant-v2/assistant-v2-live-estimate-panel";
import { useAssistantChat } from "@/components/assistant-v2/assistant-chat-context";
import type { ComponentProps } from "react";
import {
  getCriticalOrUsefulMissing,
  getCurrentMissingItems,
  getOptionalMissing,
} from "@/lib/assistant-v2/missing/get-current-missing-items";
import { resolveAssistantFlowState } from "@/lib/assistant-v2/flow/resolve-assistant-flow-state";
import {
  resolveFlowPanelAction,
  type FlowPanelAction,
} from "@/lib/assistant-v2/flow/resolve-flow-panel-action";
import { collectAnsweredQuestionKeys } from "@/lib/assistant-v2/get-next-assistant-turn";
import { buildMissingItemPrompt } from "@/lib/assistant-v2/missing/build-missing-item-prompt";
import {
  evaluateConfidence,
  buildQualityFactorsFromEvaluation,
  confidenceStatusToTier,
} from "@/lib/assistant-v2/confidence/evaluate-confidence";
import { describeEstimateQualityTier } from "@/lib/cost-engine/estimate-quality";
import type { QuickEstimateConfidenceLevel } from "@/lib/constants/quick-estimate";
import type { QualityLevel } from "@/lib/constants/quality-level";
import { resolveEstimatePanelState } from "@/lib/cost-engine/resolve-estimate-panel-state";
import { normalizeQuestionKey } from "@/lib/question-keys";
import type { CurrentMissingItem } from "@/lib/assistant-v2/missing/get-current-missing-items";

type BasePanelProps = Omit<
  ComponentProps<typeof AssistantV2LiveEstimatePanel>,
  | "missingInformation"
  | "criticalMissing"
  | "optionalMissing"
  | "optionalOnlyMissing"
  | "estimateQualityTier"
  | "qualityTierDescription"
  | "qualityFactors"
  | "actionableMissingItems"
  | "workAreaTypeKeys"
  | "onMissingItemClick"
  | "onMissingItemAnswer"
  | "onQualityLevelSelect"
  | "qualityLevelRaw"
  | "rangeWidthPercent"
> & {
  qualityLevel: QualityLevel;
  confidenceLevel: QuickEstimateConfidenceLevel;
  hasKeyMeasurements: boolean;
  workAreasConfirmed: boolean;
  siteConstraintsAssessed: boolean;
  pendingSuggestionCount?: number;
  sourceNotes?: string;
  estimateTrace?: import("@/lib/cost-engine/estimate-trace").EstimateTrace | null;
  rangeWidthPercent?: number | null;
};

export function AssistantV2ConnectedEstimatePanel({
  qualityLevel,
  siteConstraintsAssessed,
  estimateTrace,
  rangeWidthPercent = null,
  pendingSuggestionCount = 0,
  sourceNotes = "",
  scopeQuestions = [],
  discovery = null,
  selectedConstraintSlugs = [],
  declinedConstraintSlugs = [],
  ...panelProps
}: BasePanelProps & {
  scopeQuestions?: import("@/lib/project-assistant-data").ScopeQuestionWithAnswers[];
  discovery?: import("@/lib/ai/discovery/types").DiscoveryResult | null;
  selectedConstraintSlugs?: string[];
  declinedConstraintSlugs?: string[];
}) {
  const {
    workAreas,
    optimisticAnswers,
    flushScopeBatch,
    prefillComposer,
    submitQualityLevel,
    effectiveDeclinedConstraintSlugs,
    optimisticConstraintSlugs,
  } = useAssistantChat();

  const mergedWorkAreas = useMemo(
    () =>
      workAreas.map((area) => ({
        scopeId: area.scopeId ?? "",
        scopeName: area.scopeName ?? "Work area",
        workAreaTypeKey: area.workAreaTypeKey,
        answers: { ...area.answers, ...optimisticAnswers },
        included: area.included !== false,
      })),
    [workAreas, optimisticAnswers]
  );

  const allMissingItems = useMemo(
    () =>
      getCurrentMissingItems({
        workAreas: mergedWorkAreas,
        estimateTrace: null,
        projectQualityLevel: qualityLevel,
      }),
    [mergedWorkAreas, qualityLevel]
  );

  const criticalMissing = useMemo(
    () => getCriticalOrUsefulMissing(allMissingItems),
    [allMissingItems]
  );

  const optionalMissing = useMemo(
    () => getOptionalMissing(allMissingItems),
    [allMissingItems]
  );

  const workAreaTypeKeys = useMemo(() => {
    const map: Record<string, string> = {};
    for (const area of mergedWorkAreas) {
      if (area.scopeId) {
        map[area.scopeId] = area.workAreaTypeKey;
      }
    }
    return map;
  }, [mergedWorkAreas]);

  const confidenceEvaluation = useMemo(
    () =>
      evaluateConfidence({
        workAreas: mergedWorkAreas,
        qualityLevel,
        siteConstraintsAssessed,
        rateSourceLines: panelProps.rateSourceLines,
      }),
    [
      mergedWorkAreas,
      qualityLevel,
      siteConstraintsAssessed,
      panelProps.rateSourceLines,
    ]
  );

  const optionalOnlyMissing =
    confidenceEvaluation.optionalOnlyMissing ||
    (criticalMissing.length === 0 && optionalMissing.length > 0);

  const estimateQualityTier = confidenceStatusToTier(
    confidenceEvaluation.overallStatus
  );

  const engineQualityFactors = useMemo(
    () => buildQualityFactorsFromEvaluation(confidenceEvaluation),
    [confidenceEvaluation]
  );

  const resolvedConfidenceScore = confidenceEvaluation.overallScore;

  const qualityTierDescription = describeEstimateQualityTier(
    estimateQualityTier,
    { optionalOnlyMissing }
  );

  const missingInformation = criticalMissing.map((item) => item.label);

  const flowPanelAction: FlowPanelAction | null = useMemo(() => {
    const flowWorkAreas = mergedWorkAreas.map((area) => ({
      scopeId: area.scopeId,
      scopeName: area.scopeName,
      workAreaTypeKey: area.workAreaTypeKey,
      answers: area.answers,
      included: area.included !== false,
    }));

    const answeredKeys = collectAnsweredQuestionKeys(scopeQuestions);
    for (const key of Object.keys(optimisticAnswers)) {
      answeredKeys.add(key);
    }

    const flow = resolveAssistantFlowState({
      workAreas: flowWorkAreas,
      pendingSuggestionCount,
      qualityLevel,
      selectedConstraintSlugs: optimisticConstraintSlugs.length
        ? optimisticConstraintSlugs
        : selectedConstraintSlugs,
      declinedConstraintSlugs: effectiveDeclinedConstraintSlugs.length
        ? effectiveDeclinedConstraintSlugs
        : declinedConstraintSlugs,
      discoveryConstraintSlugs: discovery?.constraints?.map((c) => c.slug),
      answeredQuestionKeys: answeredKeys,
      hasEstimate: panelProps.quickEstimate != null,
      estimateReady:
        panelProps.quickEstimate?.estimated_cost_low != null &&
        panelProps.quickEstimate?.estimated_cost_high != null &&
        (panelProps.quickEstimate?.estimate_status === "ready" ||
          panelProps.quickEstimate?.estimate_status === "partial"),
      sourceNotes,
    });

    const panelState = resolveEstimatePanelState(panelProps.quickEstimate);
    return resolveFlowPanelAction(flow, panelState);
  }, [
    mergedWorkAreas,
    scopeQuestions,
    optimisticAnswers,
    pendingSuggestionCount,
    qualityLevel,
    optimisticConstraintSlugs,
    selectedConstraintSlugs,
    effectiveDeclinedConstraintSlugs,
    declinedConstraintSlugs,
    discovery,
    panelProps.quickEstimate,
    sourceNotes,
  ]);

  const handleFlowPanelAction = useCallback(() => {
    if (!flowPanelAction) return;
    if (flowPanelAction.kind === "scroll_chat") {
      document
        .getElementById("assistant-pricing-questions")
        ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    } else if (flowPanelAction.kind === "view_estimate") {
      document
        .getElementById("assistant-live-estimate-panel")
        ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [flowPanelAction]);

  const handleMissingItemClick = useCallback(
    (
      item: (typeof allMissingItems)[number],
      prompt: ReturnType<typeof buildMissingItemPrompt>
    ) => {
      if (!prompt) return;
      prefillComposer(prompt.questionText);
    },
    [prefillComposer]
  );

  // Structured estimate facts must use flushScopeBatch, not submitChatMessage,
  // otherwise they will not persist to scope_answers or recalculate the estimate.
  const handleMissingItemAnswer = useCallback(
    (item: CurrentMissingItem, value: string, label: string) => {
      const question = scopeQuestions.find(
        (q) =>
          q.project_scope_id === item.scopeId &&
          normalizeQuestionKey(q.question_key) ===
            normalizeQuestionKey(item.factKey)
      );

      if (!question || !item.scopeId) {
        prefillComposer(`${item.scopeLabel}: ${item.label}: ${label}`);
        return;
      }

      flushScopeBatch([
        {
          questionId: question.id,
          questionKey: question.question_key ?? item.factKey,
          scopeId: item.scopeId,
          answer: value,
          label,
        },
      ]);
    },
    [scopeQuestions, flushScopeBatch, prefillComposer]
  );

  const handleQualityLevelSelect = useCallback(
    (level: QualityLevel, label: string) => {
      submitQualityLevel(level, label);
    },
    [submitQualityLevel]
  );

  const workAreaContexts = useMemo(
    () =>
      mergedWorkAreas.map((area) => ({
        scopeName: area.scopeName,
        workAreaTypeKey: area.workAreaTypeKey,
        answers: area.answers,
      })),
    [mergedWorkAreas]
  );

  return (
    <AssistantV2LiveEstimatePanel
      {...panelProps}
      confidenceScore={resolvedConfidenceScore}
      estimateQualityTier={estimateQualityTier}
      qualityTierDescription={qualityTierDescription}
      qualityFactors={engineQualityFactors}
      missingInformation={missingInformation}
      criticalMissing={criticalMissing.map((item) => item.label)}
      optionalMissing={optionalMissing.map((item) => item.label)}
      optionalOnlyMissing={optionalOnlyMissing}
      qualityLevelRaw={qualityLevel}
      rangeWidthPercent={rangeWidthPercent}
      estimateTrace={estimateTrace}
      actionableMissingItems={allMissingItems}
      workAreaTypeKeys={workAreaTypeKeys}
      workAreaContexts={workAreaContexts}
      onMissingItemClick={handleMissingItemClick}
      onMissingItemAnswer={handleMissingItemAnswer}
      onQualityLevelSelect={handleQualityLevelSelect}
      onPrefillComposer={prefillComposer}
      flowPanelAction={flowPanelAction}
      onFlowPanelAction={handleFlowPanelAction}
    />
  );
}
