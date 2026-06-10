"use client";

import { useState, useTransition } from "react";
import {
  acceptScopeSuggestion,
  rejectScopeSuggestion,
} from "@/actions/scope-suggestions";
import { StatusBadge } from "@/components/projects/status-badge";
import { Button } from "@/components/ui/button";
import {
  formatSuggestionConfidence,
  labelForScopeSuggestionStatus,
} from "@/lib/constants/scope-builder";
import type { ProjectScopeSuggestion } from "@/types/database";

interface ScopeBuilderSuggestionsListProps {
  projectId: string;
  suggestions: ProjectScopeSuggestion[];
}

export function ScopeBuilderSuggestionsList({
  projectId,
  suggestions,
}: ScopeBuilderSuggestionsListProps) {
  const [pending, startTransition] = useTransition();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  if (suggestions.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No scope suggestions yet. Save notes, then tap Suggest Scopes to create
        draft suggestions you can accept or reject.
      </p>
    );
  }

  function handleAction(
    suggestionId: string,
    action: "accept" | "reject"
  ) {
    setFeedback(null);
    setActiveId(suggestionId);
    startTransition(async () => {
      const result =
        action === "accept"
          ? await acceptScopeSuggestion(projectId, suggestionId)
          : await rejectScopeSuggestion(projectId, suggestionId);

      setActiveId(null);

      if (result.error) {
        setFeedback(result.error);
        return;
      }

      setFeedback(
        action === "accept"
          ? "Scope added to your project."
          : "Suggestion dismissed."
      );
    });
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Draft suggestions — review each one before adding it to your project.
      </p>

      {feedback && (
        <p className="rounded-lg bg-primary/10 px-3 py-2 text-sm text-primary">
          {feedback}
        </p>
      )}

      {suggestions.map((suggestion) => {
        const isPending = suggestion.status === "pending";
        const isBusy = pending && activeId === suggestion.id;

        return (
          <div
            key={suggestion.id}
            className="rounded-xl border bg-card p-4"
          >
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold">{suggestion.suggested_name}</p>
              <StatusBadge label={suggestion.suggested_scope_type} />
              <StatusBadge
                label={labelForScopeSuggestionStatus(suggestion.status)}
              />
              <StatusBadge
                label={formatSuggestionConfidence(Number(suggestion.confidence))}
              />
            </div>

            {suggestion.suggested_description && (
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                {suggestion.suggested_description}
              </p>
            )}

            {suggestion.suggested_location_area && (
              <p className="mt-2 text-sm text-muted-foreground">
                Area: {suggestion.suggested_location_area}
              </p>
            )}

            {isPending && (
              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <Button
                  type="button"
                  size="sm"
                  disabled={isBusy}
                  onClick={() => handleAction(suggestion.id, "accept")}
                >
                  {isBusy ? "Adding…" : "Accept"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={isBusy}
                  onClick={() => handleAction(suggestion.id, "reject")}
                >
                  Reject
                </Button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
