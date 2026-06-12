"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Send } from "lucide-react";
import { submitAssistantNotes } from "@/actions/assistant-v2";
import { useAssistantChat } from "@/components/assistant-v2/assistant-chat-context";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface AssistantV2ComposerProps {
  projectId: string;
  disabled?: boolean;
}

export function AssistantV2Composer({
  projectId,
  disabled = false,
}: AssistantV2ComposerProps) {
  const router = useRouter();
  const { addOptimisticUserMessage, resolveOptimisticMessage } =
    useAssistantChat();
  const [pending, startTransition] = useTransition();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const content = text.trim();
    if (!content || pending) return;

    setError(null);
    const optimisticId = addOptimisticUserMessage(content);
    setText("");

    const formData = new FormData();
    formData.set("content", content);

    startTransition(async () => {
      const result = await submitAssistantNotes(projectId, {}, formData);
      if (result.error) {
        setError(result.error);
        resolveOptimisticMessage(optimisticId, result.error);
        return;
      }
      resolveOptimisticMessage(optimisticId);
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
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
                handleSubmit(e);
              }
            }
          }}
        />
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
      {error && <p className="text-xs text-destructive">{error}</p>}
    </form>
  );
}
