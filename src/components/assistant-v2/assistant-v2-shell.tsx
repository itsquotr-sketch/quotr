"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { resetAssistant, type AssistantSyncPayload } from "@/actions/assistant-v2";
import { AssistantChatProvider } from "@/components/assistant-v2/assistant-chat-context";
import { AssistantV2Chat } from "@/components/assistant-v2/assistant-v2-chat";
import { AssistantV2Composer } from "@/components/assistant-v2/assistant-v2-composer";
import { AssistantV2Header } from "@/components/assistant-v2/assistant-v2-header";
import { AssistantV2LiveEstimatePanel } from "@/components/assistant-v2/assistant-v2-live-estimate-panel";
import { AssistantV2ProjectDetails } from "@/components/assistant-v2/assistant-v2-project-details";
import { AssistantV2WorkAreas } from "@/components/assistant-v2/assistant-v2-work-areas";
import {
  EstimateUpdateProvider,
  useEstimateUpdate,
} from "@/components/projects/estimate-update-context";
import { buildMergedAnswersForScope } from "@/lib/assistant-v2/build-merged-answers";
import type { AssistantMessageRow } from "@/lib/assistant-v2/assistant-messages-data";
import {
  buildMissingInformationLabels,
  computeProjectCompleteness,
  type WorkAreaCompletenessInput,
} from "@/lib/assistant-v2/compute-information-completeness";
import type { ScopeGroupInput } from "@/lib/assistant-v2/get-next-pricing-question";
import { parseQuickEstimateSummary } from "@/lib/project-assistant-summary";
import { labelForQualityLevel, normaliseQualityLevel } from "@/lib/constants/quality-level";
import {
  buildEstimateQualityFactors,
  resolveEstimateQualityTier,
} from "@/lib/cost-engine/estimate-quality";
import type { QuickEstimateConfidenceLevel } from "@/lib/constants/quick-estimate";
import type { DiscoveryResult } from "@/lib/ai/discovery/types";
import type { ScopeQuestionWithAnswers } from "@/lib/project-assistant-data";
import { resolveWorkAreaTypeKey } from "@/lib/project-assistant-questions";
import type {
  Project,
  ProjectScope,
  ProjectScopeBuilderInput,
  ProjectScopeSuggestion,
  QuickEstimate,
} from "@/types/database";

export interface AssistantV2ShellProps {
  project: Project;
  projectId: string;
  inputs: ProjectScopeBuilderInput[];
  suggestions: ProjectScopeSuggestion[];
  confirmedScopes: (ProjectScope & { scope_types: { name: string } | null })[];
  scopeQuestions: ScopeQuestionWithAnswers[];
  quickEstimate: QuickEstimate | null;
  selectedConstraintSlugs: string[];
  discovery: DiscoveryResult | null;
  chatMessages: AssistantMessageRow[];
  declinedConstraintSlugs: string[];
  clientName: string;
  clientPhone: string | null;
  clientEmail: string | null;
}

export function AssistantV2Shell(props: AssistantV2ShellProps) {
  return (
    <EstimateUpdateProvider>
      <AssistantV2ShellInner {...props} />
    </EstimateUpdateProvider>
  );
}

function AssistantV2ShellInner({
  project,
  projectId,
  suggestions,
  confirmedScopes,
  scopeQuestions,
  quickEstimate,
  discovery,
  selectedConstraintSlugs,
  chatMessages,
  declinedConstraintSlugs,
  clientName,
  clientPhone,
  clientEmail,
}: AssistantV2ShellProps) {
  const router = useRouter();
  const [resetPending, startReset] = useTransition();
  const { recordEstimateSnapshot } = useEstimateUpdate();

  const [liveEstimate, setLiveEstimate] = useState(quickEstimate);
  const [liveScopeQuestions, setLiveScopeQuestions] = useState(scopeQuestions);
  const [liveConfirmedScopes, setLiveConfirmedScopes] = useState(confirmedScopes);
  const [liveDeclinedConstraints, setLiveDeclinedConstraints] = useState(
    declinedConstraintSlugs
  );
  const [liveSelectedConstraints, setLiveSelectedConstraints] = useState(
    selectedConstraintSlugs
  );
  const [liveChatMessages, setLiveChatMessages] = useState(chatMessages);

  useEffect(() => {
    setLiveEstimate(quickEstimate);
    setLiveScopeQuestions(scopeQuestions);
    setLiveConfirmedScopes(confirmedScopes);
    setLiveDeclinedConstraints(declinedConstraintSlugs);
    setLiveSelectedConstraints(selectedConstraintSlugs);
    setLiveChatMessages(chatMessages);
  }, [
    quickEstimate,
    scopeQuestions,
    confirmedScopes,
    declinedConstraintSlugs,
    selectedConstraintSlugs,
    chatMessages,
  ]);

  const handleAssistantSync = useCallback((payload: AssistantSyncPayload) => {
    setLiveChatMessages(payload.chatMessages);
    setLiveEstimate(payload.quickEstimate);
    setLiveScopeQuestions(payload.scopeQuestions);
    setLiveConfirmedScopes(payload.confirmedScopes);
    setLiveDeclinedConstraints(payload.declinedConstraintSlugs);
    setLiveSelectedConstraints(payload.selectedConstraintSlugs);
  }, []);

  const scopeGroups: ScopeGroupInput[] = useMemo(() => {
    return liveConfirmedScopes.map((scope) => ({
      scopeId: scope.id,
      scopeName: scope.name,
      scopeTypeName: scope.scope_types?.name ?? null,
      questions: liveScopeQuestions.filter((q) => q.project_scope_id === scope.id),
    }));
  }, [liveConfirmedScopes, liveScopeQuestions]);

  const workAreas: WorkAreaCompletenessInput[] = useMemo(() => {
    return liveConfirmedScopes.map((scope) => ({
      workAreaTypeKey: resolveWorkAreaTypeKey(
        scope.scope_types?.name,
        scope.name
      ),
      answers: buildMergedAnswersForScope(
        scope.id,
        scope.name,
        scope.scope_types?.name ?? null,
        liveScopeQuestions,
        discovery
      ),
    }));
  }, [liveConfirmedScopes, liveScopeQuestions, discovery]);

  const completenessPercent = useMemo(
    () => computeProjectCompleteness(workAreas),
    [workAreas]
  );

  const estimateSummary = parseQuickEstimateSummary(liveEstimate?.notes ?? null);

  const qualityLevel = (liveEstimate?.confidence_level ??
    "low") as QuickEstimateConfidenceLevel;

  const finishLevel = normaliseQualityLevel(liveEstimate?.quality_level);

  const estimateQualityTier = useMemo(() => {
    return resolveEstimateQualityTier({
      confidenceLevel: qualityLevel,
      confidenceScore: estimateSummary?.confidenceScore ?? completenessPercent,
      hasKeyMeasurements: workAreas.length > 0 && completenessPercent >= 50,
      workAreasConfirmed: liveConfirmedScopes.length > 0,
      qualityLevel: finishLevel,
      siteConstraintsAssessed:
        (estimateSummary?.constraintsApplied?.length ?? 0) > 0 ||
        liveDeclinedConstraints.length > 0,
      missingInformationCount: estimateSummary?.missingInformation?.length ?? 0,
    });
  }, [
    workAreas,
    qualityLevel,
    estimateSummary,
    completenessPercent,
    liveConfirmedScopes.length,
    liveDeclinedConstraints.length,
    finishLevel,
  ]);

  const qualityFactors = useMemo(() => {
    const primary = workAreas[0];
    if (!primary) return [];
    return buildEstimateQualityFactors({
      hasKeyMeasurements: completenessPercent >= 50,
      workAreasConfirmed: liveConfirmedScopes.length > 0,
      qualityLevel: finishLevel,
      siteConstraintsAssessed:
        (estimateSummary?.constraintsApplied?.length ?? 0) > 0,
      materialsKnown: Object.entries(primary.answers).some(
        ([key, val]) => key.includes("material") && val && val !== "unknown"
      ),
      accessKnown: Object.entries(primary.answers).some(
        ([key, val]) =>
          (key.includes("access") || key.includes("level_type")) &&
          val &&
          val !== "unknown"
      ),
    });
  }, [
    workAreas,
    completenessPercent,
    liveConfirmedScopes.length,
    finishLevel,
    estimateSummary,
  ]);

  const missingInformation = useMemo(() => {
    const fromSummary = estimateSummary?.missingInformation ?? [];
    if (fromSummary.length > 0) return fromSummary;
    return buildMissingInformationLabels(workAreas);
  }, [estimateSummary, workAreas]);

  const costMid =
    liveEstimate?.estimated_cost_low != null &&
    liveEstimate?.estimated_cost_high != null
      ? (Number(liveEstimate.estimated_cost_low) +
          Number(liveEstimate.estimated_cost_high)) /
        2
      : null;

  useEffect(() => {
    recordEstimateSnapshot(costMid, completenessPercent);
    sessionStorage.setItem(
      `quotr-v2-confidence-${projectId}`,
      String(completenessPercent)
    );
  }, [costMid, completenessPercent, projectId, recordEstimateSnapshot]);

  function handleReset() {
    startReset(async () => {
      const result = await resetAssistant(projectId);
      if (!result.error) {
        setLiveEstimate(null);
        setLiveScopeQuestions([]);
        setLiveConfirmedScopes([]);
        setLiveDeclinedConstraints([]);
        setLiveSelectedConstraints([]);
        setLiveChatMessages([]);
        sessionStorage.removeItem(`quotr-v2-confidence-${projectId}`);
      }
      router.refresh();
    });
  }

  const showWelcome = liveChatMessages.length === 0;

  const estimatePanelProps = {
    projectId,
    quickEstimate: liveEstimate,
    estimateQualityTier,
    qualityFactors,
    missingInformation,
    lastEstimateChange: estimateSummary?.lastEstimateChange ?? null,
    costBreakdown: estimateSummary?.costBreakdown ?? null,
    confidenceScore: estimateSummary?.confidenceScore ?? completenessPercent,
    finishLevel: labelForQualityLevel(finishLevel),
    estimateIncludes: estimateSummary?.workAreasIncluded ?? [],
    estimateExcludes: estimateSummary?.workAreasExcluded ?? [],
    constraintsIncluded: estimateSummary?.constraintsApplied ?? [],
    allowancesIncluded: estimateSummary?.allowances ?? [],
    rateSourceLines: estimateSummary?.rateSourceLines ?? [],
    rateSourceDetail: estimateSummary?.rateSourceDetail ?? null,
    benchmarkScopesForOnboarding:
      estimateSummary?.benchmarkScopesForOnboarding ?? [],
    onEstimateSync: handleAssistantSync,
  };

  return (
    <div className="flex min-h-[calc(100dvh-4rem)] flex-col bg-background">
      <AssistantV2Header
        project={project}
        projectId={projectId}
        estimateQualityTier={estimateQualityTier}
        onReset={handleReset}
        resetPending={resetPending}
      />

      <div className="flex flex-1 flex-col lg:flex-row lg:gap-6 lg:px-6 lg:py-4">
        <div className="flex min-w-0 flex-1 flex-col lg:w-[70%]">
          <div className="border-b px-4 py-3 lg:hidden">
            <AssistantV2LiveEstimatePanel {...estimatePanelProps} compact />
          </div>

          <AssistantChatProvider
            projectId={projectId}
            persistedMessages={liveChatMessages}
            initialWorkAreas={workAreas}
            selectedConstraintSlugs={liveSelectedConstraints}
            initialDeclinedConstraintSlugs={liveDeclinedConstraints}
            initialQualityLevel={finishLevel}
            onSync={handleAssistantSync}
          >
            <div className="flex min-h-0 flex-1 flex-col">
              <AssistantV2Chat
                projectId={projectId}
                suggestions={suggestions}
                confirmedScopes={liveConfirmedScopes}
                discovery={discovery}
                scopeGroups={scopeGroups}
                scopeQuestions={liveScopeQuestions}
                qualityLevel={finishLevel}
                showGreeting={false}
              />

              <div className="shrink-0 border-t bg-background px-4 py-3 lg:px-0">
                <AssistantV2Composer
                  projectId={projectId}
                  showWelcome={showWelcome}
                />
              </div>

              <div className="space-y-4 px-4 pb-6 pt-4 lg:px-0">
                <AssistantV2WorkAreas
                  projectId={projectId}
                  confirmedScopes={liveConfirmedScopes}
                  scopeQuestions={liveScopeQuestions}
                  discovery={discovery}
                />
                <AssistantV2ProjectDetails
                  project={project}
                  clientName={clientName}
                  clientPhone={clientPhone}
                  clientEmail={clientEmail}
                />
              </div>
            </div>
          </AssistantChatProvider>
        </div>

        <aside className="hidden w-full shrink-0 lg:block lg:w-[30%]">
          <AssistantV2LiveEstimatePanel {...estimatePanelProps} />
        </aside>
      </div>
    </div>
  );
}
