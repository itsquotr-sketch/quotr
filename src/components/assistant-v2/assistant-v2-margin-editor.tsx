"use client";

import { useEffect, useRef, useState } from "react";
import {
  syncAssistantState,
  updateAssistantMargin,
  type AssistantSyncPayload,
} from "@/actions/assistant-v2";
import { useEstimateUpdate } from "@/components/projects/estimate-update-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type AssistantV2MarginEditorProps = {
  projectId: string;
  defaultMargin: number;
  onEstimateSync?: (payload: AssistantSyncPayload) => void;
};

export function AssistantV2MarginEditor({
  projectId,
  defaultMargin,
  onEstimateSync,
}: AssistantV2MarginEditorProps) {
  const { markSaving, markUpdating, markSaved, markIdle } = useEstimateUpdate();
  const [margin, setMargin] = useState(String(defaultMargin));
  const savedMarginRef = useRef(defaultMargin);
  const [pending, setPending] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    savedMarginRef.current = defaultMargin;
    setMargin(String(defaultMargin));
  }, [defaultMargin]);

  async function handleApply() {
    const parsed = Number(margin);
    if (!Number.isFinite(parsed)) {
      setErrorMsg("Enter a valid margin percentage.");
      setSuccessMsg(null);
      return;
    }

    if (parsed === savedMarginRef.current) {
      setSuccessMsg("Margin unchanged.");
      setErrorMsg(null);
      return;
    }

    setPending(true);
    setSuccessMsg(null);
    setErrorMsg(null);
    markSaving();
    markUpdating();

    try {
      const result = await updateAssistantMargin(projectId, parsed);
      if (result.error) {
        markIdle();
        setErrorMsg(result.error);
        return;
      }

      savedMarginRef.current = parsed;
      setSuccessMsg(result.message ?? "Margin updated");

      const syncResult = await syncAssistantState(projectId);
      if (syncResult.data) {
        onEstimateSync?.(syncResult.data);
      }

      markSaved({
        costDelta: null,
        previousCompleteness: null,
        newCompleteness: null,
        changeLabel: "margin updated",
      });
    } catch {
      markIdle();
      setErrorMsg("Could not update margin. Try again.");
    } finally {
      setPending(false);
    }
  }

  const parsedMargin = Number(margin);
  const canApply =
    !pending &&
    Number.isFinite(parsedMargin) &&
    parsedMargin !== savedMarginRef.current;

  return (
    <div className="border-t pt-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <Label htmlFor="v2-target-margin" className="text-[10px]">
            Target margin
          </Label>
          <div className="flex items-center gap-1">
            <Input
              id="v2-target-margin"
              type="number"
              min={0}
              max={100}
              step={0.5}
              value={margin}
              onChange={(e) => {
                setSuccessMsg(null);
                setErrorMsg(null);
                setMargin(e.target.value);
              }}
              disabled={pending}
              className="h-8 w-20 text-sm"
            />
            <span className="text-xs text-muted-foreground">%</span>
          </div>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!canApply}
          onClick={() => void handleApply()}
        >
          {pending ? "Applying…" : "Apply"}
        </Button>
      </div>
      {pending && (
        <p className="mt-2 text-xs text-muted-foreground">Updating margin…</p>
      )}
      {successMsg && !errorMsg && !pending && (
        <p className="mt-2 text-xs text-primary">{successMsg}</p>
      )}
      {errorMsg && (
        <p className="mt-2 text-xs text-destructive">{errorMsg}</p>
      )}
    </div>
  );
}
