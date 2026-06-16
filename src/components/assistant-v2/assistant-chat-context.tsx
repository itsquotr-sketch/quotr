"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type Dispatch,
  type SetStateAction,
} from "react";
import {
  autoSaveQualityLevel,
  batchSaveAssistantConstraintAnswers,
  commitAssistantAnswerBatch,
  confirmAssistantWorkAreas,
  reopenSiteConditions,
  submitAssistantNotes,
  syncAssistantState,
  type AssistantSyncPayload,
} from "@/actions/assistant-v2";
import {
  mergeSyncRequests,
  syncKindsToLoader,
  type AssistantSyncKind,
  type SyncRequest,
} from "@/lib/assistant-v2/assistant-sync-queue";
import type { WorkAreaSelection } from "@/lib/assistant-v2/confirm-work-areas";
import { useEstimateUpdate } from "@/components/projects/estimate-update-context";
import { TRUST_COPY } from "@/lib/assistant-v2/trust-messages";
import type { AssistantMessageRow } from "@/lib/assistant-v2/assistant-messages-data";
import type { WorkAreaCompletenessInput } from "@/lib/assistant-v2/compute-information-completeness";
import { computeProjectCompleteness } from "@/lib/assistant-v2/compute-information-completeness";
import { collectAnsweredQuestionKeys } from "@/lib/assistant-v2/get-next-assistant-turn";
import { normalizeQuestionKey } from "@/lib/question-keys";
import type { EstimateChangeEvent } from "@/lib/cost-engine/recalculate-quick-estimate";
import { parseQuickEstimateSummary } from "@/lib/project-assistant-summary";

export type OptimisticMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  pending?: boolean;
  error?: string;
  createdAt?: string;
  sequenceIndex?: number;
};

const SCOPE_SAVE_TIMEOUT_MS = 30_000;
const DEFAULT_ANSWER_TIMEOUT_MS = 15_000;

function resolvePendingAssistantMessages(
  setOptimisticMessages: Dispatch<SetStateAction<OptimisticMessage[]>>,
  outcome: "success" | "error" | "unchanged",
  errorMessage?: string
): void {
  setOptimisticMessages((prev) => {
    const hasPending = prev.some((m) => m.pending);
    if (!hasPending) return prev;

    if (outcome === "success") return [];

    const finalContent =
      outcome === "unchanged"
        ? "No estimate change needed."
        : errorMessage ?? "Answers saved. Estimate refresh needs retry.";

    return prev.map((m) =>
      m.pending
        ? {
            ...m,
            pending: false,
            content: finalContent,
            error: outcome === "error" ? finalContent : undefined,
          }
        : m
    );
  });
}

type ScopeAnswerItem = {
  questionId: string;
  questionKey: string;
  scopeId: string;
  answer: string;
  label: string;
};

type ConstraintSelection = {
  slug: string;
  label: string;
  apply: boolean;
};

type AssistantChatContextValue = {
  persistedMessages: AssistantMessageRow[];
  optimisticMessages: OptimisticMessage[];
  allMessages: OptimisticMessage[];
  optimisticAnswers: Record<string, string>;
  optimisticConstraintSlugs: string[];
  effectiveDeclinedConstraintSlugs: string[];
  optimisticQualityLevel: string | null;
  workAreas: WorkAreaCompletenessInput[];
  setWorkAreas: (areas: WorkAreaCompletenessInput[]) => void;
  submitScopeAnswer: (
    questionId: string,
    questionKey: string,
    scopeId: string,
    answer: string,
    label: string
  ) => void;
  flushScopeBatch: (answers: ScopeAnswerItem[]) => void;
  submitConstraintBatch: (selections: ConstraintSelection[]) => void;
  submitWorkAreaConfirmation: (selections: WorkAreaSelection[]) => void;
  editSiteConditions: () => Promise<void>;
  submitQualityLevel: (level: string, label: string) => void;
  submitChatMessage: (content: string) => Promise<void>;
  prefillComposer: (text: string) => void;
  composerPrefill: string | null;
  addOptimisticUserMessage: (content: string) => string;
  addOptimisticAssistantMessage: (content: string) => void;
  resolveOptimisticMessage: (id: string, error?: string) => void;
  flushInFlight: boolean;
  resolvedSuggestionIds: Set<string>;
  syncAssistant: () => Promise<void>;
  syncByKinds: (
    kinds: AssistantSyncKind[],
    scopeId?: string
  ) => Promise<AssistantSyncPayload | null>;
  mergePersistedMessages: (messages: AssistantMessageRow[]) => void;
  clearOptimisticMessages: () => void;
};

const AssistantChatContext = createContext<AssistantChatContextValue | null>(
  null
);

export function AssistantChatProvider({
  projectId,
  persistedMessages: initialMessages,
  initialWorkAreas,
  selectedConstraintSlugs,
  initialDeclinedConstraintSlugs,
  initialQualityLevel,
  onSync,
  children,
}: {
  projectId: string;
  persistedMessages: AssistantMessageRow[];
  initialWorkAreas: WorkAreaCompletenessInput[];
  selectedConstraintSlugs: string[];
  initialDeclinedConstraintSlugs: string[];
  initialQualityLevel: string;
  onSync?: (payload: AssistantSyncPayload, syncVersion?: number) => void;
  children: ReactNode;
}) {
  const {
    markSaving,
    markUpdating,
    markSaved,
    markIdle,
    setPendingAction,
    beginSync,
    isSyncCurrent,
    requestBreakdownOpen,
    requestWhyOpen,
  } = useEstimateUpdate();
  const [persistedMessages, setPersistedMessages] =
    useState<AssistantMessageRow[]>(initialMessages);
  const [optimisticMessages, setOptimisticMessages] = useState<
    OptimisticMessage[]
  >([]);
  const [optimisticAnswers, setOptimisticAnswers] = useState<
    Record<string, string>
  >({});
  const [optimisticConstraintSlugs, setOptimisticConstraintSlugs] = useState(
    selectedConstraintSlugs
  );
  const [declinedConstraintSlugs, setDeclinedConstraintSlugs] = useState(
    initialDeclinedConstraintSlugs
  );
  const [optimisticDeclinedSlugs, setOptimisticDeclinedSlugs] = useState<
    string[]
  >([]);
  const [optimisticQualityLevel, setOptimisticQualityLevel] = useState<
    string | null
  >(initialQualityLevel);
  const [composerPrefill, setComposerPrefill] = useState<string | null>(null);
  const [workAreas, setWorkAreas] =
    useState<WorkAreaCompletenessInput[]>(initialWorkAreas);
  const [flushInFlight, setFlushInFlight] = useState(false);
  const [resolvedSuggestionIds, setResolvedSuggestionIds] = useState<
    Set<string>
  >(new Set());

  const flushInFlightRef = useRef(false);
  const loadingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scopeSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncQueueRef = useRef<SyncRequest | null>(null);
  const syncProcessingRef = useRef(false);

  const clearLoadingTimeout = useCallback(() => {
    if (loadingTimeoutRef.current) {
      clearTimeout(loadingTimeoutRef.current);
      loadingTimeoutRef.current = null;
    }
  }, []);

  const clearScopeSaveTimeout = useCallback(() => {
    if (scopeSaveTimeoutRef.current) {
      clearTimeout(scopeSaveTimeoutRef.current);
      scopeSaveTimeoutRef.current = null;
    }
  }, []);

  const startLoadingTimeout = useCallback(
    (
      errorMessage = "Answers saved. Estimate refresh needs retry.",
      timeoutMs = DEFAULT_ANSWER_TIMEOUT_MS
    ) => {
      clearLoadingTimeout();
      loadingTimeoutRef.current = setTimeout(() => {
        resolvePendingAssistantMessages(
          setOptimisticMessages,
          "error",
          errorMessage
        );
        markIdle();
        flushInFlightRef.current = false;
        setFlushInFlight(false);
      }, timeoutMs);
    },
    [clearLoadingTimeout, markIdle]
  );

  useEffect(() => {
    setPersistedMessages(initialMessages);
  }, [initialMessages]);

  useEffect(() => {
    if (flushInFlightRef.current) return;
    setWorkAreas(initialWorkAreas);
  }, [initialWorkAreas]);

  useEffect(() => {
    if (flushInFlightRef.current) return;
    setOptimisticQualityLevel(initialQualityLevel);
  }, [initialQualityLevel]);

  useEffect(() => {
    setDeclinedConstraintSlugs(initialDeclinedConstraintSlugs);
    setOptimisticDeclinedSlugs([]);
  }, [initialDeclinedConstraintSlugs]);

  useEffect(() => {
    setOptimisticConstraintSlugs(selectedConstraintSlugs);
  }, [selectedConstraintSlugs]);

  const effectiveDeclinedConstraintSlugs = useMemo(
    () => [...new Set([...declinedConstraintSlugs, ...optimisticDeclinedSlugs])],
    [declinedConstraintSlugs, optimisticDeclinedSlugs]
  );

  const mergePersistedMessages = useCallback((messages: AssistantMessageRow[]) => {
    setPersistedMessages(messages);
  }, []);

  const clearOptimisticMessages = useCallback(() => {
    setOptimisticMessages([]);
  }, []);

  const applySyncPayload = useCallback(
    (payload: AssistantSyncPayload, syncVersion?: number) => {
      if (syncVersion !== undefined && !isSyncCurrent(syncVersion)) {
        return false;
      }
      if (payload.chatMessages) {
        setPersistedMessages(payload.chatMessages);
      }
      onSync?.(payload, syncVersion);

      if (payload.scopeQuestions) {
        const confirmed = collectAnsweredQuestionKeys(payload.scopeQuestions);
        setOptimisticAnswers((prev) => {
          if (Object.keys(prev).length === 0) return prev;
          const next = { ...prev };
          for (const key of Object.keys(next)) {
            const normalized = normalizeQuestionKey(key);
            if (
              confirmed.has(key) ||
              (normalized != null && confirmed.has(normalized))
            ) {
              delete next[key];
            }
          }
          return next;
        });
      }

      return true;
    },
    [onSync, isSyncCurrent]
  );

  const enqueueSync = useCallback(
    async (
      request: SyncRequest
    ): Promise<AssistantSyncPayload | null> => {
      syncQueueRef.current = mergeSyncRequests(syncQueueRef.current, request);

      if (syncProcessingRef.current) {
        await new Promise<void>((resolve) => {
          const check = () => {
            if (!syncProcessingRef.current) resolve();
            else setTimeout(check, 50);
          };
          check();
        });
      }

      syncProcessingRef.current = true;
      const merged = syncQueueRef.current;
      syncQueueRef.current = null;
      const syncVersion = beginSync();

      try {
        const kinds = syncKindsToLoader(merged?.kinds ?? request.kinds);
        const result = await syncAssistantState(projectId, {
          kinds,
          scopeId: merged?.scopeId ?? request.scopeId,
        });
        if (result.data && isSyncCurrent(syncVersion)) {
          applySyncPayload(result.data, syncVersion);
          setOptimisticDeclinedSlugs([]);
          return result.data;
        }
        return null;
      } finally {
        syncProcessingRef.current = false;
        if (syncQueueRef.current) {
          const pending = syncQueueRef.current;
          syncQueueRef.current = null;
          return enqueueSync(pending);
        }
      }
    },
    [projectId, applySyncPayload, beginSync, isSyncCurrent]
  );

  const syncByKinds = useCallback(
    async (kinds: AssistantSyncKind[], scopeId?: string) => {
      return enqueueSync({ kinds, scopeId });
    },
    [enqueueSync]
  );

  const syncAssistant = useCallback(async () => {
    const syncVersion = beginSync();
    const result = await syncAssistantState(projectId);
    if (result.data && isSyncCurrent(syncVersion)) {
      applySyncPayload(result.data, syncVersion);
    }
  }, [projectId, applySyncPayload, beginSync, isSyncCurrent]);

  const applyOptimisticScopeAnswers = useCallback(
    (answers: ScopeAnswerItem[]) => {
      const updates: Record<string, string> = {};
      for (const a of answers) {
        updates[a.questionKey] = a.answer;
      }
      setOptimisticAnswers((prev) => ({ ...prev, ...updates }));
      setWorkAreas((prev) =>
        prev.map((area) => ({
          ...area,
          answers: { ...area.answers, ...updates },
        }))
      );
    },
    []
  );

  const rollbackOptimisticScopeAnswers = useCallback(
    (answers: ScopeAnswerItem[]) => {
      const keys = new Set(answers.map((a) => a.questionKey));
      setOptimisticAnswers((prev) => {
        const next = { ...prev };
        for (const key of keys) {
          delete next[key];
        }
        return next;
      });
      setWorkAreas((prev) =>
        prev.map((area) => {
          const nextAnswers = { ...area.answers };
          for (const key of keys) {
            delete nextAnswers[key];
          }
          return { ...area, answers: nextAnswers };
        })
      );
    },
    []
  );

  const applyEstimateChangeFromPayload = useCallback(
    (payload: AssistantSyncPayload, changeLabel: string | null) => {
      const estimate = payload.quickEstimate;
      if (!estimate) {
        markSaved({
          costDelta: null,
          previousCompleteness: null,
          newCompleteness: null,
          changeLabel,
        });
        return;
      }

      const summary = parseQuickEstimateSummary(estimate.notes ?? null);
      const event = summary?.lastEstimateChange as EstimateChangeEvent | null | undefined;

      const costMid =
        estimate?.estimated_cost_low != null &&
        estimate?.estimated_cost_high != null
          ? (Number(estimate.estimated_cost_low) +
              Number(estimate.estimated_cost_high)) /
            2
          : null;

      const prevMid =
        event?.previousLow != null && event?.previousHigh != null
          ? (event.previousLow + event.previousHigh) / 2
          : null;

      markSaved({
        costDelta:
          costMid != null && prevMid != null ? costMid - prevMid : null,
        previousCompleteness: null,
        newCompleteness: null,
        changeLabel: event?.reason ?? changeLabel,
      });
    },
    [markSaved]
  );

  const flushScopeBatch = useCallback(
    async (answers: ScopeAnswerItem[]) => {
      if (answers.length === 0 || flushInFlightRef.current) return;

      flushInFlightRef.current = true;
      setFlushInFlight(true);
      markSaving();
      setPendingAction("saving_answer");

      const prevCompleteness = computeProjectCompleteness(workAreas);
      const userLabel =
        answers.length === 1
          ? answers[0]!.label
          : answers.map((a) => a.label).join(", ");

      const recalcStatusMessage =
        answers.length === 1
          ? "Updated details. Recalculating estimate…"
          : "Updated details. Recalculating estimate…";

      if (process.env.NODE_ENV === "development") {
        console.log("[dev:scopeAnswers.submit.start]", {
          projectId,
          answersCount: answers.length,
          answers: answers.map((a) => ({
            questionId: a.questionId,
            questionKey: a.questionKey,
            scopeId: a.scopeId,
            answer: a.answer,
            label: a.label,
          })),
        });
      }

      setOptimisticMessages((prev) => [
        ...prev,
        {
          id: `batch-user-${Date.now()}`,
          role: "user",
          content: userLabel,
          createdAt: new Date().toISOString(),
          sequenceIndex: Date.now(),
        },
        {
          id: `batch-asst-${Date.now()}`,
          role: "assistant",
          content: recalcStatusMessage,
          pending: true,
          createdAt: new Date(Date.now() + 1).toISOString(),
          sequenceIndex: Date.now() + 1,
        },
      ]);

      applyOptimisticScopeAnswers(answers);
      markUpdating();
      setPendingAction("updating_estimate");
      startLoadingTimeout();

      let estimateStatusSettled = false;

      try {
        const firstScopeId = answers[0]?.scopeId;

        const commitResult = await commitAssistantAnswerBatch(
          projectId,
          answers,
          { projectScopeId: firstScopeId }
        );

        clearLoadingTimeout();

        if (process.env.NODE_ENV === "development") {
          const questionsWithAnswers =
            commitResult.state?.scopeQuestions.filter(
              (q) => q.scope_answers?.[0]
            ).length ?? 0;
          console.log("[assistant.commit.result]", {
            success: commitResult.success,
            changed: commitResult.changed,
            scopeQuestionsCount:
              commitResult.state?.scopeQuestions.length ?? 0,
            questionsWithAnswers,
            estimateLow:
              commitResult.state?.quickEstimate?.estimated_cost_low ?? null,
            estimateHigh:
              commitResult.state?.quickEstimate?.estimated_cost_high ?? null,
          });
        }

        if (!commitResult.success) {
          rollbackOptimisticScopeAnswers(answers);
          markIdle();
          resolvePendingAssistantMessages(
            setOptimisticMessages,
            "error",
            commitResult.error ?? "Could not save answers. Try again."
          );
          estimateStatusSettled = true;
          return;
        }

        const estimateUpdated = commitResult.estimateUpdated !== false;
        const statusMessage = estimateUpdated
          ? "Estimate updated."
          : commitResult.userMessage ??
            "Answers saved. Estimate updated with available pricing.";

        resolvePendingAssistantMessages(
          setOptimisticMessages,
          estimateUpdated ? "success" : "error",
          estimateUpdated ? undefined : statusMessage
        );

        if (commitResult.state) {
          const syncPayload: AssistantSyncPayload = {
            scopeQuestions: commitResult.state.scopeQuestions,
            quickEstimate: commitResult.state.quickEstimate,
            chatMessages: commitResult.state.messages,
          };

          applySyncPayload(syncPayload);

          if (process.env.NODE_ENV === "development") {
            console.log("[assistant.commit.stateApplied]", {
              scopeQuestionsCount: commitResult.state.scopeQuestions.length,
              messagesCount: commitResult.state.messages.length,
              estimateLow:
                commitResult.state.quickEstimate?.estimated_cost_low ?? null,
              estimateHigh:
                commitResult.state.quickEstimate?.estimated_cost_high ?? null,
            });
          }

          applyEstimateChangeFromPayload(syncPayload, statusMessage);
        } else {
          markSaved({
            costDelta: null,
            previousCompleteness: prevCompleteness,
            newCompleteness: computeProjectCompleteness(workAreas),
            changeLabel: statusMessage,
          });
        }

        estimateStatusSettled = true;
      } catch {
        clearLoadingTimeout();
        rollbackOptimisticScopeAnswers(answers);
        markIdle();
        resolvePendingAssistantMessages(
          setOptimisticMessages,
          "error",
          "Could not save answers. Try again."
        );
        estimateStatusSettled = true;
      } finally {
        clearLoadingTimeout();
        flushInFlightRef.current = false;
        setFlushInFlight(false);
        if (!estimateStatusSettled) {
          markIdle();
        }
      }
    },
    [
      projectId,
      markSaving,
      markUpdating,
      markSaved,
      markIdle,
      workAreas,
      applyOptimisticScopeAnswers,
      rollbackOptimisticScopeAnswers,
      applyEstimateChangeFromPayload,
      applySyncPayload,
      startLoadingTimeout,
      clearLoadingTimeout,
      setPendingAction,
    ]
  );

  const submitConstraintBatch = useCallback(
    async (selections: ConstraintSelection[]) => {
      if (selections.length === 0 || flushInFlightRef.current) return;

      flushInFlightRef.current = true;
      setFlushInFlight(true);
      markSaving();
      setPendingAction("toggling_constraints");

      const applied = selections.filter((s) => s.apply);
      const userText =
        applied.length > 0
          ? applied.map((s) => s.label).join(", ")
          : "None of these apply.";

      setOptimisticMessages((prev) => [
        ...prev,
        { id: `c-batch-user-${Date.now()}`, role: "user", content: userText },
        {
          id: `c-batch-asst-${Date.now()}`,
          role: "assistant",
          content: TRUST_COPY.savingConstraints,
          pending: true,
        },
      ]);

      for (const s of applied) {
        setOptimisticConstraintSlugs((prev) =>
          prev.includes(s.slug) ? prev : [...prev, s.slug]
        );
      }

      const declinedSlugs = selections.filter((s) => !s.apply).map((s) => s.slug);
      setOptimisticDeclinedSlugs((prev) => [
        ...new Set([...prev, ...declinedSlugs]),
      ]);

      markUpdating();
      startLoadingTimeout();

      try {
        const result = await batchSaveAssistantConstraintAnswers(
          projectId,
          selections
        );
        if (result.error) throw new Error(result.error);

        clearLoadingTimeout();
        resolvePendingAssistantMessages(setOptimisticMessages, "success");

        const syncPayload = await syncByKinds([
          "constraints",
          "estimate",
          "messages",
        ]);
        if (syncPayload) {
          applyEstimateChangeFromPayload(
            syncPayload,
            applied.length > 0
              ? "Site conditions saved. Estimate refreshed."
              : "Site conditions confirmed."
          );
        } else {
          markSaved({
            costDelta: null,
            previousCompleteness: null,
            newCompleteness: null,
            changeLabel:
              applied.length > 0
                ? `after adding ${applied.length} constraint${applied.length > 1 ? "s" : ""}`
                : "site conditions confirmed",
          });
        }
      } catch {
        clearLoadingTimeout();
        markIdle();
        setOptimisticDeclinedSlugs((prev) =>
          prev.filter((slug) => !declinedSlugs.includes(slug))
        );
        for (const s of applied) {
          setOptimisticConstraintSlugs((prev) =>
            prev.filter((slug) => slug !== s.slug)
          );
        }
        resolvePendingAssistantMessages(
          setOptimisticMessages,
          "error",
          "Could not save site conditions. Try again."
        );
      } finally {
        clearLoadingTimeout();
        flushInFlightRef.current = false;
        setFlushInFlight(false);
      }
    },
    [
      projectId,
      markSaving,
      markUpdating,
      markSaved,
      markIdle,
      applyEstimateChangeFromPayload,
      startLoadingTimeout,
      clearLoadingTimeout,
      syncByKinds,
      setPendingAction,
    ]
  );

  const submitWorkAreaConfirmation = useCallback(
    async (selections: WorkAreaSelection[]) => {
      if (selections.length === 0 || flushInFlightRef.current) return;

      const selectionIds = selections.map((s) => s.suggestionId);
      setResolvedSuggestionIds((prev) => new Set([...prev, ...selectionIds]));

      flushInFlightRef.current = true;
      setFlushInFlight(true);
      markSaving();
      setPendingAction("adding_work_area");

      setOptimisticMessages((prev) => [
        ...prev,
        {
          id: `wa-user-${Date.now()}`,
          role: "user",
          content: "Confirming work areas…",
        },
        {
          id: `wa-asst-${Date.now()}`,
          role: "assistant",
          content: "Saving work areas…",
          pending: true,
        },
      ]);

      scopeSaveTimeoutRef.current = setTimeout(() => {
        resolvePendingAssistantMessages(
          setOptimisticMessages,
          "error",
          "Work area save timed out. Try again."
        );
        markIdle();
        flushInFlightRef.current = false;
        setFlushInFlight(false);
      }, SCOPE_SAVE_TIMEOUT_MS);

      let scopeSaved = false;

      try {
        const result = await confirmAssistantWorkAreas(projectId, selections);
        if (result.error) throw new Error(result.error);

        scopeSaved = true;
        clearScopeSaveTimeout();

        markSaved({
          costDelta: null,
          previousCompleteness: null,
          newCompleteness: null,
          changeLabel: "work areas confirmed",
        });

        resolvePendingAssistantMessages(setOptimisticMessages, "success");
        const syncPayload = await syncByKinds([
          "scopes",
          "answers",
          "messages",
          "estimate",
        ]);
        if (syncPayload) {
          applyEstimateChangeFromPayload(syncPayload, "Work areas confirmed.");
        }
      } catch {
        clearScopeSaveTimeout();
        if (!scopeSaved) {
          setResolvedSuggestionIds((prev) => {
            const next = new Set(prev);
            for (const id of selectionIds) next.delete(id);
            return next;
          });
          markIdle();
          resolvePendingAssistantMessages(
            setOptimisticMessages,
            "error",
            "Could not save work areas. Try again."
          );
        } else {
          resolvePendingAssistantMessages(
            setOptimisticMessages,
            "error",
            "Work areas saved. Estimate refresh needs retry."
          );
          markSaved({
            costDelta: null,
            previousCompleteness: null,
            newCompleteness: null,
            changeLabel: "work areas saved — estimate needs retry",
          });
        }
      } finally {
        clearScopeSaveTimeout();
        clearLoadingTimeout();
        flushInFlightRef.current = false;
        setFlushInFlight(false);
      }
    },
    [
      projectId,
      markSaving,
      markSaved,
      markIdle,
      applyEstimateChangeFromPayload,
      clearLoadingTimeout,
      clearScopeSaveTimeout,
      syncByKinds,
      setPendingAction,
    ]
  );

  const editSiteConditions = useCallback(async () => {
    if (flushInFlightRef.current) return;

    flushInFlightRef.current = true;
    setFlushInFlight(true);
    markSaving();
    markUpdating();

    try {
      const result = await reopenSiteConditions(projectId);
      if (result.error) throw new Error(result.error);

      setOptimisticConstraintSlugs([]);
      setOptimisticDeclinedSlugs([]);
      setDeclinedConstraintSlugs([]);

      const syncPayload = await syncByKinds([
        "constraints",
        "estimate",
        "messages",
      ]);
      if (syncPayload) {
        applySyncPayload(syncPayload);
      }
      markSaved({
        costDelta: null,
        previousCompleteness: null,
        newCompleteness: null,
        changeLabel: "site conditions reset",
      });
    } catch (error) {
      markIdle();
      throw error;
    } finally {
      flushInFlightRef.current = false;
      setFlushInFlight(false);
    }
  }, [
    projectId,
    markSaving,
    markUpdating,
    markSaved,
    markIdle,
    applySyncPayload,
    syncByKinds,
  ]);

  const submitScopeAnswer = useCallback(
    (
      questionId: string,
      questionKey: string,
      scopeId: string,
      answer: string,
      label: string
    ) => {
      applyOptimisticScopeAnswers([
        { questionId, questionKey, scopeId, answer, label },
      ]);
    },
    [applyOptimisticScopeAnswers]
  );

  const submitQualityLevel = useCallback(
    async (level: string, label: string) => {
      if (flushInFlightRef.current) return;

      flushInFlightRef.current = true;
      setFlushInFlight(true);
      markSaving();
      setPendingAction("changing_finish_level");
      setOptimisticQualityLevel(level);
      setOptimisticMessages((prev) => [
        ...prev,
        {
          id: `q-user-${Date.now()}`,
          role: "user",
          content: label,
        },
        {
          id: `q-asst-${Date.now()}`,
          role: "assistant",
          content: TRUST_COPY.updatingEstimate,
          pending: true,
        },
      ]);

      markUpdating();

      try {
        const result = await autoSaveQualityLevel(
          projectId,
          level as "budget" | "standard" | "premium" | "unknown"
        );
        if (result.error) throw new Error(result.error);

        resolvePendingAssistantMessages(setOptimisticMessages, "success");

        const syncPayload = await syncByKinds(["estimate", "messages"]);
        if (syncPayload) {
          applyEstimateChangeFromPayload(
            syncPayload,
            "Finish level updated. Estimate refreshed."
          );
        } else {
          markSaved({
            costDelta: null,
            previousCompleteness: null,
            newCompleteness: null,
            changeLabel: `finish level → ${label.split(" / ")[0]}`,
          });
        }
      } catch (error) {
        markIdle();
        const message =
          error instanceof Error ? error.message : "Could not save.";
        resolvePendingAssistantMessages(setOptimisticMessages, "error", message);
      } finally {
        flushInFlightRef.current = false;
        setFlushInFlight(false);
      }
    },
    [
      projectId,
      markSaving,
      markUpdating,
      markSaved,
      markIdle,
      applyEstimateChangeFromPayload,
      syncByKinds,
      setPendingAction,
    ]
  );

  const prefillComposer = useCallback((text: string) => {
    setComposerPrefill(text);
    requestAnimationFrame(() => {
      const textarea = document.querySelector<HTMLTextAreaElement>(
        'textarea[name="content"]'
      );
      if (textarea) {
        textarea.value = text;
        textarea.focus();
        textarea.setSelectionRange(text.length, text.length);
      }
    });
  }, []);

  const addOptimisticUserMessage = useCallback((content: string) => {
    const id = `opt-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setOptimisticMessages((prev) => [
      ...prev,
      { id, role: "user", content, pending: true },
    ]);
    return id;
  }, []);

  const addOptimisticAssistantMessage = useCallback((content: string) => {
    setOptimisticMessages((prev) => [
      ...prev,
      { id: `opt-asst-${Date.now()}`, role: "assistant", content, pending: true },
    ]);
  }, []);

  const resolveOptimisticMessage = useCallback((id: string, error?: string) => {
    setOptimisticMessages((prev) =>
      prev.map((m) =>
        m.id === id ? { ...m, pending: false, error: error ?? undefined } : m
      )
    );
  }, []);

  const submitChatMessage = useCallback(
    async (content: string) => {
      const trimmed = content.trim();
      if (!trimmed || flushInFlightRef.current) return;

      const optimisticId = addOptimisticUserMessage(trimmed);
      addOptimisticAssistantMessage("Processing…");
      markSaving();
      markUpdating();
      startLoadingTimeout();

      try {
        const formData = new FormData();
        formData.set("content", trimmed);
        const result = await submitAssistantNotes(projectId, {}, formData);
        if (result.error) {
          resolveOptimisticMessage(optimisticId, result.error);
          markIdle();
          return;
        }
        resolveOptimisticMessage(optimisticId);
        clearLoadingTimeout();
        resolvePendingAssistantMessages(setOptimisticMessages, "success");
        const syncPayload = await syncAssistantState(projectId);
        if (syncPayload.data) {
          applySyncPayload(syncPayload.data);
          applyEstimateChangeFromPayload(syncPayload.data, "Update applied. Estimate refreshed.");
        }
        clearOptimisticMessages();
        if (result.openBreakdown) {
          requestBreakdownOpen();
        }
        if (result.openWhy) {
          requestWhyOpen();
        }
        markSaved({
          costDelta: null,
          previousCompleteness: null,
          newCompleteness: null,
          changeLabel: "after update",
        });
      } catch (error) {
        clearLoadingTimeout();
        markIdle();
        const message =
          error instanceof Error ? error.message : "Could not send message.";
        resolveOptimisticMessage(optimisticId, message);
        resolvePendingAssistantMessages(
          setOptimisticMessages,
          "error",
          "Answers saved. Estimate refresh needs retry."
        );
      }
    },
    [
      projectId,
      addOptimisticUserMessage,
      addOptimisticAssistantMessage,
      resolveOptimisticMessage,
      markSaving,
      markUpdating,
      markSaved,
      markIdle,
      applySyncPayload,
      applyEstimateChangeFromPayload,
      clearOptimisticMessages,
      requestBreakdownOpen,
      requestWhyOpen,
      startLoadingTimeout,
      clearLoadingTimeout,
    ]
  );

  const allMessages = useMemo(() => {
    const persisted = persistedMessages.map((m) => {
      const meta = (m.metadata as Record<string, unknown> | null) ?? {};
      return {
        id: m.id,
        role: m.role as "user" | "assistant",
        content: m.content,
        createdAt: m.created_at,
        sequenceIndex:
          typeof meta.sequenceIndex === "number" ? meta.sequenceIndex : undefined,
      };
    });

    const optimistic = optimisticMessages.map((m, index) => ({
      ...m,
      createdAt: m.createdAt ?? new Date(Date.now() + index).toISOString(),
      sequenceIndex: m.sequenceIndex ?? Date.now() + index,
    }));

    return [...persisted, ...optimistic].sort((a, b) => {
      const seqA = a.sequenceIndex ?? 0;
      const seqB = b.sequenceIndex ?? 0;
      if (seqA !== seqB) return seqA - seqB;
      const timeA = a.createdAt ?? "";
      const timeB = b.createdAt ?? "";
      if (timeA !== timeB) return timeA.localeCompare(timeB);
      return a.id.localeCompare(b.id);
    });
  }, [persistedMessages, optimisticMessages]);

  const value = useMemo(
    () => ({
      persistedMessages,
      optimisticMessages,
      allMessages,
      optimisticAnswers,
      optimisticConstraintSlugs,
      effectiveDeclinedConstraintSlugs,
      optimisticQualityLevel,
      workAreas,
      setWorkAreas,
      submitScopeAnswer,
      flushScopeBatch,
      submitConstraintBatch,
      submitWorkAreaConfirmation,
      editSiteConditions,
      submitQualityLevel,
      submitChatMessage,
      prefillComposer,
      composerPrefill,
      addOptimisticUserMessage,
      addOptimisticAssistantMessage,
      resolveOptimisticMessage,
      flushInFlight,
      resolvedSuggestionIds,
      syncAssistant,
      syncByKinds,
      mergePersistedMessages,
      clearOptimisticMessages,
    }),
    [
      persistedMessages,
      optimisticMessages,
      allMessages,
      optimisticAnswers,
      optimisticConstraintSlugs,
      effectiveDeclinedConstraintSlugs,
      optimisticQualityLevel,
      workAreas,
      submitScopeAnswer,
      flushScopeBatch,
      submitConstraintBatch,
      submitWorkAreaConfirmation,
      editSiteConditions,
      submitQualityLevel,
      submitChatMessage,
      prefillComposer,
      composerPrefill,
      addOptimisticUserMessage,
      addOptimisticAssistantMessage,
      resolveOptimisticMessage,
      flushInFlight,
      resolvedSuggestionIds,
      syncAssistant,
      syncByKinds,
      mergePersistedMessages,
      clearOptimisticMessages,
    ]
  );

  return (
    <AssistantChatContext.Provider value={value}>
      {children}
    </AssistantChatContext.Provider>
  );
}

export function useAssistantChat() {
  const ctx = useContext(AssistantChatContext);
  if (!ctx) {
    throw new Error("useAssistantChat must be used within AssistantChatProvider");
  }
  return ctx;
}
