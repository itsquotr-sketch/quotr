"use client";

import { useMemo, useState, useTransition } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { resetAssistant } from "@/actions/project-assistant";
import { AssistantV2ResetDialog } from "@/components/assistant-v2/assistant-v2-reset-dialog";
import { AssistantSection } from "@/components/projects/assistant-section";
import { DiscoveryPanel } from "@/components/projects/discovery-panel";
import { EstimateUpdateProvider } from "@/components/projects/estimate-update-context";
import { PricingQuestionsPanel } from "@/components/projects/pricing-questions-panel";
import { QuickEstimatePanel } from "@/components/projects/quick-estimate-panel";
import { ProjectNotesInput } from "@/components/projects/project-notes-input";
import { ScopeBuilderNotesList } from "@/components/projects/scope-builder-notes-list";
import { Button } from "@/components/ui/button";
import { getConstraintsForUi } from "@/lib/project-constraints-load";
import {
  resolveQuestionDef,
  resolveWorkAreaTypeKey,
} from "@/lib/project-assistant-questions";
import { normalizeQuestionKey } from "@/lib/question-keys";
import { isAnswered } from "@/lib/scope-answer-state";
import type { DiscoveryResult } from "@/lib/discovery";
import type { ProjectDiscoveryMeta } from "@/lib/discovery-meta";
import type { ScopeQuestionWithAnswers } from "@/lib/project-assistant-data";
import type {
  ProjectScope,
  ProjectScopeBuilderInput,
  ProjectScopeSuggestion,
  QuickEstimate,
} from "@/types/database";
import { useRouter } from "next/navigation";

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
}

export function ProjectAssistantShell(props: ProjectAssistantShellProps) {
  return (
    <EstimateUpdateProvider>
      <ProjectAssistantShellInner {...props} />
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
}: ProjectAssistantShellProps) {
  const router = useRouter();
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

  function handleResetConfirm() {
    startResetTransition(async () => {
      await resetAssistant(projectId);
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

      <AssistantSection title="Live estimate">
        <QuickEstimatePanel projectId={projectId} quickEstimate={quickEstimate} />
      </AssistantSection>

      <AssistantSection title="Brain dump">
        <ProjectNotesInput projectId={projectId} discoveryMeta={discoveryMeta} />
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

      <AssistantSection title="What Quotr knows / needs">
        <DiscoveryPanel
          projectId={projectId}
          discovery={discovery}
          confirmedScopes={confirmedScopes}
          scopeQuestions={scopeQuestions}
          suggestions={suggestions}
        />
        {scopeGroups.length > 0 && (
          <div className="mt-3 border-t pt-3">
            <PricingQuestionsPanel
              projectId={projectId}
              scopeGroups={scopeGroups}
              quickEstimate={quickEstimate}
              constraints={constraints}
              selectedConstraintSlugs={selectedConstraintSlugs}
              followUpValues={followUpValues}
              detectedQualityLevel={discovery?.qualityLevel?.value ?? null}
              detectedQualityReason={discovery?.qualityLevel?.reason ?? null}
              discovery={discovery}
            />
          </div>
        )}
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

/** @deprecated Use ProjectAssistantShell */
export const ProjectAssistantWorkspace = ProjectAssistantShell;
