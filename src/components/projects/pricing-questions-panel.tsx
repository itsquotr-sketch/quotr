"use client";

import { ProjectAssistantConstraintsForm } from "@/components/projects/project-assistant-constraints-form";
import { ProjectAssistantQuestionsForm } from "@/components/projects/project-assistant-questions-form";
import type { AssistantConstraint } from "@/lib/project-assistant-constraints";
import type { ScopeQuestionWithAnswers } from "@/lib/project-assistant-data";
import type { QualityLevel } from "@/lib/constants/quality-level";
import type { DiscoveryResult } from "@/lib/ai/discovery/types";
import type { QuickEstimate } from "@/types/database";
import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

interface ScopeGroup {
  scopeId: string;
  scopeName: string;
  scopeTypeName: string | null;
  questions: ScopeQuestionWithAnswers[];
}

interface PricingQuestionsPanelProps {
  projectId: string;
  scopeGroups: ScopeGroup[];
  quickEstimate: QuickEstimate | null;
  constraints: AssistantConstraint[];
  selectedConstraintSlugs: string[];
  followUpValues: Record<string, string | number | undefined>;
  detectedQualityLevel?: QualityLevel | null;
  detectedQualityReason?: string | null;
  discovery?: DiscoveryResult | null;
}

export function PricingQuestionsPanel({
  projectId,
  scopeGroups,
  quickEstimate,
  constraints,
  selectedConstraintSlugs,
  followUpValues,
  detectedQualityLevel,
  detectedQualityReason,
  discovery,
}: PricingQuestionsPanelProps) {
  const [showConstraints, setShowConstraints] = useState(false);

  return (
    <div className="space-y-3">
      <ProjectAssistantQuestionsForm
        projectId={projectId}
        scopeGroups={scopeGroups}
        discovery={discovery}
      />

      {quickEstimate && scopeGroups.length > 0 && constraints.length > 0 && (
        <div className="border-t pt-2">
          <button
            type="button"
            onClick={() => setShowConstraints((v) => !v)}
            className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            {showConstraints ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
            Site constraints ({selectedConstraintSlugs.length} selected)
          </button>
          {showConstraints && (
            <div className="mt-2">
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
      )}
    </div>
  );
}

/** @deprecated Use PricingQuestionsPanel */
export const QuestionsPanel = PricingQuestionsPanel;
