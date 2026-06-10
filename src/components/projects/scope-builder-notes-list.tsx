"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { Pencil, Trash2 } from "lucide-react";
import {
  deleteScopeBuilderInput,
  updateScopeBuilderInput,
} from "@/actions/scope-builder";
import { StatusBadge } from "@/components/projects/status-badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  SCOPE_BUILDER_INPUT_TYPES,
  labelForScopeBuilderInputStatus,
  labelForScopeBuilderInputType,
} from "@/lib/constants/scope-builder";
import type { ScopeBuilderActionState } from "@/lib/validations/scope-builder";
import { formatDateTime } from "@/lib/utils";
import type { ProjectScopeBuilderInput } from "@/types/database";

interface ScopeBuilderNotesListProps {
  projectId: string;
  inputs: ProjectScopeBuilderInput[];
}

function NoteEditForm({
  projectId,
  input,
  onDone,
}: {
  projectId: string;
  input: ProjectScopeBuilderInput;
  onDone: (message: string) => void;
}) {
  const boundAction = updateScopeBuilderInput.bind(null, projectId, input.id);
  const [state, formAction, pending] = useActionState(
    boundAction,
    {} as ScopeBuilderActionState
  );
  const [inputType, setInputType] = useState(input.input_type);

  useEffect(() => {
    if (state.success) {
      onDone(state.message ?? "Project notes updated.");
    }
  }, [onDone, state.message, state.success]);

  return (
    <form action={formAction} className="mt-4 space-y-4 border-t pt-4">
      <input type="hidden" name="inputType" value={inputType} />

      <div className="space-y-2">
        <Label>Note type</Label>
        <Select value={inputType} onValueChange={setInputType} required>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SCOPE_BUILDER_INPUT_TYPES.map((type) => (
              <SelectItem key={type.value} value={type.value}>
                {type.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {state.fieldErrors?.inputType && (
          <p className="text-sm text-destructive">
            {state.fieldErrors.inputType[0]}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor={`edit-content-${input.id}`}>Content</Label>
        <Textarea
          id={`edit-content-${input.id}`}
          name="content"
          defaultValue={input.content}
          rows={5}
          required
        />
        {state.fieldErrors?.content && (
          <p className="text-sm text-destructive">
            {state.fieldErrors.content[0]}
          </p>
        )}
      </div>

      {state.error && (
        <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.error}
        </p>
      )}

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Saving…" : "Save changes"}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => onDone("")}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

export function ScopeBuilderNotesList({
  projectId,
  inputs,
}: ScopeBuilderNotesListProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  if (inputs.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No project notes saved yet. Add what you know above — site visit notes,
        phone call summaries, or anything the client told you.
      </p>
    );
  }

  function handleDelete(inputId: string) {
    const confirmed = window.confirm(
      "Delete this project note? Pending suggestions from this note will be dismissed. Scopes you already added will stay."
    );

    if (!confirmed) {
      return;
    }

    setFeedback(null);
    setDeletingId(inputId);
    startTransition(async () => {
      const result = await deleteScopeBuilderInput(projectId, inputId);
      setDeletingId(null);

      if (result.error) {
        setFeedback(result.error);
        return;
      }

      setFeedback(result.message ?? "Project notes deleted.");
      if (editingId === inputId) {
        setEditingId(null);
      }
    });
  }

  return (
    <div className="space-y-3">
      {feedback && (
        <p className="rounded-lg bg-primary/10 px-3 py-2 text-sm text-primary">
          {feedback}
        </p>
      )}

      {inputs.map((input) => {
        const isEditing = editingId === input.id;
        const isDeleting = pending && deletingId === input.id;

        return (
          <div key={input.id} className="rounded-xl border bg-muted/20 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge
                  label={labelForScopeBuilderInputType(input.input_type)}
                />
                <StatusBadge
                  label={labelForScopeBuilderInputStatus(input.status)}
                />
                <span className="text-xs text-muted-foreground">
                  {formatDateTime(input.created_at)}
                </span>
              </div>

              {!isEditing && (
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setEditingId(input.id)}
                  >
                    <Pencil className="h-4 w-4" />
                    Edit
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={isDeleting}
                    onClick={() => handleDelete(input.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                    {isDeleting ? "Deleting…" : "Delete"}
                  </Button>
                </div>
              )}
            </div>

            {!isEditing ? (
              <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed">
                {input.content}
              </p>
            ) : (
              <NoteEditForm
                projectId={projectId}
                input={input}
                onDone={(message) => {
                  setEditingId(null);
                  if (message) {
                    setFeedback(message);
                  }
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
