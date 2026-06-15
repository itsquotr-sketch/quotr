"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  refinementAddMoreDetail,
  refinementAddRates,
  refinementAnswerNow,
  refinementSkipForNow,
  submitAssistantNotes,
} from "@/actions/assistant-v2";
import { AnswerChips } from "@/components/assistant-v2/answer-chips";
import {
  ScopeRateOnboardingDialog,
  type BenchmarkScopeForOnboarding,
} from "@/components/assistant-v2/scope-rate-onboarding-dialog";
import { useAssistantChat } from "@/components/assistant-v2/assistant-chat-context";
import { useEstimateUpdate } from "@/components/projects/estimate-update-context";
import type { RefinementAnswerQuestion } from "@/lib/assistant-v2/refinement/refinement-batch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type AssistantRefinementTriggerProps = {
  projectId: string;
  message: string;
  label: string;
  variant?: "default" | "outline" | "secondary" | "ghost";
  size?: "default" | "sm" | "lg" | "icon";
  className?: string;
};

export function AssistantRefinementTrigger({
  projectId,
  message,
  label,
  variant = "outline",
  size = "sm",
  className,
}: AssistantRefinementTriggerProps) {
  const {
    addOptimisticUserMessage,
    addOptimisticAssistantMessage,
    resolveOptimisticMessage,
    syncAssistant,
    clearOptimisticMessages,
  } = useAssistantChat();
  const { markSaving, markUpdating, markSaved, markIdle } = useEstimateUpdate();
  const [pending, startTransition] = useTransition();

  function handleClick() {
    if (pending) return;

    const optimisticId = addOptimisticUserMessage(message);
    addOptimisticAssistantMessage("Processing…");
    markSaving();

    const formData = new FormData();
    formData.set("content", message);

    startTransition(async () => {
      try {
        markUpdating();
        const result = await submitAssistantNotes(projectId, {}, formData);
        if (result.error) {
          resolveOptimisticMessage(optimisticId, result.error);
          markIdle();
          return;
        }
        resolveOptimisticMessage(optimisticId);
        await syncAssistant();
        clearOptimisticMessages();
        markSaved({
          costDelta: null,
          previousCompleteness: null,
          newCompleteness: null,
          changeLabel: "after refinement",
        });
      } catch {
        resolveOptimisticMessage(optimisticId, "Something went wrong.");
        markIdle();
      }
    });
  }

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      disabled={pending}
      className={cn("h-8 text-xs", className)}
      onClick={handleClick}
    >
      {label}
    </Button>
  );
}

type SharpeningOptionsActionsProps = {
  projectId: string;
  sourceMessageId?: string;
  refinementBatchId?: string;
  actionTaken?: string;
  options?: { id: string; label: string }[];
  benchmarkScopes?: BenchmarkScopeForOnboarding[];
};

export function SharpeningOptionsActions({
  projectId,
  sourceMessageId,
  refinementBatchId,
  actionTaken,
  options,
  benchmarkScopes = [],
}: SharpeningOptionsActionsProps) {
  const router = useRouter();
  const { syncAssistant } = useAssistantChat();
  const { markUpdating, markSaved, markIdle } = useEstimateUpdate();
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [resolved, setResolved] = useState(Boolean(actionTaken));
  const [rateDialogOpen, setRateDialogOpen] = useState(false);
  const [selectedRateScope, setSelectedRateScope] =
    useState<BenchmarkScopeForOnboarding | null>(null);
  const [rateChoices, setRateChoices] = useState<BenchmarkScopeForOnboarding[]>(
    []
  );
  const [showRateChoices, setShowRateChoices] = useState(false);

  const chips = options ?? [
    { id: "answer_now", label: "Answer now" },
    { id: "skip", label: "Skip for now" },
    { id: "add_rates", label: "Add your rates" },
  ];

  async function runAction(
    actionId: string,
    fn: () => Promise<{ error?: string; success?: boolean; navigateTo?: string; singleRateScope?: BenchmarkScopeForOnboarding | null; rateScopes?: BenchmarkScopeForOnboarding[] }>
  ) {
    if (pendingAction || resolved) return;
    setPendingAction(actionId);
    markUpdating();

    try {
      const result = await fn();
      if (result.error) {
        toast.error(result.error);
        markIdle();
        return;
      }

      await syncAssistant();
      setResolved(true);

      if (actionId === "add_rates") {
        if (result.navigateTo) {
          router.push(result.navigateTo);
          markIdle();
          return;
        }

        const scopes = result.rateScopes ?? benchmarkScopes;
        if (result.singleRateScope) {
          setSelectedRateScope(result.singleRateScope);
          setRateDialogOpen(true);
          markIdle();
          return;
        }

        if (scopes.length > 1) {
          setRateChoices(scopes);
          setShowRateChoices(true);
          markIdle();
          return;
        }

        if (scopes.length === 1) {
          setSelectedRateScope(scopes[0]!);
          setRateDialogOpen(true);
          markIdle();
          return;
        }
      }

      if (actionId === "answer_now") {
        markSaved({
          costDelta: null,
          previousCompleteness: null,
          newCompleteness: null,
          changeLabel: "after refinement answers",
        });
      } else {
        markIdle();
      }
    } catch {
      toast.error("Something went wrong. Please try again.");
      markIdle();
    } finally {
      setPendingAction(null);
    }
  }

  if (resolved && actionTaken && !showRateChoices) {
    const label =
      actionTaken === "answer_now"
        ? "Answered"
        : actionTaken === "skipped"
          ? "Skipped for now"
          : actionTaken === "add_rates"
            ? "Rates opened"
            : "Done";
    return (
      <p className="mt-2 pl-1 text-xs text-muted-foreground">{label}</p>
    );
  }

  if (resolved && !showRateChoices) {
    return null;
  }

  return (
    <>
      <div className="mt-2 flex flex-wrap gap-2 pl-1">
        {showRateChoices ? (
          <>
            <p className="w-full text-xs text-muted-foreground">
              Which rate do you want to add?
            </p>
            {rateChoices.map((scope) => (
              <Button
                key={scope.scopeTypeKey}
                type="button"
                size="sm"
                variant="outline"
                disabled={Boolean(pendingAction)}
                onClick={() => {
                  setSelectedRateScope(scope);
                  setRateDialogOpen(true);
                  setShowRateChoices(false);
                }}
              >
                {scope.label}
              </Button>
            ))}
          </>
        ) : (
          chips.map((chip) => (
            <Button
              key={chip.id}
              type="button"
              size="sm"
              variant={chip.id === "answer_now" ? "default" : "outline"}
              disabled={Boolean(pendingAction)}
              onClick={() => {
                if (chip.id === "answer_now") {
                  void runAction("answer_now", () =>
                    refinementAnswerNow(
                      projectId,
                      refinementBatchId,
                      sourceMessageId
                    )
                  );
                } else if (chip.id === "skip") {
                  void runAction("skip", () =>
                    refinementSkipForNow(
                      projectId,
                      refinementBatchId,
                      sourceMessageId
                    )
                  );
                } else if (chip.id === "add_rates") {
                  void runAction("add_rates", () =>
                    refinementAddRates(
                      projectId,
                      refinementBatchId,
                      sourceMessageId
                    )
                  );
                }
              }}
            >
              {pendingAction === chip.id
                ? chip.id === "answer_now"
                  ? "Preparing questions…"
                  : chip.id === "skip"
                    ? "Skipping…"
                    : "Opening rate setup…"
                : chip.label}
            </Button>
          ))
        )}
      </div>

      <ScopeRateOnboardingDialog
        projectId={projectId}
        scope={selectedRateScope}
        open={rateDialogOpen}
        onOpenChange={setRateDialogOpen}
        onSaved={async () => {
          markUpdating();
          await syncAssistant();
          markSaved({
            costDelta: null,
            previousCompleteness: null,
            newCompleteness: null,
            changeLabel: "after rate saved",
          });
        }}
      />
    </>
  );
}

export function RefinementStatusActions({ projectId }: { projectId: string }) {
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      <AssistantRefinementTrigger
        projectId={projectId}
        message="What details would help?"
        label="What details would help?"
        variant="outline"
        size="sm"
      />
      <AddMoreDetailButton projectId={projectId} />
    </div>
  );
}

export function AddMoreDetailButton({
  projectId,
  scopeId,
  label = "Add more detail",
  variant = "outline",
  className,
}: {
  projectId: string;
  scopeId?: string;
  label?: string;
  variant?: "default" | "outline" | "secondary" | "ghost";
  className?: string;
}) {
  const { syncAssistant } = useAssistantChat();
  const { markUpdating, markSaved, markIdle } = useEstimateUpdate();
  const [pending, startTransition] = useTransition();

  function handleClick() {
    if (pending) return;
    startTransition(async () => {
      markUpdating();
      try {
        const result = await refinementAddMoreDetail(projectId, scopeId);
        if (result.error) {
          toast.error(result.error);
          markIdle();
          return;
        }
        await syncAssistant();
        markSaved({
          costDelta: null,
          previousCompleteness: null,
          newCompleteness: null,
          changeLabel: "after adding detail",
        });
      } catch {
        toast.error("Something went wrong.");
        markIdle();
      }
    });
  }

  return (
    <Button
      type="button"
      variant={variant}
      size="sm"
      disabled={pending}
      className={cn("h-8 text-xs", className)}
      onClick={handleClick}
    >
      {pending ? "Loading…" : label}
    </Button>
  );
}

function RefinementQuestionRow({
  question,
  selected,
  onAnswer,
}: {
  question: RefinementAnswerQuestion;
  selected: string;
  onAnswer: (answer: string, label: string) => void;
}) {
  const [numberValue, setNumberValue] = useState(selected);

  useEffect(() => {
    setNumberValue(selected);
  }, [selected, question.questionId]);

  if (question.inputType === "select" && question.options.length > 0) {
    return (
      <div className="space-y-1.5">
        <p className="text-sm font-medium">{question.questionText}</p>
        <AnswerChips
          options={question.options}
          value={selected}
          onSelect={(value) => {
            const label =
              question.options.find((o) => o.value === value)?.label ?? value;
            onAnswer(value, label);
          }}
        />
      </div>
    );
  }

  if (question.inputType === "number") {
    function submitNumeric() {
      if (!numberValue.trim()) return;
      const label = question.unit
        ? `${numberValue.trim()} ${question.unit}`
        : numberValue.trim();
      onAnswer(numberValue.trim(), label);
    }

    return (
      <div className="space-y-1.5">
        <p className="text-sm font-medium">{question.questionText}</p>
        <div className="flex gap-2">
          <Input
            type="number"
            min={0}
            step="any"
            value={numberValue}
            placeholder={question.placeholder ?? "e.g. 12"}
            className="h-9"
            onChange={(e) => setNumberValue(e.target.value)}
            onBlur={submitNumeric}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submitNumeric();
              }
            }}
          />
          {question.unit && (
            <span className="self-center text-xs text-muted-foreground">
              {question.unit}
            </span>
          )}
          {selected && (
            <span className="self-center text-xs text-primary">Updated.</span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium">{question.questionText}</p>
      <Input
        value={numberValue}
        placeholder={question.placeholder ?? "Your answer"}
        className="h-9"
        onChange={(e) => setNumberValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && numberValue.trim()) {
            onAnswer(numberValue.trim(), numberValue.trim());
          }
        }}
      />
    </div>
  );
}

export function RefinementAnswerBatch({
  questions,
}: {
  questions: RefinementAnswerQuestion[];
}) {
  const { flushScopeBatch, optimisticAnswers, syncAssistant } = useAssistantChat();
  const { markUpdating, markSaved } = useEstimateUpdate();
  const [localAnswers, setLocalAnswers] = useState<
    Record<string, { answer: string; label: string }>
  >({});
  const [submitted, setSubmitted] = useState(false);
  const flushedRef = useRef(false);
  const questionIds = questions.map((q) => q.questionId).join(",");

  useEffect(() => {
    flushedRef.current = false;
    setSubmitted(false);
    setLocalAnswers({});
  }, [questionIds]);

  const merged = useMemo(() => {
    const m: Record<string, { answer: string; label: string }> = {};
    for (const q of questions) {
      const local = localAnswers[q.questionKey];
      const opt = optimisticAnswers[q.questionKey];
      if (local) {
        m[q.questionKey] = local;
      } else if (opt) {
        const label =
          q.options.find((o) => o.value === opt)?.label ?? opt;
        m[q.questionKey] = { answer: opt, label };
      }
    }
    return m;
  }, [questions, localAnswers, optimisticAnswers]);

  const allAnswered = questions.every((q) => merged[q.questionKey]);

  const tryFlush = useCallback(() => {
    if (!allAnswered || flushedRef.current) return;

    const batch = questions.map((q) => {
      const item = merged[q.questionKey]!;
      return {
        questionId: q.questionId,
        questionKey: q.questionKey,
        answer: item.answer,
        label: item.label,
      };
    });

    flushedRef.current = true;
    setSubmitted(true);
    markUpdating();
    flushScopeBatch(batch);
    void syncAssistant().then(() => {
      markSaved({
        costDelta: null,
        previousCompleteness: null,
        newCompleteness: null,
        changeLabel: "after refinement",
      });
    });
  }, [allAnswered, questions, merged, flushScopeBatch, syncAssistant, markUpdating, markSaved]);

  function handleAnswer(
    q: RefinementAnswerQuestion,
    answer: string,
    label: string
  ) {
    setLocalAnswers((prev) => ({
      ...prev,
      [q.questionKey]: { answer, label },
    }));
  }

  return (
    <div className="mt-2 max-w-[90%] rounded-2xl rounded-bl-md border bg-card px-4 py-3 text-sm shadow-sm">
      <div className="space-y-4">
        {questions.map((q, index) => (
          <div key={q.questionId}>
            <p className="mb-2 text-xs text-muted-foreground">
              {index + 1}. {q.scopeName}
            </p>
            <RefinementQuestionRow
              question={q}
              selected={merged[q.questionKey]?.answer ?? ""}
              onAnswer={(answer, label) => handleAnswer(q, answer, label)}
            />
          </div>
        ))}
      </div>
      <Button
        type="button"
        size="sm"
        className="mt-4"
        disabled={!allAnswered || flushedRef.current}
        onClick={tryFlush}
      >
        Submit answers
      </Button>
      {submitted && (
        <p className="mt-2 text-xs text-muted-foreground">
          Updated. Estimate refreshed.
        </p>
      )}
    </div>
  );
}
