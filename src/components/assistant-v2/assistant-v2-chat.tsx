"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTransition } from "react";
import { acceptScopeSuggestion } from "@/actions/scope-suggestions";
import { AnswerChips } from "@/components/assistant-v2/answer-chips";
import { AssistantConversationPanel } from "@/components/assistant-v2/assistant-conversation-panel";
import { useAssistantChat } from "@/components/assistant-v2/assistant-chat-context";
import { AssistantV2UnderstoodCard } from "@/components/assistant-v2/assistant-v2-understood-card";
import { useEstimateUpdate } from "@/components/projects/estimate-update-context";
import { contextualQuestionText } from "@/lib/assistant-v2/build-assistant-messages";
import { computeProjectCompleteness } from "@/lib/assistant-v2/compute-information-completeness";
import {
  collectAnsweredQuestionKeys,
  getNextAssistantTurn,
  type AssistantTurn,
} from "@/lib/assistant-v2/get-next-assistant-turn";
import type { ScopeGroupInput } from "@/lib/assistant-v2/get-next-pricing-question";
import type { PricingQuestion } from "@/lib/assistant-v2/get-next-pricing-question";
import { normaliseQualityLevel } from "@/lib/constants/quality-level";
import { resolveWorkAreaTypeKey } from "@/lib/project-assistant-questions";
import type { ScopeQuestionWithAnswers } from "@/lib/project-assistant-data";
import type { DiscoveryResult } from "@/lib/ai/discovery/types";
import type { ProjectScope, ProjectScopeSuggestion } from "@/types/database";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

function UserBubble({ children }: { children: ReactNode }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-sm text-primary-foreground">
        {children}
      </div>
    </div>
  );
}

function AssistantBubble({ children }: { children: ReactNode }) {
  return (
    <div className="flex justify-start">
      <div className="max-w-[90%] rounded-2xl rounded-bl-md border bg-card px-4 py-3 text-sm shadow-sm">
        {children}
      </div>
    </div>
  );
}

interface AssistantV2ChatProps {
  projectId: string;
  confirmedScopes: (ProjectScope & { scope_types: { name: string } | null })[];
  suggestions: ProjectScopeSuggestion[];
  discovery: DiscoveryResult | null;
  scopeGroups: ScopeGroupInput[];
  scopeQuestions: ScopeQuestionWithAnswers[];
  declinedConstraintSlugs: string[];
  qualityLevel: string;
  showGreeting: boolean;
}

export function AssistantV2Chat({
  projectId,
  confirmedScopes,
  suggestions,
  discovery,
  scopeGroups,
  scopeQuestions,
  declinedConstraintSlugs,
  qualityLevel,
  showGreeting,
}: AssistantV2ChatProps) {
  const router = useRouter();
  const { markUpdating, markSaved } = useEstimateUpdate();
  const [acceptPending, startAccept] = useTransition();
  const {
    allMessages,
    submitScopeAnswer,
    flushScopeBatch,
    submitConstraintBatch,
    submitQualityLevel,
    optimisticAnswers,
    workAreas,
    optimisticConstraintSlugs,
    optimisticQualityLevel,
    flushInFlight,
  } = useAssistantChat();

  const workAreaTypeKeys = useMemo(
    () =>
      confirmedScopes.map((scope) =>
        resolveWorkAreaTypeKey(scope.scope_types?.name, scope.name)
      ),
    [confirmedScopes]
  );

  const mergedAnswers = useMemo(() => {
    const merged = collectAnsweredQuestionKeys(scopeQuestions);
    for (const key of Object.keys(optimisticAnswers)) {
      merged.add(key);
    }
    return merged;
  }, [scopeQuestions, optimisticAnswers]);

  const activeQuality = normaliseQualityLevel(
    optimisticQualityLevel ?? qualityLevel
  );

  const nextTurn = useMemo(
    () =>
      getNextAssistantTurn({
        scopeGroups,
        workAreaTypeKeys,
        discovery,
        scopeQuestions,
        selectedConstraintSlugs: optimisticConstraintSlugs,
        declinedConstraintSlugs: new Set(declinedConstraintSlugs),
        qualityLevel: activeQuality,
        answeredQuestionKeys: mergedAnswers,
      }),
    [
      scopeGroups,
      workAreaTypeKeys,
      discovery,
      scopeQuestions,
      optimisticConstraintSlugs,
      declinedConstraintSlugs,
      activeQuality,
      mergedAnswers,
    ]
  );

  const completenessPercent = useMemo(
    () => computeProjectCompleteness(workAreas),
    [workAreas]
  );

  const pendingSuggestions = suggestions.filter((s) => s.status === "pending");

  function acceptSuggestion(suggestionId: string) {
    startAccept(async () => {
      markUpdating();
      await acceptScopeSuggestion(projectId, suggestionId);
      router.refresh();
      markSaved();
    });
  }

  return (
    <AssistantConversationPanel>
      {showGreeting && (
        <AssistantBubble>
          <p className="font-medium">Hi — tell me about the job.</p>
          <p className="mt-1 text-muted-foreground">
            Describe the work in your own words. I&apos;ll find the scope, ask
            only what matters, and build a draft estimate.
          </p>
        </AssistantBubble>
      )}

      {allMessages.map((message) => (
        <div key={message.id}>
          {message.role === "user" ? (
            <UserBubble>
              {message.content}
              {message.error && (
                <p className="mt-1 text-xs text-primary-foreground/80">
                  {message.error}
                </p>
              )}
            </UserBubble>
          ) : (
            <AssistantBubble>
              {message.content}
              {message.pending && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Recalculating…
                </p>
              )}
            </AssistantBubble>
          )}
        </div>
      ))}

      {confirmedScopes.length > 0 && discovery && (
        <AssistantV2UnderstoodCard
          confirmedScopes={confirmedScopes}
          discovery={discovery}
          qualityLevel={qualityLevel}
        />
      )}

      {pendingSuggestions.length > 0 && confirmedScopes.length === 0 && (
        <AssistantBubble>
          <p className="font-medium">I found possible work areas</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Tap to confirm what applies
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {pendingSuggestions.map((s) => (
              <button
                key={s.id}
                type="button"
                disabled={acceptPending}
                onClick={() => acceptSuggestion(s.id)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-muted",
                  acceptPending && "opacity-60"
                )}
              >
                {s.suggested_name}
              </button>
            ))}
          </div>
        </AssistantBubble>
      )}

      {nextTurn && confirmedScopes.length > 0 && !flushInFlight && (
        <ActiveTurnBubble
          turn={nextTurn}
          optimisticAnswers={optimisticAnswers}
          onScopeAnswer={submitScopeAnswer}
          onScopeBatchComplete={flushScopeBatch}
          onConstraintBatch={submitConstraintBatch}
          onQualityAnswer={(level, label) => submitQualityLevel(level, label)}
        />
      )}

      {!nextTurn && confirmedScopes.length > 0 && discovery && (
        <AssistantBubble>
          <p className="font-medium">Ready to estimate</p>
          <p className="mt-1 text-muted-foreground">
            I have enough to price this at {completenessPercent}% confidence.
            Check the live estimate — add more notes anytime to refine.
          </p>
        </AssistantBubble>
      )}
    </AssistantConversationPanel>
  );
}

function ActiveTurnBubble({
  turn,
  optimisticAnswers,
  onScopeAnswer,
  onScopeBatchComplete,
  onConstraintBatch,
  onQualityAnswer,
}: {
  turn: AssistantTurn;
  optimisticAnswers: Record<string, string>;
  onScopeAnswer: (
    questionId: string,
    questionKey: string,
    answer: string,
    label: string
  ) => void;
  onScopeBatchComplete: (
    answers: {
      questionId: string;
      questionKey: string;
      answer: string;
      label: string;
    }[]
  ) => void;
  onConstraintBatch: (
    selections: { slug: string; label: string; apply: boolean }[]
  ) => void;
  onQualityAnswer: (level: string, label: string) => void;
}) {
  if (turn.kind === "scope_batch") {
    return (
      <ScopeBatchBubble
        intro={turn.intro}
        questions={turn.questions}
        optimisticAnswers={optimisticAnswers}
        onScopeAnswer={onScopeAnswer}
        onBatchComplete={onScopeBatchComplete}
      />
    );
  }

  if (turn.kind === "constraint_batch") {
    return (
      <ConstraintBatchBubble
        constraints={turn.constraints}
        onSubmit={onConstraintBatch}
      />
    );
  }

  if (turn.kind === "quality") {
    return (
      <AssistantBubble>
        <p>{turn.turn.prompt}</p>
        <div className="mt-3">
          <AnswerChips
            options={turn.turn.options.map((o) => ({
              value: o.value,
              label: o.label,
            }))}
            onSelect={(value) => {
              const option = turn.turn.options.find((o) => o.value === value);
              onQualityAnswer(value, option?.label ?? value);
            }}
          />
        </div>
      </AssistantBubble>
    );
  }

  return null;
}

function ScopeBatchBubble({
  intro,
  questions,
  optimisticAnswers,
  onScopeAnswer,
  onBatchComplete,
}: {
  intro: string;
  questions: PricingQuestion[];
  optimisticAnswers: Record<string, string>;
  onScopeAnswer: (
    questionId: string,
    questionKey: string,
    answer: string,
    label: string
  ) => void;
  onBatchComplete: (
    answers: {
      questionId: string;
      questionKey: string;
      answer: string;
      label: string;
    }[]
  ) => void;
}) {
  const [localAnswers, setLocalAnswers] = useState<
    Record<string, { answer: string; label: string }>
  >({});
  const flushedRef = useRef(false);
  const questionIds = questions.map((q) => q.questionId).join(",");

  useEffect(() => {
    flushedRef.current = false;
    setLocalAnswers({});
  }, [questionIds]);

  const merged = useMemo(() => {
    const m: Record<string, { answer: string; label: string }> = {};
    for (const q of questions) {
      const opt = optimisticAnswers[q.questionKey];
      const local = localAnswers[q.questionKey];
      if (local) {
        m[q.questionKey] = local;
      } else if (opt) {
        const label =
          q.options.find((o) => o.value === opt)?.label ?? opt;
        m[q.questionKey] = { answer: opt, label };
      }
    }
    return m;
  }, [questions, optimisticAnswers, localAnswers]);

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
    onBatchComplete(batch);
  }, [allAnswered, questions, merged, onBatchComplete]);

  useEffect(() => {
    if (allAnswered) {
      tryFlush();
    }
  }, [allAnswered, tryFlush]);

  function handleAnswer(
    q: PricingQuestion,
    answer: string,
    label: string
  ) {
    setLocalAnswers((prev) => ({
      ...prev,
      [q.questionKey]: { answer, label },
    }));
    onScopeAnswer(q.questionId, q.questionKey, answer, label);
  }

  return (
    <AssistantBubble>
      <p className="font-medium">{intro}</p>
      <div className="mt-4 space-y-4">
        {questions.map((q) => (
          <ScopeQuestionRow
            key={q.questionId}
            question={q}
            selected={merged[q.questionKey]?.answer ?? ""}
            onAnswer={(answer, label) => handleAnswer(q, answer, label)}
          />
        ))}
      </div>
      {questions.some((q) => q.inputType === "number") && allAnswered && (
        <Button
          type="button"
          size="sm"
          className="mt-4"
          onClick={tryFlush}
        >
          Update estimate
        </Button>
      )}
    </AssistantBubble>
  );
}

function ScopeQuestionRow({
  question: q,
  selected,
  onAnswer,
}: {
  question: PricingQuestion;
  selected: string;
  onAnswer: (answer: string, label: string) => void;
}) {
  const [numberValue, setNumberValue] = useState("");
  const prompt = contextualQuestionText(q);

  return (
    <div>
      <p className="text-sm font-medium">{prompt}</p>
      <div className="mt-2">
        {q.inputType === "select" && q.options.length > 0 ? (
          <AnswerChips
            options={q.options}
            value={selected}
            onSelect={(value) => {
              const label =
                q.options.find((o) => o.value === value)?.label ?? value;
              onAnswer(value, label);
            }}
          />
        ) : q.inputType === "number" ? (
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={0}
              step="any"
              value={numberValue}
              placeholder={q.placeholder}
              className="h-9 max-w-[140px]"
              onChange={(e) => setNumberValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && numberValue.trim()) {
                  const label = q.unit
                    ? `${numberValue.trim()} ${q.unit}`
                    : numberValue.trim();
                  onAnswer(numberValue.trim(), label);
                }
              }}
            />
            {q.unit && (
              <span className="text-xs text-muted-foreground">{q.unit}</span>
            )}
          </div>
        ) : (
          <Input
            type="text"
            placeholder={q.placeholder}
            className="h-9"
            onKeyDown={(e) => {
              const val = (e.target as HTMLInputElement).value;
              if (e.key === "Enter" && val.trim()) {
                onAnswer(val.trim(), val.trim());
              }
            }}
          />
        )}
      </div>
    </div>
  );
}

function ConstraintBatchBubble({
  constraints,
  onSubmit,
}: {
  constraints: { slug: string; label: string; prompt: string }[];
  onSubmit: (
    selections: { slug: string; label: string; apply: boolean }[]
  ) => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitted, setSubmitted] = useState(false);

  function toggle(slug: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  }

  function handleSubmit() {
    if (submitted) return;
    setSubmitted(true);
    const selections = constraints.map((c) => ({
      slug: c.slug,
      label: c.label.replace(/\?$/, ""),
      apply: selected.has(c.slug),
    }));
    onSubmit(selections);
  }

  return (
    <AssistantBubble>
      <p className="font-medium">Any of these apply?</p>
      <div className="mt-3 space-y-2">
        {constraints.map((c) => (
          <label
            key={c.slug}
            className={cn(
              "flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 transition-colors hover:bg-muted/50",
              selected.has(c.slug) && "border-primary bg-primary/5"
            )}
          >
            <input
              type="checkbox"
              checked={selected.has(c.slug)}
              onChange={() => toggle(c.slug)}
              className="h-4 w-4 rounded border-input"
            />
            <span className="text-sm">
              {c.label.replace(/\?$/, "").replace(/^Is /, "")}
            </span>
          </label>
        ))}
      </div>
      <Button
        type="button"
        size="sm"
        className="mt-4"
        disabled={submitted}
        onClick={handleSubmit}
      >
        {submitted ? "Saving…" : "Confirm"}
      </Button>
    </AssistantBubble>
  );
}
