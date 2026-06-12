"use client";

import { useActionState, useState, useTransition } from "react";
import { saveScopeBuilderInput } from "@/actions/scope-builder";
import { saveAndAnalyseProject } from "@/actions/project-assistant";
import { AnalysisProgressPanel } from "@/components/projects/analysis-progress-panel";
import { useAssistantFlow } from "@/components/projects/assistant-flow-context";
import { useScrollTarget } from "@/components/projects/assistant-flow-context";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { PROJECT_ASSISTANT_NOTES_PLACEHOLDER } from "@/lib/constants/project-assistant";
import type { ProjectDiscoveryMeta } from "@/lib/discovery-meta";
import type { ScopeBuilderActionState } from "@/lib/validations/scope-builder";

const saveInitialState: ScopeBuilderActionState = {};

interface BrainDumpPanelProps {
  projectId: string;
  discoveryMeta: ProjectDiscoveryMeta;
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

export function BrainDumpPanel({
  projectId,
  discoveryMeta,
}: BrainDumpPanelProps) {
  const scrollRef = useScrollTarget("brain_dump");
  const {
    isAnalysing,
    runAnalyseExisting,
    startAnalysis,
    finishAnalysis,
    analysisPhase,
  } = useAssistantFlow();

  const saveAction = saveScopeBuilderInput.bind(null, projectId);
  const [saveState, saveFormAction, savePending] = useActionState(
    saveAction,
    saveInitialState
  );
  const [analysePending, startAnalyse] = useTransition();
  const [formKey, setFormKey] = useState(0);
  const [content, setContent] = useState("");

  const analysedAt = formatAnalysedAt(discoveryMeta.analysedAt);
  const busy = isAnalysing || analysePending;

  async function handleSaveAndAnalyse() {
    if (!content.trim() || busy) return;
    startAnalysis(discoveryMeta.aiAvailable ? "ai" : "rules");
    startAnalyse(async () => {
      const formData = new FormData();
      formData.set("inputType", "typed_note");
      formData.set("content", content.trim());
      const result = await saveAndAnalyseProject(projectId, {}, formData);
      await finishAnalysis(result);
      if (result.success) {
        setContent("");
        setFormKey((k) => k + 1);
      }
    });
  }

  return (
    <div ref={scrollRef} className="space-y-3">
      <AnalysisProgressPanel />

      <form key={`save-${formKey}`} action={saveFormAction} className="space-y-3">
        <input type="hidden" name="inputType" value="typed_note" />
        <Textarea
          id="project-assistant-notes"
          name="content"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={PROJECT_ASSISTANT_NOTES_PLACEHOLDER}
          rows={5}
          required
          disabled={busy}
          className="min-h-[100px] resize-y text-sm"
        />
        {(saveState.fieldErrors?.content) && (
          <p className="text-sm text-destructive">
            {saveState.fieldErrors.content[0]}
          </p>
        )}

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            type="submit"
            variant="outline"
            disabled={savePending || busy}
            className="w-full sm:w-auto"
          >
            {savePending ? "Saving…" : "Save Notes"}
          </Button>
          <Button
            type="button"
            disabled={savePending || busy || !content.trim()}
            className="w-full sm:w-auto"
            onClick={() => void handleSaveAndAnalyse()}
          >
            {busy ? "Analysing…" : "Analyse Project"}
          </Button>
        </div>
      </form>

      <p className="text-xs text-muted-foreground">
        Already saved notes?{" "}
        <button
          type="button"
          className="font-medium text-primary underline-offset-4 hover:underline disabled:opacity-50"
          disabled={busy}
          onClick={() => void runAnalyseExisting()}
        >
          {busy ? "Analysing…" : "Analyse saved notes"}
        </button>
      </p>

      {analysedAt && analysisPhase === "idle" && (
        <p className="text-xs text-muted-foreground">
          Last analysed:{" "}
          <span className="font-medium text-foreground">{analysedAt}</span>
          {" · "}
          {discoveryMeta.providerLabel}
        </p>
      )}

      {saveState.success && (
        <p className="rounded-lg bg-primary/10 px-3 py-2 text-sm text-primary">
          {saveState.message ?? "Notes saved."}
        </p>
      )}

      {saveState.error && (
        <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {saveState.error}
        </p>
      )}
    </div>
  );
}

/** @deprecated Use BrainDumpPanel */
export const ProjectAssistantNotesForm = BrainDumpPanel;
