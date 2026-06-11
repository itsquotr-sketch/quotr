"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ArrowLeft, Download, RotateCcw, Sparkles } from "lucide-react";
import { generateAssistantEstimate, exportScopeSummary } from "@/actions/assistant-v2";
import { AssistantV2ResetDialog } from "@/components/assistant-v2/assistant-v2-reset-dialog";
import { StatusBadge } from "@/components/projects/status-badge";
import { Button } from "@/components/ui/button";
import { PROJECT_STATUSES, labelFor } from "@/lib/constants/projects";
import type { Project } from "@/types/database";
import { toast } from "sonner";

interface AssistantV2HeaderProps {
  project: Project;
  projectId: string;
  completenessPercent: number;
  onReset: () => void;
  resetPending: boolean;
}

export function AssistantV2Header({
  project,
  projectId,
  completenessPercent,
  onReset,
  resetPending,
}: AssistantV2HeaderProps) {
  const [resetOpen, setResetOpen] = useState(false);
  const [exportPending, startExport] = useTransition();
  const [estimatePending, startEstimate] = useTransition();

  const statusLabel = labelFor(PROJECT_STATUSES, project.status ?? "new");

  function handleExport() {
    startExport(async () => {
      const result = await exportScopeSummary(projectId);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      if (result.summary) {
        await navigator.clipboard.writeText(result.summary);
        toast.success("Scope summary copied to clipboard.");
      }
    });
  }

  function handleGenerateEstimate() {
    startEstimate(async () => {
      const result = await generateAssistantEstimate(projectId);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message ?? "Estimate updated.");
    });
  }

  return (
    <>
      <header className="border-b bg-background px-4 py-4 lg:px-6">
        <div className="flex flex-col gap-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-2">
              <Button asChild variant="ghost" size="icon" className="mt-0.5 shrink-0">
                <Link href={`/projects/${projectId}`}>
                  <ArrowLeft className="h-4 w-4" />
                </Link>
              </Button>
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Project Assistant
                </p>
                <h1 className="truncate text-lg font-semibold">{project.title}</h1>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge label={statusLabel} />
            <StatusBadge
              label={`Confidence ${completenessPercent}%`}
              className="bg-primary/10 text-primary"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={exportPending}
              onClick={handleExport}
            >
              <Download className="mr-1.5 h-3.5 w-3.5" />
              {exportPending ? "Exporting…" : "Export Scope"}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={estimatePending}
              onClick={handleGenerateEstimate}
            >
              <Sparkles className="mr-1.5 h-3.5 w-3.5" />
              {estimatePending ? "Generating…" : "Generate Estimate"}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={resetPending}
              onClick={() => setResetOpen(true)}
            >
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
              Reset Assistant
            </Button>
          </div>
        </div>
      </header>

      <AssistantV2ResetDialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        onConfirm={() => {
          setResetOpen(false);
          onReset();
        }}
        pending={resetPending}
      />
    </>
  );
}
