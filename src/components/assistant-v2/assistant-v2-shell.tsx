"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { resetAssistant, type AssistantSyncPayload } from "@/actions/assistant-v2";
import { AssistantChatProvider } from "@/components/assistant-v2/assistant-chat-context";
import { AssistantErrorBoundary } from "@/components/assistant-v2/assistant-error-boundary";
import { AssistantV2Chat } from "@/components/assistant-v2/assistant-v2-chat";
import { AssistantV2Composer } from "@/components/assistant-v2/assistant-v2-composer";
import { AssistantV2Header } from "@/components/assistant-v2/assistant-v2-header";
import { AssistantV2ConnectedEstimatePanel } from "@/components/assistant-v2/assistant-v2-connected-estimate-panel";
import { AssistantV2ProjectDetails } from "@/components/assistant-v2/assistant-v2-project-details";
import { AssistantV2WorkAreas } from "@/components/assistant-v2/assistant-v2-work-areas";
import {
  EstimateUpdateProvider,
  useEstimateUpdate,
} from "@/components/projects/estimate-update-context";
import { buildMergedAnswersForScope } from "@/lib/assistant-v2/build-merged-answers";
import type { AssistantMessageRow } from "@/lib/assistant-v2/assistant-messages-data";
import { evaluateAssistantProjectCompleteness } from "@/lib/assistant-v2/completeness/build-evaluate-input";
import type { ProjectCompletenessResult } from "@/lib/assistant-v2/completeness/evaluate-project-completeness";
import type { WorkAreaCompletenessInput } from "@/lib/assistant-v2/compute-information-completeness";
import type { ScopeGroupInput } from "@/lib/assistant-v2/get-next-pricing-question";
import {
  evaluateConfidence,
  confidenceStatusToTier,
} from "@/lib/assistant-v2/confidence/evaluate-confidence";
import { parseQuickEstimateSummary, resolveCalculationTrace } from "@/lib/project-assistant-summary";
import { labelForQualityLevel, normaliseQualityLevel } from "@/lib/constants/quality-level";
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
  ProjectScopePackage,
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
  scopePackages: ProjectScopePackage[];
  clientName: string;
  clientPhone: string | null;
  clientEmail: string | null;
}

export function AssistantV2Shell(props: AssistantV2ShellProps) {
  return (
    <EstimateUpdateProvider>
      <AssistantErrorBoundary projectId={props.projectId}>
        <AssistantV2ShellInner {...props} />
      </AssistantErrorBoundary>
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
  scopePackages: initialScopePackages,
  clientName,
  clientPhone,
  clientEmail,
}: AssistantV2ShellProps) {
  const router = useRouter();
  const [resetPending, startReset] = useTransition();
  const {
    recordEstimateSnapshot,
    breakdownOpenRequest,
    whyOpenRequest,
    isSyncCurrent,
  } = useEstimateUpdate();

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
  const [liveScopePackages, setLiveScopePackages] = useState(initialScopePackages);

  useEffect(() => {
    setLiveEstimate(quickEstimate);
    setLiveScopeQuestions(scopeQuestions);
    setLiveConfirmedScopes(confirmedScopes);
    setLiveDeclinedConstraints(declinedConstraintSlugs);
    setLiveSelectedConstraints(selectedConstraintSlugs);
    setLiveChatMessages(chatMessages);
    setLiveScopePackages(initialScopePackages);
  }, [
    quickEstimate,
    scopeQuestions,
    confirmedScopes,
    declinedConstraintSlugs,
    selectedConstraintSlugs,
    chatMessages,
    initialScopePackages,
  ]);

  const handleAssistantSync = useCallback(
    (payload: AssistantSyncPayload, syncVersion?: number) => {
      if (syncVersion !== undefined && !isSyncCurrent(syncVersion)) {
        return;
      }
      if (payload.chatMessages) setLiveChatMessages(payload.chatMessages);
      if (payload.quickEstimate !== undefined)
        setLiveEstimate(payload.quickEstimate);
      if (payload.scopeQuestions) setLiveScopeQuestions(payload.scopeQuestions);
      if (payload.confirmedScopes) setLiveConfirmedScopes(payload.confirmedScopes);
      if (payload.declinedConstraintSlugs)
        setLiveDeclinedConstraints(payload.declinedConstraintSlugs);
      if (payload.selectedConstraintSlugs)
        setLiveSelectedConstraints(payload.selectedConstraintSlugs);
      if (payload.scopePackages) setLiveScopePackages(payload.scopePackages);
    },
    [isSyncCurrent]
  );

  const scopeGroups: ScopeGroupInput[] = useMemo(() => {
    return liveConfirmedScopes
      .filter((scope) => scope.include_in_quick_estimate !== false)
      .map((scope) => ({
        scopeId: scope.id,
        scopeName: scope.name,
        scopeTypeName: scope.scope_types?.name ?? null,
        questions: liveScopeQuestions.filter((q) => q.project_scope_id === scope.id),
      }));
  }, [liveConfirmedScopes, liveScopeQuestions]);

  const workAreas: WorkAreaCompletenessInput[] = useMemo(() => {
    return liveConfirmedScopes.map((scope) => ({
      scopeId: scope.id,
      scopeName: scope.name,
      included: scope.include_in_quick_estimate !== false,
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

  const finishLevel = normaliseQualityLevel(liveEstimate?.quality_level);

  const projectCompleteness: ProjectCompletenessResult = useMemo(() => {
    return evaluateAssistantProjectCompleteness({
      scopes: liveConfirmedScopes,
      scopeQuestions: liveScopeQuestions,
      discovery,
      qualityLevel: finishLevel,
      selectedConstraintSlugs: liveSelectedConstraints,
      declinedConstraintSlugs: liveDeclinedConstraints,
      pendingSuggestionCount: suggestions.filter((s) => s.status === "pending")
        .length,
    });
  }, [
    liveConfirmedScopes,
    liveScopeQuestions,
    discovery,
    finishLevel,
    liveSelectedConstraints,
    liveDeclinedConstraints,
    suggestions,
  ]);

  const estimateSummary = parseQuickEstimateSummary(liveEstimate?.notes ?? null);

  const qualityLevel = (liveEstimate?.confidence_level ??
    "low") as QuickEstimateConfidenceLevel;

  const siteConstraintsAssessed =
    (estimateSummary?.constraintsApplied?.length ?? 0) > 0 ||
    liveDeclinedConstraints.length > 0 ||
    projectCompleteness.projectStatus === "enough_for_draft" ||
    projectCompleteness.projectStatus === "quote_ready";

  const confidenceEvaluation = useMemo(
    () =>
      evaluateConfidence({
        workAreas: workAreas.map((area) => ({
          scopeId: area.scopeId ?? "",
          scopeName: area.scopeName ?? "Work area",
          workAreaTypeKey: area.workAreaTypeKey,
          answers: area.answers,
          included: area.included !== false,
        })),
        qualityLevel: finishLevel,
        siteConstraintsAssessed,
        rateSourceLines: estimateSummary?.rateSourceLines,
      }),
    [
      workAreas,
      finishLevel,
      siteConstraintsAssessed,
      estimateSummary?.rateSourceLines,
    ]
  );

  const estimateQualityTier = confidenceStatusToTier(
    confidenceEvaluation.overallStatus
  );

  const costMid =
    liveEstimate?.estimated_cost_low != null &&
    liveEstimate?.estimated_cost_high != null
      ? (Number(liveEstimate.estimated_cost_low) +
          Number(liveEstimate.estimated_cost_high)) /
        2
      : null;

  useEffect(() => {
    recordEstimateSnapshot(costMid, confidenceEvaluation.overallScore);
    const timer = setTimeout(() => {
      sessionStorage.setItem(
        `quotr-v2-confidence-${projectId}`,
        String(confidenceEvaluation.overallScore)
      );
    }, 500);
    return () => clearTimeout(timer);
  }, [costMid, confidenceEvaluation.overallScore, projectId, recordEstimateSnapshot]);

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

  const estimatePanelBaseProps = {
    projectId,
    projectTitle: project.title,
    quickEstimate: liveEstimate,
    lastEstimateChange: estimateSummary?.lastEstimateChange ?? null,
    costBreakdown: estimateSummary?.costBreakdown ?? null,
    confidenceScore: confidenceEvaluation.overallScore,
    confidenceLevel: qualityLevel,
    qualityLevel: finishLevel,
    hasKeyMeasurements: projectCompleteness.overallCompleteness >= 50,
    workAreasConfirmed: workAreas.filter((a) => a.included !== false).length > 0,
    siteConstraintsAssessed,
    pendingSuggestionCount: suggestions.filter((s) => s.status === "pending")
      .length,
    sourceNotes: project.initial_notes ?? project.client_brief ?? "",
    scopeQuestions: liveScopeQuestions,
    discovery,
    selectedConstraintSlugs: liveSelectedConstraints,
    declinedConstraintSlugs: liveDeclinedConstraints,
    estimateTrace: estimateSummary?.estimateTrace ?? null,
    calculationTrace: resolveCalculationTrace(liveEstimate) ?? null,
    finishLevel: labelForQualityLevel(finishLevel),
    estimateIncludes: estimateSummary?.workAreasIncluded ?? [],
    estimateExcludes: estimateSummary?.workAreasExcluded ?? [],
    constraintsIncluded: estimateSummary?.constraintsApplied ?? [],
    allowancesIncluded: estimateSummary?.allowances ?? [],
    rateSourceLines: estimateSummary?.rateSourceLines ?? [],
    rateSourceDetail: estimateSummary?.rateSourceDetail ?? null,
    stagedRatePrompt: estimateSummary?.stagedRatePrompt ?? null,
    breakdownOpenRequest,
    whyOpenRequest,
    benchmarkScopesForOnboarding:
      estimateSummary?.benchmarkScopesForOnboarding ?? [],
    rangeWidthPercent: estimateSummary?.rangeWidthPercent ?? null,
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
        <AssistantChatProvider
          projectId={projectId}
          persistedMessages={liveChatMessages}
          initialWorkAreas={workAreas}
          selectedConstraintSlugs={liveSelectedConstraints}
          initialDeclinedConstraintSlugs={liveDeclinedConstraints}
          initialQualityLevel={finishLevel}
          onSync={handleAssistantSync}
        >
          <div className="flex min-w-0 flex-1 flex-col lg:w-[70%]">
            <div className="min-w-0 border-b px-4 py-3 lg:hidden">
              <AssistantV2ConnectedEstimatePanel
                {...estimatePanelBaseProps}
                compact
              />
            </div>

            <div className="flex min-h-0 flex-1 flex-col">
              <AssistantV2Chat
                projectId={projectId}
                suggestions={suggestions}
                confirmedScopes={liveConfirmedScopes}
                discovery={discovery}
                scopeGroups={scopeGroups}
                scopeQuestions={liveScopeQuestions}
                qualityLevel={finishLevel}
                quickEstimate={liveEstimate}
                sourceNotes={project.initial_notes ?? project.client_brief ?? ""}
                projectCompleteness={projectCompleteness}
                overallUnderstandingScore={confidenceEvaluation.overallScore}
                showGreeting={false}
                benchmarkScopesForOnboarding={
                  estimateSummary?.benchmarkScopesForOnboarding ?? []
                }
              />

              <div className="min-w-0 shrink-0 border-t bg-background px-4 py-3 lg:px-0">
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
                  scopePackages={liveScopePackages}
                />
                <AssistantV2ProjectDetails
                  project={project}
                  clientName={clientName}
                  clientPhone={clientPhone}
                  clientEmail={clientEmail}
                />
              </div>
            </div>
          </div>

          <aside className="hidden w-full shrink-0 lg:block lg:w-[30%]">
            <AssistantV2ConnectedEstimatePanel {...estimatePanelBaseProps} />
          </aside>
        </AssistantChatProvider>
      </div>
    </div>
  );
}
