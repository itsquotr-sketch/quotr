"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ArrowLeft, Download, RotateCcw } from "lucide-react";
import { exportScopeSummary } from "@/actions/assistant-v2";
import { AssistantV2ResetDialog } from "@/components/assistant-v2/assistant-v2-reset-dialog";
import { StatusBadge } from "@/components/projects/status-badge";
import { Button } from "@/components/ui/button";
import { PROJECT_STATUSES, labelFor } from "@/lib/constants/projects";
import type { EstimateQualityTier } from "@/lib/cost-engine/estimate-quality";
import type { Project } from "@/types/database";
import { toast } from "sonner";

interface AssistantV2HeaderProps {
  project: Project;
  projectId: string;
  estimateQualityTier: EstimateQualityTier;
  onReset: () => void;
  resetPending: boolean;
}

export function AssistantV2Header({
  project,
  projectId,
  estimateQualityTier,
  onReset,
  resetPending,
}: AssistantV2HeaderProps) {
  const [resetOpen, setResetOpen] = useState(false);
  const [exportPending, startExport] = useTransition();

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

  return (
    <>
      <header className="border-b bg-background px-4 py-4 lg:px-6">
        <div className="flex flex-col gap-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-2">
              <Button asChild variant="ghost" size="icon" className="mt-0.5 shrink-0">
                <Link href="/projects">
                  <ArrowLeft className="h-4 w-4" />
                  <span className="sr-only">Back to projects</span>
                </Link>
              </Button>
              <div className="min-w-0">
                <h1 className="truncate text-lg font-semibold">{project.title}</h1>
              </div>
            </div>
            <Link
              href={`/projects/${projectId}/legacy`}
              className="shrink-0 text-xs text-muted-foreground hover:text-foreground hover:underline"
            >
              Legacy view
            </Link>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge label={statusLabel} />
            <StatusBadge
              label={`Estimate ${estimateQualityTier}`}
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
