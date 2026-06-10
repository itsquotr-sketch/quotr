"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { saveScopeBuilderInput } from "@/actions/scope-builder";
import { analyseProject, saveAndAnalyseProject } from "@/actions/project-assistant";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { PROJECT_ASSISTANT_NOTES_PLACEHOLDER } from "@/lib/constants/project-assistant";
import type { ProjectDiscoveryMeta } from "@/lib/discovery-meta";
import type { ScopeBuilderActionState } from "@/lib/validations/scope-builder";
import type { ProjectAssistantActionState } from "@/actions/project-assistant";

const saveInitialState: ScopeBuilderActionState = {};
const analyseInitialState: ProjectAssistantActionState = {};

interface ProjectAssistantNotesFormProps {
  projectId: string;
  discoveryMeta: ProjectDiscoveryMeta;
  onStepComplete?: (step: number) => void;
}

function formatAnalysedAt(value: string | null): string | null {
  if (!value) return null;
  try {
    return new Intl.DateTimeFormat("en-NZ", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return null;
  }
}

function analysingLabel(aiAvailable: boolean, pending: boolean): string {
  if (!pending) return "Analyse Project";
  return aiAvailable
    ? "Analysing with AI…"
    : "Analysing with basic rules…";
}

export function ProjectAssistantNotesForm({
  projectId,
  discoveryMeta,
  onStepComplete,
}: ProjectAssistantNotesFormProps) {
  const saveAction = saveScopeBuilderInput.bind(null, projectId);
  const [saveState, saveFormAction, savePending] = useActionState(
    saveAction,
    saveInitialState
  );

  const saveAndAnalyseAction = saveAndAnalyseProject.bind(null, projectId);
  const [analyseState, analyseFormAction, analysePending] = useActionState(
    saveAndAnalyseAction,
    analyseInitialState
  );

  const [analyseOnlyPending, startAnalyseOnly] = useTransition();
  const [analyseOnlyFeedback, setAnalyseOnlyFeedback] = useState<string | null>(
    null
  );
  const [formKey, setFormKey] = useState(0);

  const isAnalysing = analysePending || analyseOnlyPending;
  const analysedAt = formatAnalysedAt(discoveryMeta.analysedAt);

  useEffect(() => {
    if (analyseState.success && analyseState.nextStep) {
      setFormKey((k) => k + 1);
      onStepComplete?.(analyseState.nextStep);
    }
  }, [analyseState.success, analyseState.nextStep, onStepComplete]);

  useEffect(() => {
    if (saveState.success) {
      setFormKey((k) => k + 1);
    }
  }, [saveState.success]);

  function handleAnalyseExisting() {
    setAnalyseOnlyFeedback(null);
    startAnalyseOnly(async () => {
      const result = await analyseProject(projectId);
      if (result.error) {
        setAnalyseOnlyFeedback(result.error);
        return;
      }
      setAnalyseOnlyFeedback(
        result.message ?? "Work areas updated from your saved notes."
      );
      if (result.nextStep) {
        onStepComplete?.(result.nextStep);
      }
    });
  }

  const feedback =
    saveState.message ??
    saveState.error ??
    analyseState.message ??
    analyseState.error ??
    analyseOnlyFeedback;

  return (
    <div className="space-y-4">
      <form key={`save-${formKey}`} action={saveFormAction} className="space-y-4">
        <input type="hidden" name="inputType" value="typed_note" />
        <Textarea
          id="project-assistant-notes"
          name="content"
          placeholder={PROJECT_ASSISTANT_NOTES_PLACEHOLDER}
          rows={8}
          required
          className="min-h-[180px] resize-y text-base"
        />
        {(saveState.fieldErrors?.content ||
          analyseState.fieldErrors?.content) && (
          <p className="text-sm text-destructive">
            {(saveState.fieldErrors?.content ??
              analyseState.fieldErrors?.content)?.[0]}
          </p>
        )}

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            type="submit"
            variant="outline"
            disabled={savePending || isAnalysing}
            className="w-full sm:w-auto"
          >
            {savePending ? "Saving…" : "Save Notes"}
          </Button>
          <Button
            type="submit"
            formAction={analyseFormAction}
            disabled={savePending || isAnalysing}
            className="w-full sm:w-auto"
          >
            {analysingLabel(discoveryMeta.aiAvailable, analysePending)}
          </Button>
        </div>
      </form>

      <p className="text-xs text-muted-foreground">
        Already saved notes?{" "}
        <button
          type="button"
          className="font-medium text-primary underline-offset-4 hover:underline"
          disabled={isAnalysing}
          onClick={handleAnalyseExisting}
        >
          {analysingLabel(discoveryMeta.aiAvailable, analyseOnlyPending)}
        </button>
      </p>

      {analysedAt && (
        <div className="rounded-lg border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
          <p>
            Last analysed:{" "}
            <span className="font-medium text-foreground">{analysedAt}</span>
          </p>
          <p className="mt-1">
            Provider:{" "}
            <span className="font-medium text-foreground">
              {discoveryMeta.providerLabel}
            </span>
            {discoveryMeta.confidence != null && (
              <>
                {" "}
                · Confidence:{" "}
                <span className="font-medium text-foreground">
                  {Math.round(discoveryMeta.confidence * 100)}%
                </span>
              </>
            )}
          </p>
          {discoveryMeta.usedFallback && (
            <p className="mt-1 text-amber-800 dark:text-amber-200">
              Quotr used basic analysis because AI analysis was unavailable.
            </p>
          )}
        </div>
      )}

      {feedback && (
        <p
          className={
            feedback.includes("Could not") ||
            feedback.includes("Add and save") ||
            feedback.includes("Add more")
              ? "rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
              : "rounded-lg bg-primary/10 px-3 py-2 text-sm text-primary"
          }
        >
          {feedback}
        </p>
      )}
    </div>
  );
}
