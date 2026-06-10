"use client";

import { ProjectAssistantConstraintsForm } from "@/components/projects/project-assistant-constraints-form";
import { ProjectAssistantQuestionsForm } from "@/components/projects/project-assistant-questions-form";
import type { AssistantConstraint } from "@/lib/project-assistant-constraints";
import type { ScopeQuestionWithAnswers } from "@/lib/project-assistant-data";
import type { QualityLevel } from "@/lib/constants/quality-level";
import type { QuickEstimate } from "@/types/database";

interface ScopeGroup {
  scopeId: string;
  scopeName: string;
  scopeTypeName: string | null;
  questions: ScopeQuestionWithAnswers[];
}

interface QuestionsPanelProps {
  projectId: string;
  scopeGroups: ScopeGroup[];
  quickEstimate: QuickEstimate | null;
  constraints: AssistantConstraint[];
  selectedConstraintSlugs: string[];
  followUpValues: Record<string, string | number | undefined>;
  detectedQualityLevel?: QualityLevel | null;
  detectedQualityReason?: string | null;
}

export function QuestionsPanel({
  projectId,
  scopeGroups,
  quickEstimate,
  constraints,
  selectedConstraintSlugs,
  followUpValues,
  detectedQualityLevel,
  detectedQualityReason,
}: QuestionsPanelProps) {
  return (
    <div className="space-y-4">
      <ProjectAssistantQuestionsForm
        projectId={projectId}
        scopeGroups={scopeGroups}
      />

      {quickEstimate && scopeGroups.length > 0 && (
        <div className="border-t pt-4">
          <ProjectAssistantConstraintsForm
            projectId={projectId}
            quickEstimateId={quickEstimate.id}
            constraints={constraints}
            selectedSlugs={selectedConstraintSlugs}
            followUpValues={followUpValues}
            qualityLevel={quickEstimate.quality_level ?? "unknown"}
            detectedQualityLevel={detectedQualityLevel}
            detectedQualityReason={detectedQualityReason}
          />
        </div>
      )}
    </div>
  );
}
