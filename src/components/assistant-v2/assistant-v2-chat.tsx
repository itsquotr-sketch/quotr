"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { persistAssistantQuestionBatch, confirmAssistantCommand, confirmInternalWorksSelection } from "@/actions/assistant-v2";
import type { WorkAreaSelection } from "@/lib/assistant-v2/confirm-work-areas";
import { AnswerChips } from "@/components/assistant-v2/answer-chips";
import {
  RefinementAnswerBatch,
  RefinementStatusActions,
  SharpeningOptionsActions,
} from "@/components/assistant-v2/assistant-refinement-trigger";
import type { RefinementAnswerQuestion } from "@/lib/assistant-v2/refinement/refinement-batch";
import type { BenchmarkScopeForOnboarding } from "@/components/assistant-v2/scope-rate-onboarding-dialog";
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
import { normalizeQuestionKey } from "@/lib/question-keys";
import type { ScopeGroupInput } from "@/lib/assistant-v2/get-next-pricing-question";
import type { PricingQuestion } from "@/lib/assistant-v2/get-next-pricing-question";
import { countMissingPricingQuestions } from "@/lib/assistant-v2/get-next-pricing-question";
import { normaliseQualityLevel } from "@/lib/constants/quality-level";
import { resolveWorkAreaTypeKey } from "@/lib/project-assistant-questions";
import type { ConstraintQuestion } from "@/lib/assistant-v2/get-next-constraint-question";
import type { ScopeQuestionWithAnswers } from "@/lib/project-assistant-data";
import type { DiscoveryResult } from "@/lib/ai/discovery/types";
import type { ProjectScope, ProjectScopeSuggestion, QuickEstimate } from "@/types/database";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { PendingAssistantCommand } from "@/lib/assistant-v2/intent/types";
import {
  describeCompletenessStatus,
  type ProjectCompletenessResult,
} from "@/lib/assistant-v2/completeness/evaluate-project-completeness";
import { buildMergedAnswersForScope } from "@/lib/assistant-v2/build-merged-answers";
import { resolveAssistantFlowState } from "@/lib/assistant-v2/flow/resolve-assistant-flow-state";
import { useEstimateUpdate } from "@/components/projects/estimate-update-context";
import { isEstimateFailureMessage } from "@/lib/cost-engine/estimate-result";
import { cn } from "@/lib/utils";

function CommandConfirmationActions({
  projectId,
  pendingCommand,
  options,
}: {
  projectId: string;
  pendingCommand: PendingAssistantCommand;
  options?: { id: string; label: string }[];
}) {
  const { syncAssistant } = useAssistantChat();
  const { markUpdating, markSaved, markIdle, requestBreakdownOpen, requestWhyOpen } =
    useEstimateUpdate();
  const [pending, setPending] = useState(false);
  const [resolved, setResolved] = useState(false);

  const confirmOption =
    options?.find((o) => o.id === "confirm") ?? options?.[0];
  const ignoreOption =
    options?.find((o) => o.id === "ignore") ?? options?.[1];

  async function handleConfirm(confirmed: boolean) {
    if (pending || resolved) return;
    setPending(true);
    if (confirmed) markUpdating();

    const result = await confirmAssistantCommand(
      projectId,
      pendingCommand,
      confirmed
    );

    setPending(false);
    setResolved(true);

    if (result.error) {
      markIdle();
      return;
    }

    await syncAssistant();
    if (result.openBreakdown) requestBreakdownOpen();
    if (result.openWhy) requestWhyOpen();
    if (confirmed) {
      markSaved({
        costDelta: null,
        previousCompleteness: null,
        newCompleteness: null,
        changeLabel: "after confirmation",
      });
    } else {
      markIdle();
    }
  }

  if (resolved) return null;

  return (
    <div className="mt-2 flex flex-wrap gap-2 pl-1">
      {confirmOption && (
        <Button
          type="button"
          size="sm"
          disabled={pending}
          onClick={() => void handleConfirm(true)}
        >
          {confirmOption.label}
        </Button>
      )}
      {ignoreOption && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => void handleConfirm(false)}
        >
          {ignoreOption.label}
        </Button>
      )}
    </div>
  );
}

function FallbackOptionsActions({
  options,
  onSelect,
}: {
  options: { id: string; label: string }[];
  onSelect: (label: string) => void;
}) {
  return (
    <div className="mt-2 flex flex-wrap gap-2 pl-1">
      {options.map((option) => (
        <Button
          key={option.id}
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => onSelect(option.label)}
        >
          {option.label}
        </Button>
      ))}
    </div>
  );
}

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
  quickEstimate: QuickEstimate | null;
  sourceNotes?: string;
  projectCompleteness: ProjectCompletenessResult;
  overallUnderstandingScore?: number;
  showGreeting: boolean;
  benchmarkScopesForOnboarding?: BenchmarkScopeForOnboarding[];
}

export function AssistantV2Chat({
  projectId,
  confirmedScopes,
  suggestions,
  discovery,
  scopeGroups,
  scopeQuestions,
  qualityLevel,
  quickEstimate,
  sourceNotes = "",
  projectCompleteness,
  overallUnderstandingScore,
  showGreeting,
  benchmarkScopesForOnboarding = [],
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
    resolvedSuggestionIds,
    syncAssistant,
  } = useAssistantChat();
  const { isActionPending } = useEstimateUpdate();

  const workAreaTypeKeys = useMemo(
    () =>
      confirmedScopes
        .filter((scope) => scope.include_in_quick_estimate !== false)
        .map((scope) =>
          resolveWorkAreaTypeKey(scope.scope_types?.name, scope.name)
        ),
    [confirmedScopes]
  );

  const mergedAnswers = useMemo(() => {
    const merged = collectAnsweredQuestionKeys(scopeQuestions);
    for (const [key, value] of Object.entries(optimisticAnswers)) {
      if (!value) continue;
      merged.add(key);
      const normalized = normalizeQuestionKey(key);
      if (normalized) merged.add(normalized);
    }
    return merged;
  }, [scopeQuestions, optimisticAnswers]);

  const activeQuality = normaliseQualityLevel(
    optimisticQualityLevel ?? qualityLevel
  );

  const hasEstimate = quickEstimate != null;
  const estimateReady =
    hasEstimate &&
    quickEstimate.estimated_cost_low != null &&
    quickEstimate.estimated_cost_high != null &&
    (quickEstimate.estimate_status === "ready" ||
      quickEstimate.estimate_status === "partial");

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
        pendingSuggestionCount: suggestions.filter(
          (s) =>
            s.status === "pending" && !resolvedSuggestionIds.has(s.id)
        ).length,
        hasEstimate,
        estimateReady,
        sourceNotes,
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
      suggestions,
      resolvedSuggestionIds,
      hasEstimate,
      estimateReady,
      sourceNotes,
    ]
  );

  const pendingSuggestions = suggestions.filter(
    (s) => s.status === "pending" && !resolvedSuggestionIds.has(s.id)
  );

  const remainingQuestionCount = useMemo(
    () =>
      countMissingPricingQuestions({
        scopeGroups,
        discovery,
        scopeQuestions,
      }),
    [scopeGroups, discovery, scopeQuestions]
  );
  const showWorkAreaConfirmation = pendingSuggestions.length > 0;

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
        : nextTurn?.kind === "quality"
          ? "quality:spec_level"
          : null;

  const showActiveTurn = Boolean(
    nextTurn &&
      confirmedScopes.length > 0 &&
      !showWorkAreaConfirmation &&
      (!flushInFlight ||
        nextTurn.kind === "quality" ||
        nextTurn.kind === "scope_batch")
  );

  const visibleMessages = useMemo(() => {
    let messages = allMessages;
    if (activeTurnFingerprint) {
      messages = messages.filter((message) => {
        const persisted = persistedMessages.find((m) => m.id === message.id);
        if (!persisted) return true;
        const meta = persisted.metadata as Record<string, unknown> | null;
        return meta?.batchFingerprint !== activeTurnFingerprint;
      });
    }

    return messages.filter(
      (message) =>
        !(
          message.role === "assistant" &&
          isEstimateFailureMessage(message.content, message.error)
        )
    );
  }, [allMessages, persistedMessages, activeTurnFingerprint]);

  const userMessageCount = useMemo(
    () => allMessages.filter((m) => m.role === "user").length,
    [allMessages]
  );

  const flowResult = useMemo(
    () =>
      resolveAssistantFlowState({
        workAreas: scopeGroups.map((group) => ({
          scopeId: group.scopeId,
          scopeName: group.scopeName,
          workAreaTypeKey: resolveWorkAreaTypeKey(
            group.scopeTypeName,
            group.scopeName
          ),
          answers: buildMergedAnswersForScope(
            group.scopeId,
            group.scopeName,
            group.scopeTypeName,
            scopeQuestions,
            discovery
          ),
          included: true,
        })),
        pendingSuggestionCount: pendingSuggestions.length,
        qualityLevel: activeQuality,
        selectedConstraintSlugs: optimisticConstraintSlugs,
        declinedConstraintSlugs: effectiveDeclinedConstraintSlugs,
        discoveryConstraintSlugs: discovery?.constraints?.map((c) => c.slug),
        answeredQuestionKeys: mergedAnswers,
        hasEstimate,
        estimateReady,
        sourceNotes,
      }),
    [
      scopeGroups,
      scopeQuestions,
      discovery,
      activeQuality,
      optimisticConstraintSlugs,
      effectiveDeclinedConstraintSlugs,
      mergedAnswers,
      pendingSuggestions.length,
      hasEstimate,
      estimateReady,
      sourceNotes,
    ]
  );

  const blockingFlowStates = new Set([
    "needs_quality_confirmation",
    "needs_required_scope_details",
    "needs_pricing_source_confirmation",
    "needs_site_conditions",
    "needs_confidence_refinement",
  ]);

  const statusMessage = useMemo(
    () =>
      describeCompletenessStatus(projectCompleteness, {
        flowState: flowResult.state,
        hasUsefulGaps: projectCompleteness.workAreas.some(
          (w) => w.missingUsefulFacts.length > 0
        ),
      }),
    [projectCompleteness, flowResult.state]
  );

  const showRefinementActions =
    flowResult.state === "estimate_ready" &&
    !blockingFlowStates.has(flowResult.state);

  const showDerivedStatus =
    !nextTurn &&
    confirmedScopes.length > 0 &&
    discovery &&
    !showWorkAreaConfirmation &&
    !flushInFlight &&
    activeQuality !== "unknown" &&
    !blockingFlowStates.has(flowResult.state) &&
    (flowResult.state === "estimate_ready" ||
      flowResult.state === "optional_refinement");

  const activeTurnRef = useRef<HTMLDivElement>(null);
  const prevActiveTurnFingerprint = useRef<string | null>(null);

  useEffect(() => {
    if (
      showActiveTurn &&
      activeTurnFingerprint &&
      activeTurnFingerprint !== prevActiveTurnFingerprint.current
    ) {
      prevActiveTurnFingerprint.current = activeTurnFingerprint;
      requestAnimationFrame(() => {
        activeTurnRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
        });
      });
    }
  }, [showActiveTurn, activeTurnFingerprint]);

  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    console.log("[assistant.flow]", {
      pendingSuggestions: pendingSuggestions.length,
      confirmedScopes: confirmedScopes.length,
      qualityLevel: activeQuality,
      nextTurnKind: nextTurn?.kind ?? null,
      showWorkAreaConfirmation,
      showActiveTurn,
      requiredQuestions:
        nextTurn?.kind === "scope_batch" && nextTurn.hasRequired
          ? nextTurn.questions.length
          : 0,
      nextTurnQuestionKeys:
        nextTurn?.kind === "scope_batch"
          ? nextTurn.questions.map((q) => q.questionKey)
          : [],
      answeredKeys: [...mergedAnswers],
    });
  }, [
    pendingSuggestions.length,
    confirmedScopes.length,
    activeQuality,
    nextTurn,
    showWorkAreaConfirmation,
    showActiveTurn,
    mergedAnswers,
  ]);

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

      {visibleMessages.map((message) => {
        const persisted = persistedMessages.find((m) => m.id === message.id);
        const meta = persisted?.metadata as Record<string, unknown> | null;

        return (
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
            <>
              <AssistantBubble>
                <span className="whitespace-pre-wrap">{message.content}</span>
                {message.pending && (
                  <p className="mt-1 flex items-center text-xs text-muted-foreground">
                    {message.content.includes("Processing")
                      ? "Processing"
                      : message.content.includes("Analysing")
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
              {meta?.messageType === "command_confirmation" && (
                <CommandConfirmationActions
                  projectId={projectId}
                  pendingCommand={meta.pendingCommand as PendingAssistantCommand}
                  options={
                    (meta.confirmationOptions as { id: string; label: string }[]) ??
                    undefined
                  }
                />
              )}
              {meta?.messageType === "fallback_options" && (
                <FallbackOptionsActions
                  options={
                    (meta.fallbackOptions as { id: string; label: string }[]) ??
                    []
                  }
                  onSelect={(label) => {
                    const textarea = document.querySelector<HTMLTextAreaElement>(
                      'textarea[name="content"]'
                    );
                    if (textarea) {
                      textarea.value = label;
                      textarea.focus();
                    }
                  }}
                />
              )}
              {((meta?.messageType === "sharpen_options" ||
                meta?.messageType === "refinement_suggestions")) && (
                <SharpeningOptionsActions
                  projectId={projectId}
                  sourceMessageId={persisted?.id}
                  refinementBatchId={
                    meta.refinementBatchId as string | undefined
                  }
                  actionTaken={meta.actionTaken as string | undefined}
                  options={
                    (meta.sharpenOptions as { id: string; label: string }[]) ??
                    undefined
                  }
                  benchmarkScopes={benchmarkScopesForOnboarding}
                />
              )}
              {meta?.messageType === "refinement_answer_batch" && (
                <RefinementAnswerBatch
                  questions={
                    (meta.questions as RefinementAnswerQuestion[]) ?? []
                  }
                />
              )}
              {meta?.messageType === "internal_works_clarification" && (
                <InternalWorksClarificationActions
                  projectId={projectId}
                  projectScopeId={
                    (meta.projectScopeId as string | null) ?? null
                  }
                  broadCategoryKey={
                    (meta.broadCategoryKey as string) ?? "internal_alteration"
                  }
                  options={
                    (meta.options as { key: string; label: string }[]) ?? []
                  }
                  detectedPackages={
                    (meta.detectedPackages as { packageKey: string; label: string }[]) ??
                    []
                  }
                />
              )}
            </>
          )}
        </div>
        );
      })}

      {showWorkAreaConfirmation && (
        <WorkAreaConfirmationBubble
          suggestions={pendingSuggestions}
          onConfirm={submitWorkAreaConfirmation}
        />
      )}

      {showActiveTurn && nextTurn && (
        <div id="assistant-pricing-questions" ref={activeTurnRef}>
          <ActiveTurnBubble
            projectId={projectId}
            turn={nextTurn}
            remainingQuestionCount={remainingQuestionCount}
            optimisticAnswers={optimisticAnswers}
            onScopeAnswer={submitScopeAnswer}
            onScopeBatchComplete={flushScopeBatch}
            onConstraintBatch={submitConstraintBatch}
            onQualityAnswer={(level, label) => submitQualityLevel(level, label)}
            onPersisted={syncAssistant}
            actionsDisabled={flushInFlight || isActionPending("changing_finish_level")}
          />
        </div>
      )}

      {confirmedScopes.length > 0 && discovery && (
        <AssistantV2UnderstoodCard
          confirmedScopes={confirmedScopes}
          discovery={discovery}
          qualityLevel={qualityLevel}
          projectCompleteness={projectCompleteness}
          overallUnderstandingScore={overallUnderstandingScore}
          compact={userMessageCount > 1}
        />
      )}

      {showDerivedStatus && (
        <AssistantBubble>
          <p className="font-medium">{statusMessage.title}</p>
          <p className="mt-1 text-muted-foreground">{statusMessage.subtitle}</p>
          {showRefinementActions && (
            <RefinementStatusActions projectId={projectId} />
          )}
        </AssistantBubble>
      )}
    </AssistantConversationPanel>
  );
}

function ActiveTurnBubble({
  projectId,
  turn,
  remainingQuestionCount,
  optimisticAnswers,
  onScopeAnswer,
  onScopeBatchComplete,
  onConstraintBatch,
  onQualityAnswer,
  onPersisted,
  actionsDisabled = false,
}: {
  projectId: string;
  turn: AssistantTurn;
  remainingQuestionCount: number;
  optimisticAnswers: Record<string, string>;
  onScopeAnswer: (
    questionId: string,
    questionKey: string,
    scopeId: string,
    answer: string,
    label: string
  ) => void;
  onScopeBatchComplete: (
    answers: {
      questionId: string;
      questionKey: string;
      scopeId: string;
      answer: string;
      label: string;
    }[]
  ) => void;
  onConstraintBatch: (
    selections: { slug: string; label: string; apply: boolean }[]
  ) => void;
  onQualityAnswer: (level: string, label: string) => void;
  onPersisted: () => Promise<void>;
  actionsDisabled?: boolean;
}) {
  useEffect(() => {
    async function persistTurn() {
      if (turn.kind === "quality") {
        await persistAssistantQuestionBatch(projectId, turn.turn.prompt, "quality:spec_level", {
          kind: "quality",
        });
        await onPersisted();
        return;
      }

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
        remainingQuestionCount={remainingQuestionCount}
        optimisticAnswers={optimisticAnswers}
        onScopeAnswer={onScopeAnswer}
        onBatchComplete={onScopeBatchComplete}
        actionsDisabled={actionsDisabled}
      />
    );
  }

  if (turn.kind === "constraint_batch") {
    return (
      <ConstraintBatchBubble
        constraints={turn.constraints}
        onSubmit={onConstraintBatch}
        actionsDisabled={actionsDisabled}
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
            disabled={actionsDisabled}
            onSelect={(value) => {
              const option = turn.turn.options.find((o) => o.value === value);
              onQualityAnswer(value, option?.label ?? value);
            }}
          />
        </div>
      </AssistantBubble>
    );
  }

  if (turn.kind === "pricing_source") {
    return (
      <AssistantBubble>
        <p>{turn.turn.message}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {turn.turn.options.map((option) => (
            <Button
              key={option.id}
              type="button"
              variant="outline"
              size="sm"
              disabled={actionsDisabled}
              className="h-8 text-xs"
              onClick={() => {
                const textarea = document.querySelector<HTMLTextAreaElement>(
                  'textarea[name="content"]'
                );
                if (textarea) {
                  textarea.value = option.label;
                  textarea.focus();
                }
              }}
            >
              {option.label}
            </Button>
          ))}
        </div>
      </AssistantBubble>
    );
  }

  return null;
}

function ScopeBatchBubble({
  intro,
  questions,
  remainingQuestionCount,
  optimisticAnswers,
  onScopeAnswer,
  onBatchComplete,
  actionsDisabled = false,
}: {
  intro: string;
  questions: PricingQuestion[];
  remainingQuestionCount: number;
  optimisticAnswers: Record<string, string>;
  onScopeAnswer: (
    questionId: string,
    questionKey: string,
    scopeId: string,
    answer: string,
    label: string
  ) => void;
  onBatchComplete: (
    answers: {
      questionId: string;
      questionKey: string;
      scopeId: string;
      answer: string;
      label: string;
    }[]
  ) => void;
  actionsDisabled?: boolean;
}) {
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

  const questionsByScope = useMemo(() => {
    const groups = new Map<string, PricingQuestion[]>();
    for (const q of questions) {
      const list = groups.get(q.scopeName) ?? [];
      list.push(q);
      groups.set(q.scopeName, list);
    }
    return groups;
  }, [questions]);

  const tryFlush = useCallback(() => {
    if (!allAnswered || flushedRef.current) return;

    const batch = questions.map((q) => {
      const item = merged[q.questionKey]!;
      return {
        questionId: q.questionId,
        questionKey: q.questionKey,
        scopeId: q.scopeId,
        answer: item.answer,
        label: item.label,
      };
    });

    flushedRef.current = true;
    setSubmitted(true);
    onBatchComplete(batch);
  }, [allAnswered, questions, merged, onBatchComplete]);

  function handleAnswer(
    q: PricingQuestion,
    answer: string,
    label: string
  ) {
    setLocalAnswers((prev) => ({
      ...prev,
      [q.questionKey]: { answer, label },
    }));
    onScopeAnswer(q.questionId, q.questionKey, q.scopeId, answer, label);
  }

  const [naturalAnswer, setNaturalAnswer] = useState("");

  function handleNaturalSubmit() {
    const parsed = parseNaturalLanguageBatchAnswers(naturalAnswer, questions);
    if (parsed.length === 0) return;

    for (const item of parsed) {
      onScopeAnswer(
        item.questionId,
        item.questionKey,
        item.scopeId,
        item.answer,
        item.label
      );
    }

    if (parsed.length === questions.length) {
      onBatchComplete(parsed);
    }
    setNaturalAnswer("");
  }

  const scopeName = questions[0]?.scopeName;
  const hasRequired = questions.some((q) => q.required);
  const progressLabel = hasRequired
    ? "Required before pricing."
    : questions.length === 1
      ? "1 question to improve this estimate"
      : `${questions.length} questions to improve this estimate`;
  const progressSubtext = hasRequired
    ? null
    : "These are the highest-impact details. Site conditions come next.";
  const scopeProgressLabel =
    scopeName && questions.length < remainingQuestionCount
      ? `${scopeName}: ${questions.length} of ${remainingQuestionCount} useful details in this batch.`
      : null;

  return (
    <AssistantBubble>
      <p className="text-xs text-muted-foreground">{progressLabel}</p>
      {progressSubtext && (
        <p className="mt-0.5 text-xs text-muted-foreground">{progressSubtext}</p>
      )}
      {scopeProgressLabel && (
        <p className="mt-0.5 text-xs text-muted-foreground">{scopeProgressLabel}</p>
      )}
      {questions.some((q) => !q.required) && (
        <p className="mt-0.5 text-xs text-muted-foreground italic">
          Optional — skip if unsure.
        </p>
      )}
      <p className="mt-2 font-medium whitespace-pre-wrap">
        {intro}
        {questions.length > 1 && (
          <>
            {"\n"}
            {[...questionsByScope.entries()]
              .map(([groupScopeName, scopeQuestions]) =>
                scopeQuestions
                  .map(
                    (q, i) =>
                      `${groupScopeName}\n${i + 1}. ${contextualQuestionText(q)}`
                  )
                  .join("\n")
              )
              .join("\n\n")}
          </>
        )}
      </p>
      <div className="mt-4 space-y-6">
        {[...questionsByScope.entries()].map(([groupScopeName, scopeQuestions]) => (
          <div key={groupScopeName}>
            <p className="text-sm font-semibold text-primary">{groupScopeName}</p>
            <div className="mt-3 space-y-4">
              {scopeQuestions.map((q) => (
                <ScopeQuestionRow
                  key={q.questionId}
                  question={q}
                  selected={merged[q.questionKey]?.answer ?? ""}
                  onAnswer={(answer, label) => handleAnswer(q, answer, label)}
                  disabled={actionsDisabled}
                  showScopeLabel={questionsByScope.size === 1}
                />
              ))}
            </div>
          </div>
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

      <Button
        type="button"
        size="sm"
        className="mt-4"
        disabled={!allAnswered || actionsDisabled || flushedRef.current}
        onClick={tryFlush}
      >
        Submit answers
      </Button>
      {submitted && (
        <p className="mt-2 text-xs text-muted-foreground">Updated.</p>
      )}
    </AssistantBubble>
  );
}

function ScopeQuestionRow({
  question: q,
  selected,
  onAnswer,
  disabled = false,
  showScopeLabel = true,
}: {
  question: PricingQuestion;
  selected: string;
  onAnswer: (answer: string, label: string) => void;
  disabled?: boolean;
  showScopeLabel?: boolean;
}) {
  const [numberValue, setNumberValue] = useState(selected);
  const prompt = contextualQuestionText(q);
  const isPendingNumeric =
    q.inputType === "number" && numberValue.trim() !== "" && !selected;

  useEffect(() => {
    setNumberValue(selected);
  }, [selected, q.questionId]);

  function submitNumeric() {
    if (!numberValue.trim()) return;
    const label = q.unit ? `${numberValue.trim()} ${q.unit}` : numberValue.trim();
    onAnswer(numberValue.trim(), label);
  }

  return (
    <div>
      {showScopeLabel && (
        <p className="text-xs font-semibold text-primary">{q.scopeName}</p>
      )}
      <p className={cn("text-sm font-medium", showScopeLabel && "mt-1")}>{prompt}</p>
      {q.required && !selected && (
        <p className="mt-0.5 text-xs text-amber-700 dark:text-amber-400">
          Needed before pricing properly
        </p>
      )}
      <div className="mt-2">
        {q.inputType === "select" && q.options.length > 0 ? (
          <AnswerChips
            options={q.options}
            value={selected}
            disabled={disabled}
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
              disabled={disabled}
              onChange={(e) => setNumberValue(e.target.value)}
              onBlur={() => {
                if (numberValue.trim()) submitNumeric();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  submitNumeric();
                }
              }}
            />
            {q.unit && (
              <span className="text-xs text-muted-foreground">{q.unit}</span>
            )}
            {isPendingNumeric && (
              <span className="text-xs text-muted-foreground">Pending</span>
            )}
            {selected && (
              <span className="text-xs text-primary">Updated.</span>
            )}
          </div>
        ) : (
          <Input
            type="text"
            placeholder={q.placeholder}
            className="h-9"
            disabled={disabled}
            onKeyDown={(e) => {
              const val = (e.target as HTMLInputElement).value;
              if (e.key === "Enter" && val.trim()) {
                onAnswer(val.trim(), val.trim());
              }
            }}
            onBlur={(e) => {
              const val = e.target.value;
              if (val.trim()) onAnswer(val.trim(), val.trim());
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
  const [states, setStates] = useState<Record<string, WorkAreaSuggestionState>>(
    () =>
      Object.fromEntries(
        suggestions.map((s) => [s.id, "suggested" as WorkAreaSuggestionState])
      )
  );
  const [submitted, setSubmitted] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const suggestionIds = suggestions.map((s) => s.id).join(",");

  useEffect(() => {
    if (dismissed) return;
    setStates(
      Object.fromEntries(
        suggestions.map((s) => [s.id, "suggested" as WorkAreaSuggestionState])
      )
    );
    setSubmitted(false);
    setError(null);
  }, [suggestionIds, suggestions, dismissed]);

  function setState(id: string, state: WorkAreaSuggestionState) {
    setStates((prev) => ({ ...prev, [id]: state }));
  }

  function handleConfirm() {
    if (submitted || dismissed) return;

    const unresolved = suggestions.some(
      (s) => states[s.id] === "suggested"
    );
    if (unresolved) {
      setError("Choose include or exclude for each work area.");
      return;
    }

    setSubmitted(true);
    setDismissed(true);
    setError(null);
    onConfirm(
      suggestions.map((s) => ({
        suggestionId: s.id,
        included: states[s.id] === "confirmed",
      }))
    );
  }

  if (dismissed) return null;

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
        {submitted ? "Saving…" : "Here's what I'll estimate"}
      </Button>
    </AssistantBubble>
  );
}

function ConstraintBatchBubble({
  constraints,
  onSubmit,
  actionsDisabled = false,
}: {
  constraints: ConstraintQuestion[];
  onSubmit: (
    selections: { slug: string; label: string; apply: boolean }[]
  ) => void;
  actionsDisabled?: boolean;
}) {
  const { flushInFlight } = useAssistantChat();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const saving = submitted && flushInFlight;
  const disabled = submitted || actionsDisabled;

  useEffect(() => {
    if (!flushInFlight) {
      setSubmitted(false);
    }
  }, [flushInFlight]);

  function toggle(slug: string) {
    if (disabled) return;
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
    if (disabled) return;
    setSubmitted(true);
    setError(null);
    onSubmit(buildSelections(false));
  }

  function handleNoneApply() {
    if (disabled) return;
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
              disabled && "pointer-events-none opacity-70"
            )}
          >
            <input
              type="checkbox"
              checked={selected.has(c.slug)}
              onChange={() => toggle(c.slug)}
              disabled={disabled}
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

function InternalWorksClarificationActions({
  projectId,
  projectScopeId,
  broadCategoryKey,
  options,
  detectedPackages,
}: {
  projectId: string;
  projectScopeId: string | null;
  broadCategoryKey: string;
  options: { key: string; label: string }[];
  detectedPackages: { packageKey: string; label: string }[];
}) {
  const { syncAssistant } = useAssistantChat();
  const { markUpdating, markSaved } = useEstimateUpdate();
  const [selected, setSelected] = useState<Set<string>>(() => {
    const preselected = new Set(detectedPackages.map((p) => p.packageKey));
    return preselected;
  });
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function handleConfirm(noneApply: boolean) {
    if (submitted || pending) return;
    if (!noneApply && selected.size === 0) {
      setError("Select at least one option, or choose None of these apply.");
      return;
    }

    setPending(true);
    setError(null);
    markUpdating();

    const result = await confirmInternalWorksSelection(projectId, {
      projectScopeId,
      broadCategoryKey,
      selectedPackageKeys: noneApply ? [] : [...selected],
      noneApply,
    });

    setPending(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    setSubmitted(true);
    await syncAssistant();
    markSaved();
  }

  if (submitted) return null;

  return (
    <div id="internal-works-clarification" className="mt-2 pl-1">
      <p className="mb-2 text-sm text-muted-foreground">Which of these apply?</p>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => (
          <Button
            key={opt.key}
            type="button"
            size="sm"
            variant={selected.has(opt.key) ? "default" : "outline"}
            disabled={pending}
            onClick={() => toggle(opt.key)}
          >
            {opt.label}
          </Button>
        ))}
      </div>
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          disabled={pending}
          onClick={() => void handleConfirm(false)}
        >
          Confirm selected
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => void handleConfirm(true)}
        >
          None of these apply
        </Button>
      </div>
    </div>
  );
}
