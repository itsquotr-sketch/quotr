"use client";

import { useCallback, useMemo, useState } from "react";
import { ProjectAssistantConstraintsForm } from "@/components/projects/project-assistant-constraints-form";
import { ProjectAssistantDiscoverySummary } from "@/components/projects/project-assistant-discovery-summary";
import { ProjectAssistantNotesForm } from "@/components/projects/project-assistant-notes-form";
import { ProjectAssistantQuestionsForm } from "@/components/projects/project-assistant-questions-form";
import { ProjectAssistantResult } from "@/components/projects/project-assistant-result";
import { ProjectAssistantWorkAreas } from "@/components/projects/project-assistant-work-areas";
import { ScopeBuilderNotesList } from "@/components/projects/scope-builder-notes-list";
import { getConstraintBySlug } from "@/lib/project-assistant-constraints";
import {
  buildDiscoverySummaryConstraints,
  getConstraintsForUi,
} from "@/lib/project-constraints-load";
import {
  PROJECT_ASSISTANT_STEPS,
  resolveQuestionDef,
  resolveWorkAreaTypeKey,
} from "@/lib/project-assistant-questions";
import { normalizeQuestionKey } from "@/lib/question-keys";
import { isAnswered } from "@/lib/scope-answer-state";
import { getIncludedTradesForWorkAreas } from "@/lib/project-assistant-trades";
import type { DiscoveryResult } from "@/lib/discovery";
import type { ProjectDiscoveryMeta } from "@/lib/discovery-meta";
import type { ScopeQuestionWithAnswers } from "@/lib/project-assistant-data";
import type {
  ProjectScope,
  ProjectScopeBuilderInput,
  ProjectScopeSuggestion,
  QuickEstimate,
} from "@/types/database";
import { cn } from "@/lib/utils";

interface ProjectAssistantWizardProps {
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

function inferInitialStep(
  inputs: ProjectScopeBuilderInput[],
  suggestions: ProjectScopeSuggestion[],
  confirmedScopes: ProjectScope[],
  quickEstimate: QuickEstimate | null
): number {
  const hasResults =
    quickEstimate?.estimated_cost_low != null &&
    quickEstimate?.estimated_cost_high != null;
  if (hasResults) return 5;
  if (confirmedScopes.length > 0) return 3;
  const pending = suggestions.filter((s) => s.status === "pending");
  if (pending.length > 0 || confirmedScopes.length > 0) return 2;
  if (inputs.length > 0) return 1;
  return 1;
}

export function ProjectAssistantWizard({
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
}: ProjectAssistantWizardProps) {
  const [currentStep, setCurrentStep] = useState(() =>
    inferInitialStep(inputs, suggestions, confirmedScopes, quickEstimate)
  );

  const onStepComplete = useCallback((step: number) => {
    setCurrentStep(step);
  }, []);

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
      const typeKey = resolveWorkAreaTypeKey(
        confirmedScopes.find((s) => s.id === q.project_scope_id)?.scope_types
          ?.name ?? null,
        confirmedScopes.find((s) => s.id === q.project_scope_id)?.name ?? ""
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

  const discoverySummaryConstraints = useMemo(
    () =>
      buildDiscoverySummaryConstraints(
        discovery?.constraints ?? [],
        selectedConstraintSlugs.map((slug) => {
          const followUp = followUpValues[slug];
          return {
            slug,
            label: getConstraintBySlug(slug)?.label ?? slug,
            metres: typeof followUp === "number" ? followUp : undefined,
            description: typeof followUp === "string" ? followUp : undefined,
            severity:
              followUp === "low" || followUp === "typical" || followUp === "high"
                ? followUp
                : undefined,
            source: "user",
          };
        }),
        answeredQuestionKeys
      ),
    [
      discovery?.constraints,
      selectedConstraintSlugs,
      followUpValues,
      answeredQuestionKeys,
    ]
  );

  const includedTrades = useMemo(
    () => getIncludedTradesForWorkAreas(workAreaTypeKeys),
    [workAreaTypeKeys]
  );

  const questionsAnswered = useMemo(
    () =>
      scopeQuestions.filter((q) => {
        const row = q.scope_answers?.[0];
        const scope = confirmedScopes.find((s) => s.id === q.project_scope_id);
        const typeKey = resolveWorkAreaTypeKey(
          scope?.scope_types?.name ?? null,
          scope?.name ?? ""
        );
        const def = resolveQuestionDef(q, typeKey);
        const inputType = q.question_type ?? def?.inputType ?? "text";
        return isAnswered(row?.answer, row?.source, {
          inputType: inputType as "text" | "number" | "select" | "boolean",
          requiresPositiveNumber: inputType === "number",
        });
      }).length,
    [scopeQuestions, confirmedScopes]
  );

  const selectedConstraintLabels = useMemo(
    () =>
      constraints
        .filter((c) => selectedConstraintSlugs.includes(c.slug))
        .map((c) => c.label),
    [constraints, selectedConstraintSlugs]
  );

  const scopeGroups = useMemo(() => {
    const groups: {
      scopeId: string;
      scopeName: string;
      scopeTypeName: string | null;
      questions: ScopeQuestionWithAnswers[];
    }[] = [];

    for (const scope of confirmedScopes) {
      const questions = scopeQuestions.filter(
        (q) => q.project_scope_id === scope.id
      );
      groups.push({
        scopeId: scope.id,
        scopeName: scope.name,
        scopeTypeName: scope.scope_types?.name ?? null,
        questions,
      });
    }
    return groups;
  }, [confirmedScopes, scopeQuestions]);

  const activeStep = PROJECT_ASSISTANT_STEPS.find(
    (s) => s.step === currentStep
  );

  const showDiscoveryAfterStep = currentStep >= 2 && currentStep <= 4;

  return (
    <div className="space-y-8">
      <nav
        aria-label="Project Assistant steps"
        className="flex flex-wrap gap-2"
      >
        {PROJECT_ASSISTANT_STEPS.map((step) => (
          <button
            key={step.step}
            type="button"
            onClick={() => setCurrentStep(step.step)}
            className={cn(
              "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
              currentStep === step.step
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            )}
          >
            {step.step}. {step.title}
          </button>
        ))}
      </nav>

      <div className="space-y-4">
        {activeStep && (
          <h3 className="text-base font-semibold">{activeStep.title}</h3>
        )}

        {currentStep === 1 && (
          <div className="space-y-6">
            <ProjectAssistantNotesForm
              projectId={projectId}
              discoveryMeta={discoveryMeta}
              onStepComplete={onStepComplete}
            />
            <div className="space-y-3 border-t pt-6">
              <h4 className="text-sm font-medium text-muted-foreground">
                Saved notes
              </h4>
              <ScopeBuilderNotesList projectId={projectId} inputs={inputs} />
            </div>
          </div>
        )}

        {currentStep === 2 && (
          <ProjectAssistantWorkAreas
            projectId={projectId}
            suggestions={suggestions}
            confirmedScopes={confirmedScopes}
          />
        )}

        {currentStep === 3 && (
          <ProjectAssistantQuestionsForm
            projectId={projectId}
            scopeGroups={scopeGroups}
            onStepComplete={onStepComplete}
          />
        )}

        {currentStep === 4 && quickEstimate ? (
          <ProjectAssistantConstraintsForm
            projectId={projectId}
            quickEstimateId={quickEstimate.id}
            constraints={constraints}
            selectedSlugs={selectedConstraintSlugs}
            followUpValues={followUpValues}
            qualityLevel={quickEstimate.quality_level ?? "unknown"}
            detectedQualityLevel={discovery?.qualityLevel?.value ?? null}
            detectedQualityReason={discovery?.qualityLevel?.reason ?? null}
            onStepComplete={onStepComplete}
          />
        ) : null}

        {currentStep === 4 && !quickEstimate && (
          <p className="text-sm text-muted-foreground">
            Confirm a work area first so Quotr can prepare your estimate.
          </p>
        )}

        {currentStep === 5 && (
          <div className="space-y-8">
            <ProjectAssistantDiscoverySummary
              discovery={discovery}
              discoveryMeta={discoveryMeta}
              confirmedWorkAreaNames={confirmedScopes.map((s) => s.name)}
              savedConstraints={discoverySummaryConstraints}
            />
            <ProjectAssistantResult
              projectId={projectId}
              quickEstimate={quickEstimate}
              fallbackTrades={includedTrades}
              confirmedWorkAreas={confirmedScopes.map((s) => s.name)}
              questionsAnswered={questionsAnswered}
              questionsTotal={scopeQuestions.length}
              selectedConstraintLabels={selectedConstraintLabels}
              discovery={discovery}
            />
          </div>
        )}
      </div>

      {showDiscoveryAfterStep && (
        <ProjectAssistantDiscoverySummary
          discovery={discovery}
          discoveryMeta={discoveryMeta}
          confirmedWorkAreaNames={confirmedScopes.map((s) => s.name)}
          savedConstraints={discoverySummaryConstraints}
          className="border-t pt-8"
        />
      )}
    </div>
  );
}
