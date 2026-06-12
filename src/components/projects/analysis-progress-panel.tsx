"use client";

import { Loader2, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  useAssistantFlow,
  type AnalysisStep,
  type StepStatus,
} from "@/components/projects/assistant-flow-context";
import { cn } from "@/lib/utils";

function StepIcon({ status }: { status: StepStatus }) {
  if (status === "complete") {
    return <Check className="h-3.5 w-3.5 text-primary" />;
  }
  if (status === "failed") {
    return <X className="h-3.5 w-3.5 text-destructive" />;
  }
  if (status === "active") {
    return <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />;
  }
  return (
    <span className="h-3.5 w-3.5 rounded-full border border-muted-foreground/40" />
  );
}

function StepRow({ step }: { step: AnalysisStep }) {
  return (
    <li
      className={cn(
        "flex items-center gap-2 text-xs",
        step.status === "active" && "font-medium text-foreground",
        step.status === "pending" && "text-muted-foreground",
        step.status === "complete" && "text-muted-foreground",
        step.status === "failed" && "text-destructive"
      )}
    >
      <StepIcon status={step.status} />
      <span>{step.label}</span>
    </li>
  );
}

export function AnalysisProgressPanel() {
  const {
    analysisPhase,
    analysisSteps,
    analysisMode,
    usedFallback,
    analysisMessage,
    analysisError,
    showSlowMessage,
    showTimeoutActions,
    runAnalyseExisting,
    runAnalyseBasic,
    isAnalysing,
  } = useAssistantFlow();

  if (analysisPhase === "idle") return null;

  const modeLabel =
    analysisMode === "ai" && !usedFallback
      ? "AI analysis running…"
      : usedFallback
        ? "Using basic analysis because AI analysis was unavailable."
        : analysisMode === "rules"
          ? "Basic analysis running…"
          : null;

  return (
    <div
      className={cn(
        "rounded-lg border p-3",
        analysisPhase === "failed"
          ? "border-destructive/30 bg-destructive/5"
          : analysisPhase === "complete"
            ? "border-primary/20 bg-primary/5"
            : "border-primary/30 bg-primary/5"
      )}
      role="status"
      aria-live="polite"
    >
      <p className="text-sm font-medium">
        {analysisPhase === "analysing" && "Quotr is analysing this project…"}
        {analysisPhase === "complete" && "Analysis complete"}
        {analysisPhase === "failed" && "Analysis could not finish"}
      </p>

      {modeLabel && analysisPhase === "analysing" && (
        <p className="mt-1 text-xs text-muted-foreground">{modeLabel}</p>
      )}

      {usedFallback && analysisPhase === "complete" && (
        <p className="mt-1 text-xs text-amber-800 dark:text-amber-200">
          Using basic analysis because AI analysis was unavailable.
        </p>
      )}

      {(analysisPhase === "analysing" || analysisPhase === "complete") && (
        <ul className="mt-2 space-y-1">
          {analysisSteps.map((step) => (
            <StepRow key={step.id} step={step} />
          ))}
        </ul>
      )}

      {showSlowMessage && isAnalysing && (
        <p className="mt-2 text-xs text-muted-foreground">
          Still working — this can take a few seconds for larger notes.
        </p>
      )}

      {showTimeoutActions && isAnalysing && (
        <div className="mt-3 space-y-2">
          <p className="text-xs text-muted-foreground">
            This is taking longer than expected. You can continue with basic
            analysis or try again.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={() => void runAnalyseExisting()}
            >
              Try again
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="h-7 text-xs"
              onClick={() => void runAnalyseBasic()}
            >
              Use basic analysis
            </Button>
          </div>
        </div>
      )}

      {analysisPhase === "complete" && analysisMessage && (
        <p className="mt-2 text-xs text-primary">{analysisMessage}</p>
      )}

      {analysisPhase === "failed" && analysisError && (
        <div className="mt-2 space-y-2">
          <p className="text-xs text-destructive">{analysisError}</p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={() => void runAnalyseExisting()}
            >
              Try again
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="h-7 text-xs"
              onClick={() => void runAnalyseBasic()}
            >
              Use basic analysis
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
