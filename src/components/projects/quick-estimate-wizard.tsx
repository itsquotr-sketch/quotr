"use client";

import { useCallback, useState } from "react";
import { QuickEstimateDriversStep } from "@/components/projects/quick-estimate-drivers-step";
import { QuickEstimateNotesStep } from "@/components/projects/quick-estimate-notes-step";
import { QuickEstimateQuestionsStep } from "@/components/projects/quick-estimate-questions-step";
import { QuickEstimateReviewStep } from "@/components/projects/quick-estimate-review-step";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { QUICK_ESTIMATE_WIZARD_STEPS } from "@/lib/constants/quick-estimate";
import { cn } from "@/lib/utils";
import type {
  EstimateDriverCategoryWithDrivers,
  ProjectEstimateDriverWithDetails,
  QuickEstimate,
  QuickEstimateAnswer,
} from "@/types/database";

function inferInitialStep(quickEstimate: QuickEstimate | null): number {
  if (!quickEstimate?.source_notes) return 1;
  return 1;
}

interface QuickEstimateWizardProps {
  projectId: string;
  quickEstimate: QuickEstimate;
  answers: QuickEstimateAnswer[];
  categories: EstimateDriverCategoryWithDrivers[];
  projectDrivers: ProjectEstimateDriverWithDetails[];
}

export function QuickEstimateWizard({
  projectId,
  quickEstimate,
  answers,
  categories,
  projectDrivers,
}: QuickEstimateWizardProps) {
  const [currentStep, setCurrentStep] = useState(() =>
    inferInitialStep(quickEstimate)
  );

  const onStepComplete = useCallback((step: number) => {
    setCurrentStep(step);
  }, []);

  const activeStepMeta = QUICK_ESTIMATE_WIZARD_STEPS.find(
    (s) => s.step === currentStep
  );

  return (
    <div className="space-y-6">
      <nav aria-label="Quick estimate steps" className="flex flex-wrap gap-2">
        {QUICK_ESTIMATE_WIZARD_STEPS.map((step) => (
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

      <Card className="rounded-xl">
        <CardHeader>
          <CardTitle className="normal-case tracking-normal text-lg font-semibold">
            {activeStepMeta?.title ?? "Quick Estimate"}
          </CardTitle>
          <CardDescription>
            {currentStep === 1 &&
              "Jot down what you know from the site visit, call or email."}
            {currentStep === 2 &&
              "A few simple questions to shape the estimate."}
            {currentStep === 3 &&
              "Pick anything that could make this job harder or more expensive."}
            {currentStep === 4 &&
              "Check everything looks right before saving."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {currentStep === 1 && (
            <QuickEstimateNotesStep
              projectId={projectId}
              defaultNotes={quickEstimate.source_notes}
              defaultBudget={
                quickEstimate.client_budget
                  ? Number(quickEstimate.client_budget)
                  : null
              }
              onStepComplete={onStepComplete}
            />
          )}

          {currentStep === 2 && (
            <QuickEstimateQuestionsStep
              projectId={projectId}
              quickEstimateId={quickEstimate.id}
              answers={answers}
              onStepComplete={onStepComplete}
            />
          )}

          {currentStep === 3 && (
            <QuickEstimateDriversStep
              projectId={projectId}
              quickEstimateId={quickEstimate.id}
              categories={categories}
              selectedDriverIds={projectDrivers.map(
                (pd) => pd.estimate_driver_id
              )}
              onStepComplete={onStepComplete}
            />
          )}

          {currentStep === 4 && (
            <QuickEstimateReviewStep
              projectId={projectId}
              quickEstimate={quickEstimate}
              answers={answers}
              projectDrivers={projectDrivers}
              categories={categories}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
