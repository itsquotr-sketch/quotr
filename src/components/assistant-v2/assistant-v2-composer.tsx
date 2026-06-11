"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Send } from "lucide-react";
import { submitAssistantNotes } from "@/actions/assistant-v2";
import type { AssistantV2ActionState } from "@/actions/assistant-v2";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const initialState: AssistantV2ActionState = {};

interface AssistantV2ComposerProps {
  projectId: string;
  disabled?: boolean;
}

export function AssistantV2Composer({
  projectId,
  disabled = false,
}: AssistantV2ComposerProps) {
  const router = useRouter();
  const boundAction = submitAssistantNotes.bind(null, projectId);
  const [state, formAction, pending] = useActionState(boundAction, initialState);
  const [text, setText] = useState("");

  useEffect(() => {
    if (state.success) {
      setText("");
      router.refresh();
    }
  }, [state.success, router]);

  return (
    <form action={formAction} className="space-y-2">
      <div className="flex gap-2 rounded-xl border bg-background p-2 shadow-sm">
        <Textarea
          name="content"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="e.g. 50m² timber deck, standard finish, tight access…"
          rows={2}
          disabled={disabled || pending}
          className="min-h-0 flex-1 resize-none border-0 bg-transparent shadow-none focus-visible:ring-0"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (text.trim()) {
                e.currentTarget.form?.requestSubmit();
              }
            }
          }}
        />
        <input type="hidden" name="inputType" value="typed_note" />
        <Button
          type="submit"
          size="icon"
          disabled={disabled || pending || !text.trim()}
          className="h-9 w-9 shrink-0 self-end"
        >
          {pending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
      </div>
      {state.error && (
        <p className="text-xs text-destructive">{state.error}</p>
      )}
    </form>
  );
}
