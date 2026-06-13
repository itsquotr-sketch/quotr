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
import { buildMissingItemPrompt } from "@/lib/assistant-v2/missing/build-missing-item-prompt";
import {
  describeEstimateQualityTier,
  resolveEstimateQualityTier,
} from "@/lib/cost-engine/estimate-quality";
import type { QuickEstimateConfidenceLevel } from "@/lib/constants/quick-estimate";
import type { QualityLevel } from "@/lib/constants/quality-level";

type BasePanelProps = Omit<
  ComponentProps<typeof AssistantV2LiveEstimatePanel>,
  | "missingInformation"
  | "criticalMissing"
  | "optionalMissing"
  | "optionalOnlyMissing"
  | "estimateQualityTier"
  | "qualityTierDescription"
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
  estimateTrace?: import("@/lib/cost-engine/estimate-trace").EstimateTrace | null;
  rangeWidthPercent?: number | null;
};

export function AssistantV2ConnectedEstimatePanel({
  qualityLevel,
  confidenceLevel,
  confidenceScore,
  hasKeyMeasurements,
  workAreasConfirmed,
  siteConstraintsAssessed,
  estimateTrace,
  rangeWidthPercent = null,
  ...panelProps
}: BasePanelProps) {
  const {
    workAreas,
    optimisticAnswers,
    submitChatMessage,
    prefillComposer,
    submitQualityLevel,
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
        estimateTrace,
      }),
    [mergedWorkAreas, estimateTrace]
  );

  const criticalMissing = useMemo(
    () => getCriticalOrUsefulMissing(allMissingItems),
    [allMissingItems]
  );

  const optionalMissing = useMemo(
    () => getOptionalMissing(allMissingItems),
    [allMissingItems]
  );

  const optionalOnlyMissing =
    criticalMissing.length === 0 && optionalMissing.length > 0;

  const workAreaTypeKeys = useMemo(() => {
    const map: Record<string, string> = {};
    for (const area of mergedWorkAreas) {
      if (area.scopeId) {
        map[area.scopeId] = area.workAreaTypeKey;
      }
    }
    return map;
  }, [mergedWorkAreas]);

  const estimateQualityTier = useMemo(
    () =>
      resolveEstimateQualityTier({
        confidenceLevel,
        confidenceScore,
        hasKeyMeasurements,
        workAreasConfirmed,
        qualityLevel,
        siteConstraintsAssessed,
        missingInformationCount: criticalMissing.length + optionalMissing.length,
        criticalOrUsefulMissingCount: criticalMissing.length,
        optionalOnlyMissing,
      }),
    [
      confidenceLevel,
      confidenceScore,
      hasKeyMeasurements,
      workAreasConfirmed,
      qualityLevel,
      siteConstraintsAssessed,
      criticalMissing.length,
      optionalMissing.length,
      optionalOnlyMissing,
    ]
  );

  const qualityTierDescription = describeEstimateQualityTier(
    estimateQualityTier,
    { optionalOnlyMissing }
  );

  const missingInformation = criticalMissing.map((item) => item.label);

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

  const handleMissingItemAnswer = useCallback(
    (
      item: (typeof allMissingItems)[number],
      value: string,
      label: string
    ) => {
      const scopeName = item.scopeLabel;
      const factLabel = item.label
        .replace(`${scopeName}: `, "")
        .replace(/ not confirmed$/i, "");
      void submitChatMessage(`${scopeName} ${factLabel}: ${label}`);
    },
    [submitChatMessage]
  );

  const handleQualityLevelSelect = useCallback(
    (level: QualityLevel, label: string) => {
      submitQualityLevel(level, label);
    },
    [submitQualityLevel]
  );

  return (
    <AssistantV2LiveEstimatePanel
      {...panelProps}
      confidenceScore={confidenceScore}
      estimateQualityTier={estimateQualityTier}
      qualityTierDescription={qualityTierDescription}
      missingInformation={missingInformation}
      criticalMissing={criticalMissing.map((item) => item.label)}
      optionalMissing={optionalMissing.map((item) => item.label)}
      optionalOnlyMissing={optionalOnlyMissing}
      qualityLevelRaw={qualityLevel}
      rangeWidthPercent={rangeWidthPercent}
      estimateTrace={estimateTrace}
      actionableMissingItems={allMissingItems}
      workAreaTypeKeys={workAreaTypeKeys}
      onMissingItemClick={handleMissingItemClick}
      onMissingItemAnswer={handleMissingItemAnswer}
      onQualityLevelSelect={handleQualityLevelSelect}
    />
  );
}
