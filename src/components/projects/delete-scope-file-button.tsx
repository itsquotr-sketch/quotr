"use client";

import { useState, useTransition } from "react";
import { Loader2, Trash2 } from "lucide-react";
import {
  deleteScopeDocument,
  deleteScopePhoto,
} from "@/actions/scope-files";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface DeleteScopeFileButtonProps {
  projectId: string;
  scopeId: string;
  fileId: string;
  fileName: string;
  type: "photo" | "document";
  variant?: "overlay" | "inline";
}

export function DeleteScopeFileButton({
  projectId,
  scopeId,
  fileId,
  fileName,
  type,
  variant = "overlay",
}: DeleteScopeFileButtonProps) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    setError(null);
    startTransition(async () => {
      const result =
        type === "photo"
          ? await deleteScopePhoto(projectId, scopeId, fileId)
          : await deleteScopeDocument(projectId, scopeId, fileId);

      if (result.ok) {
        setOpen(false);
      } else {
        setError(result.error);
      }
    });
  }

  const label = type === "photo" ? "photo" : "document";

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={
          variant === "overlay"
            ? "absolute right-1 top-1 h-8 w-8 bg-background/80 backdrop-blur"
            : "h-8 w-8 shrink-0"
        }
        onClick={() => setOpen(true)}
        aria-label={`Delete ${label}`}
      >
        <Trash2 className="h-4 w-4 text-destructive" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="rounded-xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="normal-case tracking-normal">
              Delete {label}?
            </DialogTitle>
            <DialogDescription>
              This will permanently remove &ldquo;{fileName}&rdquo; from storage
              and this scope. This cannot be undone.
            </DialogDescription>
          </DialogHeader>

          {error && (
            <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleDelete}
              disabled={isPending}
            >
              {isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting…
                </>
              ) : (
                "Delete"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
