"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { continueToAssistantConstraints } from "@/actions/project-assistant";
import { ProjectAssistantQuestionsForm } from "@/components/projects/project-assistant-questions-form";
import { useScrollTarget } from "@/components/projects/assistant-flow-context";
import { useEstimateUpdate } from "@/components/projects/estimate-update-context";
import { Button } from "@/components/ui/button";
import type { ScopeQuestionWithAnswers } from "@/lib/project-assistant-data";
import type { DiscoveryResult } from "@/lib/ai/discovery/types";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

interface ScopeGroup {
  scopeId: string;
  scopeName: string;
  scopeTypeName: string | null;
  questions: ScopeQuestionWithAnswers[];
}

interface MissingInformationPanelProps {
  projectId: string;
  scopeGroups: ScopeGroup[];
  discovery?: DiscoveryResult | null;
}

export function MissingInformationPanel({
  projectId,
  scopeGroups,
  discovery,
}: MissingInformationPanelProps) {
  const scrollRef = useScrollTarget("needs");
  const router = useRouter();
  const { markUpdating, markSaved, status } = useEstimateUpdate();
  const [continuePending, startContinue] = useTransition();
  const [savedFlash, setSavedFlash] = useState(false);

  const isSaving = status === "saving" || status === "updating";

  function handleContinue() {
    startContinue(async () => {
      markUpdating();
      await continueToAssistantConstraints(projectId);
      router.refresh();
      markSaved();
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 3000);
      document
        .getElementById("site-conditions-section")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  if (scopeGroups.length === 0) {
    return (
      <div ref={scrollRef} className="text-sm text-muted-foreground">
        Confirm a work area to unlock key questions.
      </div>
    );
  }

  return (
    <div ref={scrollRef} className="space-y-3">
      <ProjectAssistantQuestionsForm
        projectId={projectId}
        scopeGroups={scopeGroups}
        discovery={discovery}
      />

      <div className="flex flex-wrap items-center gap-2 border-t pt-3">
        {isSaving ? (
          <span className="text-xs text-muted-foreground">Saving…</span>
        ) : savedFlash || status === "saved" ? (
          <span className="flex items-center gap-1 text-xs text-primary">
            <Check className="h-3.5 w-3.5" />
            Saved
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">
            Answers save automatically
          </span>
        )}
        <Button
          type="button"
          size="sm"
          className="h-8"
          disabled={continuePending}
          onClick={handleContinue}
        >
          {continuePending ? "Continuing…" : "Continue to site conditions"}
        </Button>
      </div>
    </div>
  );
}
