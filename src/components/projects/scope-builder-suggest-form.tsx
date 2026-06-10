"use client";

import { useTransition } from "react";
import { suggestScopesFromNotes } from "@/actions/scope-suggestions";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";
import { useState } from "react";

interface ScopeBuilderSuggestFormProps {
  projectId: string;
  hasNotes: boolean;
}

export function ScopeBuilderSuggestForm({
  projectId,
  hasNotes,
}: ScopeBuilderSuggestFormProps) {
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  function handleSuggest() {
    setFeedback(null);
    startTransition(async () => {
      const result = await suggestScopesFromNotes(projectId);
      if (result.error) {
        setFeedback({ type: "error", text: result.error });
        return;
      }
      setFeedback({
        type: "success",
        text:
          result.message ??
          "Draft scope suggestions are ready for you to review.",
      });
    });
  }

  return (
    <div className="space-y-3 border-t pt-6">
      <Button
        type="button"
        className="w-full sm:w-auto"
        disabled={pending || !hasNotes}
        onClick={handleSuggest}
      >
        <Sparkles className="h-4 w-4" />
        {pending ? "Suggesting scopes…" : "Suggest Scopes"}
      </Button>
      <p className="text-sm text-muted-foreground">
        Quotr scans saved project notes and suggests draft scopes. You stay in
        control.
      </p>
      {!hasNotes && (
        <p className="text-sm text-muted-foreground">
          Add and save project notes before suggesting scopes.
        </p>
      )}
      {feedback && (
        <p
          className={
            feedback.type === "error"
              ? "rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
              : "rounded-lg bg-primary/10 px-3 py-2 text-sm text-primary"
          }
        >
          {feedback.text}
        </p>
      )}
    </div>
  );
}
