"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { generateDraftQuickEstimate } from "@/actions/project-assistant";
import { ProjectAssistantConstraintsForm } from "@/components/projects/project-assistant-constraints-form";
import { useScrollTarget } from "@/components/projects/assistant-flow-context";
import { useEstimateUpdate } from "@/components/projects/estimate-update-context";
import { Button } from "@/components/ui/button";
import type { AssistantConstraint } from "@/lib/project-assistant-constraints";
import type { QualityLevel } from "@/lib/constants/quality-level";

interface SiteConditionsPanelProps {
  projectId: string;
  quickEstimateId: string;
  constraints: AssistantConstraint[];
  selectedSlugs: string[];
  followUpValues: Record<string, string | number | undefined>;
  qualityLevel: string;
  detectedQualityLevel?: QualityLevel | null;
  detectedQualityReason?: string | null;
}

export function SiteConditionsPanel({
  projectId,
  quickEstimateId,
  constraints,
  selectedSlugs,
  followUpValues,
  qualityLevel,
  detectedQualityLevel,
  detectedQualityReason,
}: SiteConditionsPanelProps) {
  const scrollRef = useScrollTarget("site_conditions");
  const router = useRouter();
  const { markUpdating, markSaved, status } = useEstimateUpdate();
  const [generatePending, startGenerate] = useTransition();

  const isSaving = status === "saving" || status === "updating";

  function handleGenerate() {
    startGenerate(async () => {
      markUpdating();
      await generateDraftQuickEstimate(projectId);
      router.refresh();
      markSaved();
      document
        .getElementById("draft-estimate-section")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  if (constraints.length === 0) {
    return null;
  }

  return (
    <div
      id="site-conditions-section"
      ref={scrollRef}
      className="space-y-3 border-t pt-3"
    >
      <div>
        <h4 className="text-sm font-medium">Site conditions</h4>
        <p className="text-xs text-muted-foreground">
          Select anything that could affect price or programme.
        </p>
      </div>

      <ProjectAssistantConstraintsForm
        projectId={projectId}
        quickEstimateId={quickEstimateId}
        constraints={constraints}
        selectedSlugs={selectedSlugs}
        followUpValues={followUpValues}
        qualityLevel={qualityLevel}
        detectedQualityLevel={detectedQualityLevel}
        detectedQualityReason={detectedQualityReason}
      />

      <div className="flex flex-wrap items-center gap-2 border-t pt-3">
        {isSaving ? (
          <span className="text-xs text-muted-foreground">Saving…</span>
        ) : status === "saved" ? (
          <span className="flex items-center gap-1 text-xs text-primary">
            <Check className="h-3.5 w-3.5" />
            Site conditions saved
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">
            Site conditions save automatically
          </span>
        )}
        <Button
          type="button"
          size="sm"
          className="h-8"
          disabled={generatePending}
          onClick={handleGenerate}
        >
          {generatePending
            ? "Generating…"
            : "Generate Draft Quick Estimate"}
        </Button>
      </div>
    </div>
  );
}
