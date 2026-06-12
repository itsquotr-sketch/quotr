"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface AssistantV2ResetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  pending?: boolean;
}

export function AssistantV2ResetDialog({
  open,
  onOpenChange,
  onConfirm,
  pending = false,
}: AssistantV2ResetDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reset assistant?</DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-3 pt-1 text-sm text-muted-foreground">
              <p>
                Reset assistant? This clears AI analysis, answers, site
                conditions and draft estimate, but keeps the project, client
                details and notes.
              </p>
              <p>It will remove:</p>
              <ul className="list-inside list-disc space-y-0.5">
                <li>Discovery results</li>
                <li>Generated questions and answers</li>
                <li>Work areas and draft estimate</li>
                <li>Constraints and estimate trace</li>
              </ul>
              <p>It will <strong>not</strong> remove:</p>
              <ul className="list-inside list-disc space-y-0.5">
                <li>Project and client details</li>
                <li>Saved project notes</li>
                <li>Photos and uploaded documents</li>
              </ul>
            </div>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={onConfirm}
            disabled={pending}
          >
            {pending ? "Resetting…" : "Reset Assistant"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
