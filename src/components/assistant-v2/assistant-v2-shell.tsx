"use client";

import { useEffect, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import { resetAssistant } from "@/actions/assistant-v2";
import { AssistantV2Chat } from "@/components/assistant-v2/assistant-v2-chat";
import { AssistantV2Composer } from "@/components/assistant-v2/assistant-v2-composer";
import { AssistantV2DownstreamSections } from "@/components/assistant-v2/assistant-v2-downstream-sections";
import { AssistantV2Header } from "@/components/assistant-v2/assistant-v2-header";
import { AssistantV2LiveEstimatePanel } from "@/components/assistant-v2/assistant-v2-live-estimate-panel";
import { AssistantV2WorkAreas } from "@/components/assistant-v2/assistant-v2-work-areas";
import { EstimateUpdateProvider } from "@/components/projects/estimate-update-context";
import { buildMergedAnswersForScope } from "@/lib/assistant-v2/build-merged-answers";
import {
  buildMissingInformationLabels,
  buildScopeConfidenceFactors,
  computeProjectCompleteness,
  type WorkAreaCompletenessInput,
} from "@/lib/assistant-v2/compute-information-completeness";
import {
  getNextPricingQuestion,
  type ScopeGroupInput,
} from "@/lib/assistant-v2/get-next-pricing-question";
import { parseQuickEstimateSummary } from "@/lib/project-assistant-summary";
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
  rfqCount?: number;
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
  inputs,
  suggestions,
  confirmedScopes,
  scopeQuestions,
  quickEstimate,
  discovery,
  rfqCount = 0,
}: AssistantV2ShellProps) {
  const router = useRouter();
  const [resetPending, startReset] = useTransition();

  const scopeGroups: ScopeGroupInput[] = useMemo(() => {
    return confirmedScopes.map((scope) => ({
      scopeId: scope.id,
      scopeName: scope.name,
      scopeTypeName: scope.scope_types?.name ?? null,
      questions: scopeQuestions.filter((q) => q.project_scope_id === scope.id),
    }));
  }, [confirmedScopes, scopeQuestions]);

  const workAreas: WorkAreaCompletenessInput[] = useMemo(() => {
    return confirmedScopes.map((scope) => ({
      workAreaTypeKey: resolveWorkAreaTypeKey(
        scope.scope_types?.name,
        scope.name
      ),
      answers: buildMergedAnswersForScope(
        scope.id,
        scope.name,
        scope.scope_types?.name ?? null,
        scopeQuestions,
        discovery
      ),
    }));
  }, [confirmedScopes, scopeQuestions, discovery]);

  const completenessPercent = useMemo(
    () => computeProjectCompleteness(workAreas),
    [workAreas]
  );

  const nextQuestion = useMemo(
    () =>
      getNextPricingQuestion({
        scopeGroups,
        discovery,
        scopeQuestions,
      }),
    [scopeGroups, discovery, scopeQuestions]
  );

  const estimateSummary = parseQuickEstimateSummary(quickEstimate?.notes ?? null);

  const qualityLevel = (quickEstimate?.confidence_level ??
    "low") as QuickEstimateConfidenceLevel;

  const confidenceFactors = useMemo(() => {
    if (workAreas.length === 0) return [];
    const primary = workAreas[0];
    return buildScopeConfidenceFactors(
      primary.workAreaTypeKey,
      primary.answers
    );
  }, [workAreas]);

  const missingInformation = useMemo(() => {
    const fromSummary = estimateSummary?.missingInformation ?? [];
    if (fromSummary.length > 0) return fromSummary;
    return buildMissingInformationLabels(workAreas);
  }, [estimateSummary, workAreas]);

  useEffect(() => {
    sessionStorage.setItem(
      `quotr-v2-confidence-${projectId}`,
      String(completenessPercent)
    );
  }, [completenessPercent, projectId]);

  function handleReset() {
    startReset(async () => {
      await resetAssistant(projectId);
      router.refresh();
    });
  }

  return (
    <div className="flex min-h-[calc(100dvh-4rem)] flex-col bg-background">
      <AssistantV2Header
        project={project}
        projectId={projectId}
        completenessPercent={completenessPercent}
        onReset={handleReset}
        resetPending={resetPending}
      />

      <div className="flex flex-1 flex-col lg:flex-row lg:gap-6 lg:px-6 lg:py-6">
        <div className="flex min-w-0 flex-1 flex-col lg:w-[70%]">
          <div className="flex-1 overflow-y-auto px-4 py-4 lg:px-0 lg:py-0">
            <AssistantV2Chat
              projectId={projectId}
              inputs={inputs}
              confirmedScopes={confirmedScopes}
              suggestions={suggestions}
              discovery={discovery}
              nextQuestion={nextQuestion}
              workAreas={workAreas}
              completenessPercent={completenessPercent}
            />

            {process.env.NODE_ENV === "development" && (
              <div className="mt-6 space-y-6">
                <AssistantV2WorkAreas
                  projectId={projectId}
                  confirmedScopes={confirmedScopes}
                  scopeQuestions={scopeQuestions}
                  discovery={discovery}
                />
                <AssistantV2DownstreamSections rfqCount={rfqCount} />
              </div>
            )}
          </div>

          <div className="border-t bg-background px-4 py-3 lg:hidden">
            <AssistantV2LiveEstimatePanel
              projectId={projectId}
              quickEstimate={quickEstimate}
              qualityLevel={qualityLevel}
              completenessPercent={completenessPercent}
              confidenceFactors={confidenceFactors}
              missingInformation={missingInformation}
            />
          </div>

          <div className="border-t px-4 py-3 lg:px-0">
            <AssistantV2Composer projectId={projectId} />
          </div>
        </div>

        <aside className="hidden w-full shrink-0 lg:block lg:w-[30%]">
          <AssistantV2LiveEstimatePanel
            projectId={projectId}
            quickEstimate={quickEstimate}
            qualityLevel={qualityLevel}
            completenessPercent={completenessPercent}
            confidenceFactors={confidenceFactors}
            missingInformation={missingInformation}
          />
        </aside>
      </div>
    </div>
  );
}
