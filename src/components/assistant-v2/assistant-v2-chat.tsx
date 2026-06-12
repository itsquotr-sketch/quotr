"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { persistAssistantQuestionBatch } from "@/actions/assistant-v2";
import type { WorkAreaSelection } from "@/lib/assistant-v2/confirm-work-areas";
import { AnswerChips } from "@/components/assistant-v2/answer-chips";
import { AssistantConversationPanel } from "@/components/assistant-v2/assistant-conversation-panel";
import { useAssistantChat } from "@/components/assistant-v2/assistant-chat-context";
import { AssistantV2UnderstoodCard } from "@/components/assistant-v2/assistant-v2-understood-card";
import { contextualQuestionText } from "@/lib/assistant-v2/build-assistant-messages";
import {
  formatConstraintBatchContent,
  formatScopeBatchContent,
  questionBatchFingerprint,
} from "@/lib/assistant-v2/format-question-batch";
import { parseNaturalLanguageBatchAnswers } from "@/lib/assistant-v2/parse-batch-answers";
import {
  collectAnsweredQuestionKeys,
  getNextAssistantTurn,
  type AssistantTurn,
} from "@/lib/assistant-v2/get-next-assistant-turn";
import type { ScopeGroupInput } from "@/lib/assistant-v2/get-next-pricing-question";
import type { PricingQuestion } from "@/lib/assistant-v2/get-next-pricing-question";
import { normaliseQualityLevel } from "@/lib/constants/quality-level";
import { resolveWorkAreaTypeKey } from "@/lib/project-assistant-questions";
import type { ConstraintQuestion } from "@/lib/assistant-v2/get-next-constraint-question";
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

function LoadingDots() {
  return (
    <span className="ml-1 inline-flex gap-0.5">
      <span className="h-1 w-1 animate-bounce rounded-full bg-muted-foreground [animation-delay:0ms]" />
      <span className="h-1 w-1 animate-bounce rounded-full bg-muted-foreground [animation-delay:150ms]" />
      <span className="h-1 w-1 animate-bounce rounded-full bg-muted-foreground [animation-delay:300ms]" />
    </span>
  );
}

interface AssistantV2ChatProps {
  projectId: string;
  confirmedScopes: (ProjectScope & { scope_types: { name: string } | null })[];
  suggestions: ProjectScopeSuggestion[];
  discovery: DiscoveryResult | null;
  scopeGroups: ScopeGroupInput[];
  scopeQuestions: ScopeQuestionWithAnswers[];
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
  qualityLevel,
  showGreeting,
}: AssistantV2ChatProps) {
  const {
    allMessages,
    persistedMessages,
    submitScopeAnswer,
    flushScopeBatch,
    submitConstraintBatch,
    submitWorkAreaConfirmation,
    submitQualityLevel,
    optimisticAnswers,
    optimisticConstraintSlugs,
    effectiveDeclinedConstraintSlugs,
    optimisticQualityLevel,
    flushInFlight,
    syncAssistant,
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
        declinedConstraintSlugs: new Set(effectiveDeclinedConstraintSlugs),
        qualityLevel: activeQuality,
        answeredQuestionKeys: mergedAnswers,
      }),
    [
      scopeGroups,
      workAreaTypeKeys,
      discovery,
      scopeQuestions,
      optimisticConstraintSlugs,
      effectiveDeclinedConstraintSlugs,
      activeQuality,
      mergedAnswers,
    ]
  );

  const pendingSuggestions = suggestions.filter((s) => s.status === "pending");
  const showWorkAreaConfirmation =
    pendingSuggestions.length > 0 && !flushInFlight;

  const activeTurnFingerprint =
    nextTurn?.kind === "scope_batch"
      ? questionBatchFingerprint(
          "scope",
          nextTurn.questions.map((q) => q.questionId)
        )
      : nextTurn?.kind === "constraint_batch"
        ? questionBatchFingerprint(
            "constraint",
            nextTurn.constraints.map((c) => c.slug)
          )
        : null;

  const showActiveTurn = Boolean(
    nextTurn &&
      confirmedScopes.length > 0 &&
      !flushInFlight &&
      !showWorkAreaConfirmation
  );

  const visibleMessages = useMemo(() => {
    if (!activeTurnFingerprint) return allMessages;
    return allMessages.filter((message) => {
      const persisted = persistedMessages.find((m) => m.id === message.id);
      if (!persisted) return true;
      const meta = persisted.metadata as Record<string, unknown> | null;
      return meta?.batchFingerprint !== activeTurnFingerprint;
    });
  }, [allMessages, persistedMessages, activeTurnFingerprint]);

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

      {visibleMessages.map((message) => (
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
              <span className="whitespace-pre-wrap">{message.content}</span>
              {message.pending && (
                <p className="mt-1 flex items-center text-xs text-muted-foreground">
                  {message.content.includes("Analysing")
                    ? "Analysing project"
                    : message.content.includes("Saving site")
                      ? "Saving site conditions"
                      : message.content.includes("Updating")
                        ? "Updating estimate"
                        : "Working"}
                  <LoadingDots />
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

      {showWorkAreaConfirmation && (
        <WorkAreaConfirmationBubble
          suggestions={pendingSuggestions}
          onConfirm={submitWorkAreaConfirmation}
        />
      )}

      {showActiveTurn && nextTurn && (
        <ActiveTurnBubble
          projectId={projectId}
          turn={nextTurn}
          optimisticAnswers={optimisticAnswers}
          onScopeAnswer={submitScopeAnswer}
          onScopeBatchComplete={flushScopeBatch}
          onConstraintBatch={submitConstraintBatch}
          onQualityAnswer={(level, label) => submitQualityLevel(level, label)}
          onPersisted={syncAssistant}
        />
      )}

      {!nextTurn && confirmedScopes.length > 0 && discovery && (
        <AssistantBubble>
          <p className="font-medium">That&apos;s enough to work with</p>
          <p className="mt-1 text-muted-foreground">
            Check the live estimate on the right — add more notes anytime to
            refine.
          </p>
        </AssistantBubble>
      )}
    </AssistantConversationPanel>
  );
}

function ActiveTurnBubble({
  projectId,
  turn,
  optimisticAnswers,
  onScopeAnswer,
  onScopeBatchComplete,
  onConstraintBatch,
  onQualityAnswer,
  onPersisted,
}: {
  projectId: string;
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
  onPersisted: () => Promise<void>;
}) {
  useEffect(() => {
    async function persistTurn() {
      if (turn.kind === "scope_batch") {
        const content = formatScopeBatchContent(turn.intro, turn.questions);
        const fingerprint = questionBatchFingerprint(
          "scope",
          turn.questions.map((q) => q.questionId)
        );
        await persistAssistantQuestionBatch(projectId, content, fingerprint, {
          kind: "scope_batch",
          questionIds: turn.questions.map((q) => q.questionId),
        });
        await onPersisted();
        return;
      }

      if (turn.kind === "constraint_batch") {
        const content = formatConstraintBatchContent(turn.constraints);
        const fingerprint = questionBatchFingerprint(
          "constraint",
          turn.constraints.map((c) => c.slug)
        );
        await persistAssistantQuestionBatch(projectId, content, fingerprint, {
          kind: "constraint_batch",
          constraintSlugs: turn.constraints.map((c) => c.slug),
        });
        await onPersisted();
      }
    }

    void persistTurn();
  }, [projectId, turn, onPersisted]);

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

  const [naturalAnswer, setNaturalAnswer] = useState("");

  function handleNaturalSubmit() {
    const parsed = parseNaturalLanguageBatchAnswers(naturalAnswer, questions);
    if (parsed.length === 0) return;

    for (const item of parsed) {
      onScopeAnswer(
        item.questionId,
        item.questionKey,
        item.answer,
        item.label
      );
    }

    if (parsed.length === questions.length) {
      onBatchComplete(parsed);
    }
    setNaturalAnswer("");
  }

  return (
    <AssistantBubble>
      <p className="font-medium whitespace-pre-wrap">
        {intro}
        {questions.length > 1 && (
          <>
            {"\n"}
            {questions
              .map((q, i) => `${i + 1}. ${contextualQuestionText(q)}`)
              .join("\n")}
          </>
        )}
      </p>
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
      {questions.length > 1 && (
        <div className="mt-4 space-y-2 border-t pt-3">
          <p className="text-xs text-muted-foreground">
            Or answer in one line — e.g. 40sqm, elevated, timber
          </p>
          <div className="flex gap-2">
            <Input
              value={naturalAnswer}
              onChange={(e) => setNaturalAnswer(e.target.value)}
              placeholder="Type your answers…"
              className="h-9"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleNaturalSubmit();
              }}
            />
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={handleNaturalSubmit}
              disabled={!naturalAnswer.trim()}
            >
              Send
            </Button>
          </div>
        </div>
      )}

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

type WorkAreaSuggestionState = "suggested" | "confirmed" | "excluded";

function WorkAreaConfirmationBubble({
  suggestions,
  onConfirm,
}: {
  suggestions: ProjectScopeSuggestion[];
  onConfirm: (selections: WorkAreaSelection[]) => void;
}) {
  const { flushInFlight } = useAssistantChat();
  const [states, setStates] = useState<Record<string, WorkAreaSuggestionState>>(
    () =>
      Object.fromEntries(
        suggestions.map((s) => [s.id, "suggested" as WorkAreaSuggestionState])
      )
  );
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const suggestionIds = suggestions.map((s) => s.id).join(",");

  useEffect(() => {
    setStates(
      Object.fromEntries(
        suggestions.map((s) => [s.id, "suggested" as WorkAreaSuggestionState])
      )
    );
    setSubmitted(false);
    setError(null);
  }, [suggestionIds, suggestions]);

  useEffect(() => {
    if (!flushInFlight) {
      setSubmitted(false);
    }
  }, [flushInFlight]);

  function setState(id: string, state: WorkAreaSuggestionState) {
    setStates((prev) => ({ ...prev, [id]: state }));
  }

  function handleConfirm() {
    if (submitted) return;

    const unresolved = suggestions.some(
      (s) => states[s.id] === "suggested"
    );
    if (unresolved) {
      setError("Choose include or exclude for each work area.");
      return;
    }

    setSubmitted(true);
    setError(null);
    onConfirm(
      suggestions.map((s) => ({
        suggestionId: s.id,
        included: states[s.id] === "confirmed",
      }))
    );
  }

  return (
    <AssistantBubble>
      <p className="font-medium">
        I found these work areas. Confirm what should be included in this
        estimate.
      </p>
      <div className="mt-3 space-y-2">
        {suggestions.map((s) => {
          const state = states[s.id] ?? "suggested";
          return (
            <div
              key={s.id}
              className={cn(
                "rounded-lg border px-3 py-2",
                state === "confirmed" && "border-primary bg-primary/5",
                state === "excluded" && "opacity-70"
              )}
            >
              <p className="text-sm font-medium">{s.suggested_name}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={state === "confirmed" ? "default" : "outline"}
                  disabled={submitted}
                  onClick={() => setState(s.id, "confirmed")}
                >
                  Include
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={state === "excluded" ? "secondary" : "outline"}
                  disabled={submitted}
                  onClick={() => setState(s.id, "excluded")}
                >
                  Exclude
                </Button>
              </div>
              <p className="mt-1.5 text-[10px] text-muted-foreground">
                {state === "confirmed"
                  ? "Included in estimate"
                  : state === "excluded"
                    ? "Excluded for now"
                    : "Choose include or exclude"}
              </p>
            </div>
          );
        })}
      </div>
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
      <Button
        type="button"
        size="sm"
        className="mt-4"
        disabled={submitted}
        onClick={handleConfirm}
      >
        {submitted ? "Saving…" : "Confirm work areas"}
      </Button>
    </AssistantBubble>
  );
}

function ConstraintBatchBubble({
  constraints,
  onSubmit,
}: {
  constraints: ConstraintQuestion[];
  onSubmit: (
    selections: { slug: string; label: string; apply: boolean }[]
  ) => void;
}) {
  const { flushInFlight } = useAssistantChat();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const saving = submitted && flushInFlight;

  useEffect(() => {
    if (!flushInFlight) {
      setSubmitted(false);
    }
  }, [flushInFlight]);

  function toggle(slug: string) {
    if (submitted) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  }

  function buildSelections(applyAll: boolean) {
    return constraints.map((c) => ({
      slug: c.slug,
      label: c.label.replace(/\?$/, ""),
      apply: applyAll ? false : selected.has(c.slug),
    }));
  }

  function handleSubmit() {
    if (submitted) return;
    setSubmitted(true);
    setError(null);
    onSubmit(buildSelections(false));
  }

  function handleNoneApply() {
    if (submitted) return;
    setSubmitted(true);
    setError(null);
    onSubmit(buildSelections(true));
  }

  return (
    <AssistantBubble>
      <p className="font-medium whitespace-pre-wrap">
        {formatConstraintBatchContent(constraints)}
      </p>
      {saving && (
        <p className="mt-2 flex items-center text-xs text-muted-foreground">
          Saving site conditions…
          <LoadingDots />
        </p>
      )}
      <div className="mt-3 space-y-2">
        {constraints.map((c) => (
          <label
            key={c.slug}
            className={cn(
              "flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 transition-colors hover:bg-muted/50",
              selected.has(c.slug) && "border-primary bg-primary/5",
              submitted && "pointer-events-none opacity-70"
            )}
          >
            <input
              type="checkbox"
              checked={selected.has(c.slug)}
              onChange={() => toggle(c.slug)}
              disabled={submitted}
              className="h-4 w-4 rounded border-input"
            />
            <span className="text-sm">
              {c.label.replace(/\?$/, "").replace(/^Is /, "")}
            </span>
          </label>
        ))}
      </div>
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          disabled={submitted}
          onClick={handleSubmit}
        >
          {saving ? "Saving…" : "Confirm"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={submitted}
          onClick={handleNoneApply}
        >
          {saving ? "Saving…" : "None of these apply"}
        </Button>
      </div>
    </AssistantBubble>
  );
}
