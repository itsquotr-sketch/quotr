"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AnswerChips } from "@/components/assistant-v2/answer-chips";
import { contextualQuestionText } from "@/lib/assistant-v2/build-assistant-messages";
import { useEstimateUpdate } from "@/components/projects/estimate-update-context";
import { Input } from "@/components/ui/input";
import { autoSaveScopeQuestionAnswer } from "@/actions/assistant-v2";
import type { PricingQuestion } from "@/lib/assistant-v2/get-next-pricing-question";

interface AssistantV2QuestionCardProps {
  projectId: string;
  question: PricingQuestion;
  showHeader?: boolean;
}

export function AssistantV2QuestionCard({
  projectId,
  question,
  showHeader = true,
}: AssistantV2QuestionCardProps) {
  const router = useRouter();
  const { markSaving, markUpdating, markSaved } = useEstimateUpdate();
  const [pending, startTransition] = useTransition();
  const [numberValue, setNumberValue] = useState("");
  const [previousCompleteness] = useState(() => {
    if (typeof window === "undefined") return null;
    const stored = sessionStorage.getItem(`quotr-v2-confidence-${projectId}`);
    return stored ? Number(stored) : null;
  });

  function saveAnswer(answer: string) {
    if (!answer.trim() || pending) return;

    startTransition(async () => {
      markSaving();
      const result = await autoSaveScopeQuestionAnswer(
        projectId,
        question.questionId,
        answer.trim()
      );
      if (result.error) return;
      markUpdating();
      router.refresh();
      markSaved();
    });
  }

  const questionLabel = contextualQuestionText(question);

  return (
    <div className="max-w-lg rounded-2xl border bg-card p-4 shadow-sm">
      {showHeader && (
        <p className="text-sm font-medium">{questionLabel}</p>
      )}

      {!showHeader && (
        <p className="text-sm font-medium">{questionLabel}</p>
      )}

      <div className="mt-3">
        {question.inputType === "select" && question.options.length > 0 ? (
          <AnswerChips
            options={question.options}
            onSelect={saveAnswer}
            disabled={pending}
          />
        ) : question.inputType === "number" ? (
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={0}
              step="any"
              value={numberValue}
              disabled={pending}
              placeholder={question.placeholder}
              className="h-9 max-w-[140px]"
              onChange={(e) => setNumberValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && numberValue.trim()) {
                  saveAnswer(numberValue.trim());
                }
              }}
            />
            {question.unit && (
              <span className="text-xs text-muted-foreground">
                {question.unit}
              </span>
            )}
            {numberValue.trim() && (
              <button
                type="button"
                disabled={pending}
                onClick={() => saveAnswer(numberValue.trim())}
                className="text-xs font-medium text-primary hover:underline"
              >
                {pending ? "Saving…" : "Confirm"}
              </button>
            )}
          </div>
        ) : (
          <Input
            type="text"
            disabled={pending}
            placeholder={question.placeholder}
            className="h-9"
            onKeyDown={(e) => {
              const val = (e.target as HTMLInputElement).value;
              if (e.key === "Enter" && val.trim()) saveAnswer(val.trim());
            }}
          />
        )}
      </div>

      {previousCompleteness != null && pending && (
        <p className="mt-2 text-[11px] text-muted-foreground">Updating estimate…</p>
      )}
    </div>
  );
}

