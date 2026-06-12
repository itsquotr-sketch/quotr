"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { generateDraftQuickEstimate } from "@/actions/project-assistant";
import { useAssistantFlow } from "@/components/projects/assistant-flow-context";
import { useEstimateUpdate } from "@/components/projects/estimate-update-context";
import { Button } from "@/components/ui/button";
import type { AssistantNextStep } from "@/lib/project-assistant/next-step";
import { cn } from "@/lib/utils";

interface AssistantNextStepCardProps {
  projectId: string;
  nextStep: AssistantNextStep | null;
}

export function AssistantNextStepCard({
  projectId,
  nextStep,
}: AssistantNextStepCardProps) {
  const router = useRouter();
  const { scrollTo, runAnalyseExisting, isAnalysing } = useAssistantFlow();
  const { markUpdating, markSaved } = useEstimateUpdate();
  const [generatePending, startGenerate] = useTransition();

  if (!nextStep || isAnalysing) return null;

  function handlePrimary() {
    if (nextStep?.scrollTarget) {
      scrollTo(nextStep.scrollTarget);
    }

    switch (nextStep?.action) {
      case "analyse":
        void runAnalyseExisting();
        break;
      case "generate_estimate":
      case "update_estimate":
        startGenerate(async () => {
          markUpdating();
          await generateDraftQuickEstimate(projectId);
          router.refresh();
          markSaved();
          scrollTo("estimate");
        });
        break;
      default:
        break;
    }
  }

  const isGenerate =
    nextStep.action === "generate_estimate" ||
    nextStep.action === "update_estimate";

  return (
    <div className="rounded-lg border border-primary/25 bg-primary/5 p-3">
      <p className="text-sm font-medium">{nextStep.message}</p>
      <Button
        type="button"
        size="sm"
        className={cn("mt-2 h-8 gap-1.5", isGenerate && "bg-primary")}
        disabled={generatePending}
        onClick={handlePrimary}
      >
        {generatePending ? "Updating…" : nextStep.buttonLabel}
        {!generatePending && <ArrowRight className="h-3.5 w-3.5" />}
      </Button>
    </div>
  );
}
