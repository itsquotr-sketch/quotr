"use client";

import { useMemo, useState, useTransition } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { resetAssistant } from "@/actions/assistant-v2";
import { AssistantV2ResetDialog } from "@/components/assistant-v2/assistant-v2-reset-dialog";
import { AssistantFlowProvider, useAssistantFlow } from "@/components/projects/assistant-flow-context";
import { AssistantNextStepCard } from "@/components/projects/assistant-next-step-card";
import { AssistantSection } from "@/components/projects/assistant-section";
import { BrainDumpPanel } from "@/components/projects/brain-dump-panel";
import { DraftEstimatePanel } from "@/components/projects/draft-estimate-panel";
import { EstimateUpdateProvider } from "@/components/projects/estimate-update-context";
import { MissingInformationPanel } from "@/components/projects/missing-information-panel";
import { SiteConditionsPanel } from "@/components/projects/site-conditions-panel";
import { WhatQuotrFoundPanel } from "@/components/projects/what-quotr-found-panel";
import { ScopeBuilderNotesList } from "@/components/projects/scope-builder-notes-list";
import { Button } from "@/components/ui/button";
import { getConstraintsForUi } from "@/lib/project-constraints-load";
import {
  resolveQuestionDef,
  resolveWorkAreaTypeKey,
} from "@/lib/project-assistant-questions";
import { resolveAssistantNextStep } from "@/lib/project-assistant/next-step";
import { normalizeQuestionKey } from "@/lib/question-keys";
import { isAnswered } from "@/lib/scope-answer-state";
import type { DiscoveryResult } from "@/lib/ai/discovery/types";
import type { ProjectDiscoveryMeta } from "@/lib/discovery-meta";
import type { ScopeQuestionWithAnswers } from "@/lib/project-assistant-data";
import type {
  ProjectScope,
  ProjectScopeBuilderInput,
  ProjectScopeSuggestion,
  QuickEstimate,
  ProjectTrade,
} from "@/types/database";

export interface ProjectAssistantShellProps {
  projectId: string;
  inputs: ProjectScopeBuilderInput[];
  suggestions: ProjectScopeSuggestion[];
  confirmedScopes: (ProjectScope & { scope_types: { name: string } | null })[];
  scopeQuestions: ScopeQuestionWithAnswers[];
  quickEstimate: QuickEstimate | null;
  selectedConstraintSlugs: string[];
  followUpValues: Record<string, string | number | undefined>;
  discovery: DiscoveryResult | null;
  discoveryMeta: ProjectDiscoveryMeta;
  projectTrades?: ProjectTrade[];
}

export function ProjectAssistantShell(props: ProjectAssistantShellProps) {
  return (
    <EstimateUpdateProvider>
      <AssistantFlowProvider
        projectId={props.projectId}
        aiAvailable={props.discoveryMeta.aiAvailable}
      >
        <ProjectAssistantShellInner {...props} />
      </AssistantFlowProvider>
    </EstimateUpdateProvider>
  );
}

function ProjectAssistantShellInner({
  projectId,
  inputs,
  suggestions,
  confirmedScopes,
  scopeQuestions,
  quickEstimate,
  selectedConstraintSlugs,
  followUpValues,
  discovery,
  discoveryMeta,
  projectTrades = [],
}: ProjectAssistantShellProps) {
  const router = useRouter();
  const { resetAnalysisUi } = useAssistantFlow();
  const [showNotesHistory, setShowNotesHistory] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetPending, startResetTransition] = useTransition();

  const workAreaTypeKeys = useMemo(
    () =>
      confirmedScopes.map((s) =>
        resolveWorkAreaTypeKey(s.scope_types?.name, s.name)
      ),
    [confirmedScopes]
  );

  const answeredQuestionKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const q of scopeQuestions) {
      const row = q.scope_answers?.[0];
      const scope = confirmedScopes.find((s) => s.id === q.project_scope_id);
      const typeKey = resolveWorkAreaTypeKey(
        scope?.scope_types?.name ?? null,
        scope?.name ?? ""
      );
      const def = resolveQuestionDef(q, typeKey);
      const inputType = q.question_type ?? def?.inputType ?? "text";
      if (
        !isAnswered(row?.answer, row?.source, {
          inputType: inputType as "text" | "number" | "select" | "boolean",
          requiresPositiveNumber: inputType === "number",
        })
      ) {
        continue;
      }
      const key = normalizeQuestionKey(q.question_key);
      if (key) keys.add(key);
    }
    return keys;
  }, [scopeQuestions, confirmedScopes]);

  const constraints = useMemo(
    () =>
      getConstraintsForUi(
        workAreaTypeKeys,
        answeredQuestionKeys,
        selectedConstraintSlugs
      ),
    [workAreaTypeKeys, answeredQuestionKeys, selectedConstraintSlugs]
  );

  const scopeGroups = useMemo(() => {
    const groups: {
      scopeId: string;
      scopeName: string;
      scopeTypeName: string | null;
      questions: ScopeQuestionWithAnswers[];
    }[] = [];

    for (const scope of confirmedScopes) {
      groups.push({
        scopeId: scope.id,
        scopeName: scope.name,
        scopeTypeName: scope.scope_types?.name ?? null,
        questions: scopeQuestions.filter(
          (q) => q.project_scope_id === scope.id
        ),
      });
    }
    return groups;
  }, [confirmedScopes, scopeQuestions]);

  const nextStep = useMemo(
    () =>
      resolveAssistantNextStep({
        hasNotes: inputs.length > 0,
        discoveryRan: Boolean(discovery || suggestions.length > 0),
        pendingSuggestions: suggestions,
        confirmedScopes,
        scopeQuestions,
        selectedConstraintSlugs,
        answeredQuestionKeys,
        quickEstimate,
      }),
    [
      inputs.length,
      discovery,
      suggestions,
      confirmedScopes,
      scopeQuestions,
      selectedConstraintSlugs,
      answeredQuestionKeys,
      quickEstimate,
    ]
  );

  function handleResetConfirm() {
    startResetTransition(async () => {
      await resetAssistant(projectId);
      resetAnalysisUi();
      setResetOpen(false);
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Conversation for discovery · Structure for review
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          onClick={() => setResetOpen(true)}
        >
          Reset Assistant
        </Button>
      </div>

      <AssistantNextStepCard projectId={projectId} nextStep={nextStep} />

      <AssistantSection title="Brain dump">
        <BrainDumpPanel projectId={projectId} discoveryMeta={discoveryMeta} />
        {inputs.length > 0 && (
          <div className="mt-2 border-t pt-2">
            <button
              type="button"
              onClick={() => setShowNotesHistory((v) => !v)}
              className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              {showNotesHistory ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" />
              )}
              Previous notes ({inputs.length})
            </button>
            {showNotesHistory && (
              <div className="mt-2">
                <ScopeBuilderNotesList projectId={projectId} inputs={inputs} />
              </div>
            )}
          </div>
        )}
      </AssistantSection>

      <AssistantSection title="What Quotr found">
        <WhatQuotrFoundPanel
          projectId={projectId}
          discovery={discovery}
          confirmedScopes={confirmedScopes}
          scopeQuestions={scopeQuestions}
          suggestions={suggestions}
          projectTrades={projectTrades}
        />
      </AssistantSection>

      <AssistantSection title="What Quotr needs">
        <MissingInformationPanel
          projectId={projectId}
          scopeGroups={scopeGroups}
          discovery={discovery}
        />
        {quickEstimate && scopeGroups.length > 0 && (
          <SiteConditionsPanel
            projectId={projectId}
            quickEstimateId={quickEstimate.id}
            constraints={constraints}
            selectedSlugs={selectedConstraintSlugs}
            followUpValues={followUpValues}
            qualityLevel={quickEstimate.quality_level ?? "unknown"}
            detectedQualityLevel={discovery?.qualityLevel?.value ?? null}
            detectedQualityReason={discovery?.qualityLevel?.reason ?? null}
          />
        )}
      </AssistantSection>

      <AssistantSection title="Draft quick estimate">
        <DraftEstimatePanel
          projectId={projectId}
          quickEstimate={quickEstimate}
        />
      </AssistantSection>

      <AssistantV2ResetDialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        onConfirm={handleResetConfirm}
        pending={resetPending}
      />
    </div>
  );
}
