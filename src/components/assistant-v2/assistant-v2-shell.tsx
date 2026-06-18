"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { resetAssistant, type AssistantSyncPayload } from "@/actions/assistant-v2";
import { AssistantChatProvider } from "@/components/assistant-v2/assistant-chat-context";
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
import {
  getCriticalOrUsefulMissing,
  getCurrentMissingItems,
  getOptionalMissing,
} from "@/lib/assistant-v2/missing/get-current-missing-items";
import {
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
  scopePackages: initialScopePackages,
  clientName,
  clientPhone,
  clientEmail,
}: AssistantV2ShellProps) {
  const router = useRouter();
  const [resetPending, startReset] = useTransition();
  const { recordEstimateSnapshot, breakdownOpenRequest } = useEstimateUpdate();

  const [liveEstimate, setLiveEstimate] = useState(quickEstimate);
  const [liveScopeQuestions, setLiveScopeQuestions] = useState(scopeQuestions);
  const [liveConfirmedScopes, setLiveConfirmedScopes] = useState(confirmedScopes);
  const [liveSuggestions, setLiveSuggestions] = useState(suggestions);
  const [liveDiscovery, setLiveDiscovery] = useState(discovery);
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
    setLiveSuggestions(suggestions);
    setLiveDiscovery(discovery);
    setLiveDeclinedConstraints(declinedConstraintSlugs);
    setLiveSelectedConstraints(selectedConstraintSlugs);
    setLiveChatMessages(chatMessages);
    setLiveScopePackages(initialScopePackages);
  }, [
    quickEstimate,
    scopeQuestions,
    confirmedScopes,
    suggestions,
    discovery,
    declinedConstraintSlugs,
    selectedConstraintSlugs,
    chatMessages,
    initialScopePackages,
  ]);

  const handleAssistantSync = useCallback((payload: AssistantSyncPayload) => {
    setLiveChatMessages(payload.chatMessages);
    setLiveEstimate(payload.quickEstimate);
    setLiveScopeQuestions(payload.scopeQuestions);
    setLiveConfirmedScopes(payload.confirmedScopes);
    setLiveSuggestions(payload.suggestions);
    setLiveDiscovery(payload.discovery);
    setLiveDeclinedConstraints(payload.declinedConstraintSlugs);
    setLiveSelectedConstraints(payload.selectedConstraintSlugs);
    setLiveScopePackages(payload.scopePackages ?? []);
  }, []);

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
        liveDiscovery
      ),
    }));
  }, [liveConfirmedScopes, liveScopeQuestions, liveDiscovery]);

  const finishLevel = normaliseQualityLevel(liveEstimate?.quality_level);

  const projectCompleteness: ProjectCompletenessResult = useMemo(() => {
    return evaluateAssistantProjectCompleteness({
      scopes: liveConfirmedScopes,
      scopeQuestions: liveScopeQuestions,
      discovery: liveDiscovery,
      qualityLevel: finishLevel,
      selectedConstraintSlugs: liveSelectedConstraints,
      declinedConstraintSlugs: liveDeclinedConstraints,
      pendingSuggestionCount: liveSuggestions.filter((s) => s.status === "pending")
        .length,
    });
  }, [
    liveConfirmedScopes,
    liveScopeQuestions,
    liveDiscovery,
    finishLevel,
    liveSelectedConstraints,
    liveDeclinedConstraints,
    liveSuggestions,
  ]);

  const completenessPercent = useMemo(
    () => computeProjectCompleteness(workAreas),
    [workAreas]
  );

  const estimateSummary = parseQuickEstimateSummary(liveEstimate?.notes ?? null);

  const qualityLevel = (liveEstimate?.confidence_level ??
    "low") as QuickEstimateConfidenceLevel;

  const estimateQualityTier = useMemo(() => {
    const includedCount = workAreas.filter((a) => a.included !== false).length;
    const missingItems = getCurrentMissingItems({
      workAreas: workAreas.map((area) => ({
        scopeId: area.scopeId ?? "",
        scopeName: area.scopeName ?? "Work area",
        workAreaTypeKey: area.workAreaTypeKey,
        answers: area.answers,
        included: area.included !== false,
      })),
      estimateTrace: estimateSummary?.estimateTrace,
    });
    const criticalOrUseful = getCriticalOrUsefulMissing(missingItems);
    const optionalOnly =
      criticalOrUseful.length === 0 &&
      getOptionalMissing(missingItems).length > 0;

    return resolveEstimateQualityTier({
      confidenceLevel: qualityLevel,
      confidenceScore:
        estimateSummary?.confidenceScore ?? projectCompleteness.overallCompleteness,
      hasKeyMeasurements:
        includedCount > 0 &&
        (projectCompleteness.overallCompleteness >= 50 ||
          projectCompleteness.projectStatus === "enough_for_draft" ||
          projectCompleteness.projectStatus === "quote_ready"),
      workAreasConfirmed: includedCount > 0,
      qualityLevel: finishLevel,
      siteConstraintsAssessed:
        (estimateSummary?.constraintsApplied?.length ?? 0) > 0 ||
        liveDeclinedConstraints.length > 0 ||
        projectCompleteness.projectStatus === "enough_for_draft" ||
        projectCompleteness.projectStatus === "quote_ready",
      missingInformationCount:
        criticalOrUseful.length > 0
          ? criticalOrUseful.length
          : (estimateSummary?.missingInformation?.length ?? 0),
      criticalOrUsefulMissingCount: criticalOrUseful.length,
      optionalOnlyMissing: optionalOnly,
    });
  }, [
    workAreas,
    qualityLevel,
    estimateSummary,
    projectCompleteness,
    liveDeclinedConstraints.length,
    finishLevel,
  ]);

  const qualityFactors = useMemo(() => {
    const included = workAreas.filter((a) => a.included !== false);
    const materialsKnown = included.some((area) =>
      Object.entries(area.answers).some(
        ([key, val]) => key.includes("material") && val && val !== "unknown"
      )
    );
    const accessKnown = included.some((area) =>
      Object.entries(area.answers).some(
        ([key, val]) =>
          (key.includes("access") || key.includes("level_type")) &&
          val &&
          val !== "unknown"
      )
    );

    return buildEstimateQualityFactors({
      hasKeyMeasurements: projectCompleteness.overallCompleteness >= 50,
      workAreasConfirmed: included.length > 0,
      qualityLevel: finishLevel,
      siteConstraintsAssessed:
        (estimateSummary?.constraintsApplied?.length ?? 0) > 0 ||
        liveDeclinedConstraints.length > 0,
      materialsKnown,
      accessKnown,
    });
  }, [
    workAreas,
    projectCompleteness.overallCompleteness,
    finishLevel,
    estimateSummary,
    liveDeclinedConstraints.length,
  ]);

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

  const estimatePanelBaseProps = {
    projectId,
    quickEstimate: liveEstimate,
    qualityFactors,
    lastEstimateChange: estimateSummary?.lastEstimateChange ?? null,
    costBreakdown: estimateSummary?.costBreakdown ?? null,
    confidenceScore: estimateSummary?.confidenceScore ?? completenessPercent,
    confidenceLevel: qualityLevel,
    qualityLevel: finishLevel,
    hasKeyMeasurements: projectCompleteness.overallCompleteness >= 50,
    workAreasConfirmed: workAreas.filter((a) => a.included !== false).length > 0,
    siteConstraintsAssessed:
      (estimateSummary?.constraintsApplied?.length ?? 0) > 0 ||
      liveDeclinedConstraints.length > 0 ||
      projectCompleteness.projectStatus === "enough_for_draft" ||
      projectCompleteness.projectStatus === "quote_ready",
    estimateTrace: estimateSummary?.estimateTrace ?? null,
    finishLevel: labelForQualityLevel(finishLevel),
    estimateIncludes: estimateSummary?.workAreasIncluded ?? [],
    estimateExcludes: estimateSummary?.workAreasExcluded ?? [],
    constraintsIncluded: estimateSummary?.constraintsApplied ?? [],
    allowancesIncluded: estimateSummary?.allowances ?? [],
    rateSourceLines: estimateSummary?.rateSourceLines ?? [],
    rateSourceDetail: estimateSummary?.rateSourceDetail ?? null,
    stagedRatePrompt: estimateSummary?.stagedRatePrompt ?? null,
    breakdownOpenRequest,
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
            <div className="border-b px-4 py-3 lg:hidden">
              <AssistantV2ConnectedEstimatePanel
                {...estimatePanelBaseProps}
                compact
              />
            </div>

            <div className="flex min-h-0 flex-1 flex-col">
              <AssistantV2Chat
                projectId={projectId}
                suggestions={liveSuggestions}
                confirmedScopes={liveConfirmedScopes}
                discovery={liveDiscovery}
                scopeGroups={scopeGroups}
                scopeQuestions={liveScopeQuestions}
                qualityLevel={finishLevel}
                projectCompleteness={projectCompleteness}
                showGreeting={showWelcome}
                benchmarkScopesForOnboarding={
                  estimateSummary?.benchmarkScopesForOnboarding ?? []
                }
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
                  discovery={liveDiscovery}
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
