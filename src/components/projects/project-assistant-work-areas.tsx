"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState, useTransition } from "react";
import { CheckCircle2 } from "lucide-react";
import {
  addAssistantWorkArea,
  toggleWorkAreaInQuickEstimate,
  type WorkAreaActionState,
} from "@/actions/work-areas";
import {
  acceptScopeSuggestion,
  acceptScopeSuggestionWithEdits,
  rejectScopeSuggestion,
} from "@/actions/scope-suggestions";
import { StatusBadge } from "@/components/projects/status-badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatSuggestionConfidence } from "@/lib/constants/scope-builder";
import type { ScopeSuggestionActionState } from "@/lib/validations/scope-suggestion";
import type { ProjectScope, ProjectScopeSuggestion } from "@/types/database";
import { cn } from "@/lib/utils";

interface ProjectAssistantWorkAreasProps {
  projectId: string;
  suggestions: ProjectScopeSuggestion[];
  confirmedScopes: (ProjectScope & { scope_types: { name: string } | null })[];
}

export function ProjectAssistantWorkAreas({
  projectId,
  suggestions,
  confirmedScopes,
}: ProjectAssistantWorkAreasProps) {
  const pending = suggestions.filter((s) => s.status === "pending");
  const hasConfirmed = confirmedScopes.length > 0;

  if (pending.length === 0 && !hasConfirmed) {
    return (
      <p className="text-sm text-muted-foreground">
        No work areas identified yet. Save your notes and tap{" "}
        <span className="font-medium text-foreground">Analyse Project</span> to
        let Quotr identify what needs quoting.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Accept work areas Quotr found, or edit before confirming.
      </p>

      {hasConfirmed && (
        <div className="space-y-3">
          {confirmedScopes.map((scope) => (
            <ConfirmedWorkAreaCard
              key={scope.id}
              projectId={projectId}
              scope={scope}
            />
          ))}
        </div>
      )}

      <AddWorkAreaSection projectId={projectId} />

      {pending.length > 0 && (
        <div className="space-y-3">
          {hasConfirmed && (
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Awaiting confirmation
            </h4>
          )}
          {pending.map((suggestion) => (
            <DetectedWorkAreaCard
              key={suggestion.id}
              projectId={projectId}
              suggestion={suggestion}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ConfirmedWorkAreaCard({
  projectId,
  scope,
}: {
  projectId: string;
  scope: ProjectScope & { scope_types: { name: string } | null };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const included = scope.include_in_quick_estimate !== false;

  const scopeNote =
    scope.description?.trim() ||
    scope.scope_types?.name ||
    "Confirmed work area";

  function handleToggle(checked: boolean) {
    startTransition(async () => {
      await toggleWorkAreaInQuickEstimate(projectId, scope.id, checked);
      router.refresh();
    });
  }

  return (
    <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold">{scope.name}</p>
            <StatusBadge label="Confirmed" />
            {!included && (
              <StatusBadge label="Excluded from quick estimate" />
            )}
          </div>
          {scope.scope_types?.name && (
            <StatusBadge label={scope.scope_types.name} />
          )}
        </div>
        <span className="inline-flex shrink-0 items-center gap-1 text-xs text-primary">
          <CheckCircle2 className="h-3.5 w-3.5" />
          Confirmed
        </span>
      </div>

      <div className="mt-2 flex items-center justify-between gap-2 rounded-md border bg-background/60 px-2 py-1.5">
        <Label htmlFor={`include-${scope.id}`} className="text-xs font-normal">
          Include in estimate
        </Label>
        <input
          id={`include-${scope.id}`}
          type="checkbox"
          className="h-4 w-4 accent-primary"
          checked={included}
          disabled={pending}
          onChange={(e) => handleToggle(e.target.checked)}
        />
      </div>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        {scopeNote}
      </p>
      {scope.location_area && (
        <p className="mt-1 text-xs text-muted-foreground">
          Location: {scope.location_area}
        </p>
      )}
    </div>
  );
}

function DetectedWorkAreaCard({
  projectId,
  suggestion,
}: {
  projectId: string;
  suggestion: ProjectScopeSuggestion;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  function runAction(action: "accept" | "reject", suggestionId: string) {
    setFeedback(null);
    setActiveAction(`${action}-${suggestionId}`);
    startTransition(async () => {
      const result =
        action === "accept"
          ? await acceptScopeSuggestion(projectId, suggestionId)
          : await rejectScopeSuggestion(projectId, suggestionId);

      setActiveAction(null);
      if (result.error) {
        setFeedback(result.error);
        return;
      }
      setFeedback(
        action === "accept" ? "Work area confirmed." : "Work area dismissed."
      );
      router.refresh();
    });
  }

  const isBusy = pending && activeAction?.endsWith(suggestion.id);
  const confidenceLabel = formatSuggestionConfidence(
    Number(suggestion.confidence)
  );

  return (
    <>
      <div className="rounded-lg border bg-card p-3">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-semibold">{suggestion.suggested_name}</p>
          <StatusBadge label={suggestion.suggested_scope_type} />
          <StatusBadge label="Detected" />
          <StatusBadge label={confidenceLabel} />
        </div>

        {suggestion.suggested_description && (
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {suggestion.suggested_description}
          </p>
        )}

        {suggestion.suggested_location_area && (
          <p className="mt-1 text-xs text-muted-foreground">
            Location: {suggestion.suggested_location_area}
          </p>
        )}

        {feedback && (
          <p
            className={cn(
              "mt-3 rounded-lg px-3 py-2 text-sm",
              feedback.includes("dismissed")
                ? "bg-muted text-muted-foreground"
                : "bg-primary/10 text-primary"
            )}
          >
            {feedback}
          </p>
        )}

        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <Button
            type="button"
            size="sm"
            disabled={isBusy}
            onClick={() => runAction("accept", suggestion.id)}
          >
            {isBusy && activeAction?.startsWith("accept")
              ? "Confirming…"
              : "Accept"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={isBusy}
            onClick={() => setEditOpen(true)}
          >
            Edit
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={isBusy}
            onClick={() => runAction("reject", suggestion.id)}
          >
            Reject
          </Button>
        </div>
      </div>

      <EditWorkAreaDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        projectId={projectId}
        suggestion={suggestion}
      />
    </>
  );
}

function AddWorkAreaSection({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"template" | "custom">("template");
  const router = useRouter();
  const boundAction = addAssistantWorkArea.bind(null, projectId);
  const [state, formAction, pending] = useActionState(
    boundAction,
    {} as WorkAreaActionState
  );

  useEffect(() => {
    if (state.success) {
      setOpen(false);
      router.refresh();
    }
  }, [state.success, router]);

  if (!open) {
    return (
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-8 text-xs"
        onClick={() => setOpen(true)}
      >
        Add work area
      </Button>
    );
  }

  return (
    <form action={formAction} className="space-y-3 rounded-lg border p-3">
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          variant={mode === "template" ? "default" : "outline"}
          className="h-7 text-xs"
          onClick={() => setMode("template")}
        >
          From template
        </Button>
        <Button
          type="button"
          size="sm"
          variant={mode === "custom" ? "default" : "outline"}
          className="h-7 text-xs"
          onClick={() => setMode("custom")}
        >
          Custom
        </Button>
      </div>

      <input type="hidden" name="mode" value={mode} />

      {mode === "template" ? (
        <div className="space-y-2">
          <Label htmlFor="templateKey" className="text-xs">
            Template
          </Label>
          <select
            id="templateKey"
            name="templateKey"
            className="h-8 w-full rounded-md border bg-background px-2 text-sm"
            defaultValue="deck"
          >
            <option value="deck">Deck</option>
            <option value="retaining-wall">Retaining Wall</option>
            <option value="bathroom-renovation">Bathroom Renovation</option>
          </select>
        </div>
      ) : (
        <>
          <div className="space-y-1">
            <Label htmlFor="customName" className="text-xs">
              Name
            </Label>
            <Input id="customName" name="name" required className="h-8 text-sm" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="customDescription" className="text-xs">
              Short description
            </Label>
            <Textarea
              id="customDescription"
              name="description"
              rows={2}
              className="text-sm"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="likelyTrade" className="text-xs">
              Likely trade (optional)
            </Label>
            <Input id="likelyTrade" name="likelyTrade" className="h-8 text-sm" />
          </div>
        </>
      )}

      {state.error && <p className="text-xs text-destructive">{state.error}</p>}

      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending} className="h-7 text-xs">
          {pending ? "Adding…" : "Add work area"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 text-xs"
          onClick={() => setOpen(false)}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}

function EditWorkAreaDialog({
  open,
  onOpenChange,
  projectId,
  suggestion,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  suggestion: ProjectScopeSuggestion;
}) {
  const boundAction = acceptScopeSuggestionWithEdits.bind(
    null,
    projectId,
    suggestion.id
  );
  const [state, formAction, formPending] = useActionState(
    boundAction,
    {} as ScopeSuggestionActionState
  );

  const router = useRouter();

  useEffect(() => {
    if (state.success) {
      onOpenChange(false);
      router.refresh();
    }
  }, [state.success, onOpenChange, router]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="normal-case tracking-normal">
            Edit work area
          </DialogTitle>
          <DialogDescription>
            Adjust the name or description before confirming this work area.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-work-area-name">Work area name</Label>
            <Input
              id="edit-work-area-name"
              name="name"
              defaultValue={suggestion.suggested_name}
              required
              className="text-base"
            />
            {state.fieldErrors?.name && (
              <p className="text-sm text-destructive">
                {state.fieldErrors.name[0]}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-work-area-description">Description</Label>
            <Textarea
              id="edit-work-area-description"
              name="description"
              defaultValue={suggestion.suggested_description ?? ""}
              rows={4}
              className="text-base"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-work-area-location">Location / area</Label>
            <Input
              id="edit-work-area-location"
              name="locationArea"
              defaultValue={suggestion.suggested_location_area ?? ""}
              className="text-base"
            />
          </div>

          {state.error && (
            <p className="text-sm text-destructive">{state.error}</p>
          )}

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="submit" disabled={formPending}>
              {formPending ? "Confirming…" : "Confirm work area"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
