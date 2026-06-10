"use client";

import { useMemo } from "react";
import { AssistantSection } from "@/components/projects/assistant-section";
import { DiscoverySummary } from "@/components/projects/project-assistant-discovery-summary";
import { EstimatePanel } from "@/components/projects/estimate-panel";
import { MissingInformationCard } from "@/components/projects/missing-information-card";
import { ProjectAssistantNotesForm } from "@/components/projects/project-assistant-notes-form";
import { ProjectAssistantWorkAreas } from "@/components/projects/project-assistant-work-areas";
import { QuestionsPanel } from "@/components/projects/questions-panel";
import { ScopeBuilderNotesList } from "@/components/projects/scope-builder-notes-list";
import { getConstraintBySlug } from "@/lib/project-assistant-constraints";
import {
  buildDiscoverySummaryConstraints,
  getConstraintsForUi,
} from "@/lib/project-constraints-load";
import {
  resolveQuestionDef,
  resolveWorkAreaTypeKey,
} from "@/lib/project-assistant-questions";
import { parseQuickEstimateSummary } from "@/lib/project-assistant-summary";
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
import {
  buildEstimateQualityFactors,
  isSiteConstraintsAssessed,
} from "@/lib/cost-engine/estimate-quality";
import type { QuickEstimateConfidenceLevel } from "@/lib/constants/quick-estimate";
import { normaliseQualityLevel } from "@/lib/constants/quality-level";

export interface ProjectAssistantWorkspaceProps {
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

export function ProjectAssistantWorkspace({
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
}: ProjectAssistantWorkspaceProps) {
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

  const estimateSummary = parseQuickEstimateSummary(quickEstimate?.notes ?? null);

  const missingItems = useMemo(() => {
    const tighten = estimateSummary?.tightenSuggestions ?? [];
    const missing = estimateSummary?.missingInformation ?? [];
    const combined = tighten.length > 0 ? tighten : missing;
    return [...new Set(combined)].slice(0, 5);
  }, [estimateSummary]);

  const estimateDrivers = useMemo(() => {
    if (estimateSummary?.constraintsApplied.length) {
      return estimateSummary.constraintsApplied;
    }
    return discoverySummaryConstraints.map((c) =>
      c.detail ? `${c.label}: ${c.detail}` : c.label
    );
  }, [estimateSummary, discoverySummaryConstraints]);

  const qualityLevel = (quickEstimate?.confidence_level ??
    "low") as QuickEstimateConfidenceLevel;

  const qualityFactors = useMemo(() => {
    if (estimateSummary?.qualityFactors?.length) {
      return estimateSummary.qualityFactors;
    }
    const hasMeasurements = scopeQuestions.some((q) => {
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
    });
    return buildEstimateQualityFactors({
      hasKeyMeasurements: hasMeasurements,
      workAreasConfirmed: confirmedScopes.length > 0,
      qualityLevel: normaliseQualityLevel(quickEstimate?.quality_level),
      siteConstraintsAssessed: isSiteConstraintsAssessed({
        constraintCount: selectedConstraintSlugs.length,
        answeredQuestionKeys,
      }),
    });
  }, [
    estimateSummary?.qualityFactors,
    scopeQuestions,
    confirmedScopes,
    quickEstimate?.quality_level,
    selectedConstraintSlugs.length,
    answeredQuestionKeys,
  ]);

  return (
    <div className="grid gap-3 lg:grid-cols-5 lg:items-start">
      <div className="space-y-3 lg:col-span-3">
        <AssistantSection title="Tell Quotr what you know">
          <ProjectAssistantNotesForm
            projectId={projectId}
            discoveryMeta={discoveryMeta}
          />
          {inputs.length > 0 && (
            <div className="mt-3 border-t pt-3">
              <ScopeBuilderNotesList projectId={projectId} inputs={inputs} />
            </div>
          )}
        </AssistantSection>

        <AssistantSection title="Quotr found these work areas">
          <ProjectAssistantWorkAreas
            projectId={projectId}
            suggestions={suggestions}
            confirmedScopes={confirmedScopes}
          />
        </AssistantSection>

        <AssistantSection title="Questions that affect pricing">
          <QuestionsPanel
            projectId={projectId}
            scopeGroups={scopeGroups}
            quickEstimate={quickEstimate}
            constraints={constraints}
            selectedConstraintSlugs={selectedConstraintSlugs}
            followUpValues={followUpValues}
            detectedQualityLevel={discovery?.qualityLevel?.value ?? null}
            detectedQualityReason={discovery?.qualityLevel?.reason ?? null}
          />
        </AssistantSection>
      </div>

      <div className="space-y-3 lg:col-span-2 lg:sticky lg:top-4">
        <DiscoverySummary
          discovery={discovery}
          confirmedWorkAreaNames={confirmedScopes.map((s) => s.name)}
          savedConstraints={discoverySummaryConstraints}
          estimateDrivers={estimateDrivers}
          qualityLevel={quickEstimate ? qualityLevel : null}
          qualityFactors={qualityFactors}
          missingItems={missingItems}
        />

        <MissingInformationCard items={missingItems} />

        <EstimatePanel projectId={projectId} quickEstimate={quickEstimate} />
      </div>
    </div>
  );
}
