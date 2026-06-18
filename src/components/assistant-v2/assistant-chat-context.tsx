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
} from "react";
import {
  autoSaveQualityLevel,
  batchSaveAssistantConstraintAnswers,
  batchSaveAssistantScopeAnswers,
  confirmAssistantWorkAreas,
  reopenSiteConditions,
  submitAssistantNotes,
  syncAssistantState,
  type AssistantSyncPayload,
} from "@/actions/assistant-v2";
import type { WorkAreaSelection } from "@/lib/assistant-v2/confirm-work-areas";
import { useEstimateUpdate } from "@/components/projects/estimate-update-context";
import type { AssistantMessageRow } from "@/lib/assistant-v2/assistant-messages-data";
import type { WorkAreaCompletenessInput } from "@/lib/assistant-v2/compute-information-completeness";
import { computeProjectCompleteness } from "@/lib/assistant-v2/compute-information-completeness";
import type { EstimateChangeEvent } from "@/lib/cost-engine/recalculate-quick-estimate";
import { devLog } from "@/lib/dev-log";
import { parseQuickEstimateSummary } from "@/lib/project-assistant-summary";

export type OptimisticMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  pending?: boolean;
  error?: string;
};

type ScopeAnswerItem = {
  questionId: string;
  questionKey: string;
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
  syncAssistant: () => Promise<void>;
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
  onSync?: (payload: AssistantSyncPayload) => void;
  children: ReactNode;
}) {
  const { markSaving, markUpdating, markSaved, markIdle, requestBreakdownOpen } =
    useEstimateUpdate();
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

  const flushInFlightRef = useRef(false);

  useEffect(() => {
    setPersistedMessages(initialMessages);
  }, [initialMessages]);

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
    (payload: AssistantSyncPayload) => {
      setPersistedMessages(payload.chatMessages);
      onSync?.(payload);
    },
    [onSync]
  );

  const syncAssistant = useCallback(async () => {
    const result = await syncAssistantState(projectId);
    if (result.data) {
      applySyncPayload(result.data);
    }
  }, [projectId, applySyncPayload]);

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

  const applyEstimateChangeFromPayload = useCallback(
    (payload: AssistantSyncPayload, changeLabel: string | null) => {
      const summary = parseQuickEstimateSummary(payload.quickEstimate?.notes ?? null);
      const event = summary?.lastEstimateChange as EstimateChangeEvent | null | undefined;
      const estimate = payload.quickEstimate;

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

      const prevCompleteness = computeProjectCompleteness(workAreas);
      const userLabel =
        answers.length === 1
          ? answers[0]!.label
          : answers.map((a) => a.label).join(", ");

      setOptimisticMessages((prev) => [
        ...prev,
        { id: `batch-user-${Date.now()}`, role: "user", content: userLabel },
        {
          id: `batch-asst-${Date.now()}`,
          role: "assistant",
          content: "Saving answers…",
          pending: true,
        },
      ]);

      markUpdating();
      const startedAt = Date.now();

      try {
        const result = await batchSaveAssistantScopeAnswers(projectId, answers);
        if (result.error) throw new Error(result.error);

        setOptimisticMessages((prev) =>
          prev.map((m) =>
            m.pending ? { ...m, content: "Updating estimate…" } : m
          )
        );

        const newCompleteness = computeProjectCompleteness(
          workAreas.map((area) => ({
            ...area,
            answers: {
              ...area.answers,
              ...Object.fromEntries(
                answers.map((a) => [a.questionKey, a.answer])
              ),
            },
          }))
        );

        applyOptimisticScopeAnswers(answers);

        setOptimisticMessages([]);

        const syncResult = await syncAssistantState(projectId);
        if (syncResult.data) {
          applySyncPayload(syncResult.data);
          applyEstimateChangeFromPayload(
            syncResult.data,
            answers.length === 1
              ? `after ${answers[0]!.label.toLowerCase()}`
              : `after updating ${answers.length} details`
          );
        } else {
          markSaved({
            costDelta: null,
            previousCompleteness: prevCompleteness,
            newCompleteness,
            changeLabel:
              answers.length === 1
                ? `after ${answers[0]!.label.toLowerCase()}`
                : `after updating ${answers.length} details`,
          });
        }

        devLog("assistant.batch.timing", {
          projectId,
          answerCount: answers.length,
          msToSave: Date.now() - startedAt,
          recalculateOnce: true,
        });
      } catch (error) {
        markIdle();
        const message =
          error instanceof Error
            ? error.message
            : "Could not save answers. Try again.";
        const displayMessage = message.includes("estimate")
          ? "Answers saved. Estimate needs retry."
          : "Could not save answers. Try again.";
        setOptimisticMessages((prev) =>
          prev.map((m) =>
            m.pending
              ? { ...m, pending: false, content: displayMessage, error: displayMessage }
              : m
          )
        );
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
      workAreas,
      applyOptimisticScopeAnswers,
      applySyncPayload,
      applyEstimateChangeFromPayload,
    ]
  );

  const submitConstraintBatch = useCallback(
    async (selections: ConstraintSelection[]) => {
      if (selections.length === 0 || flushInFlightRef.current) return;

      flushInFlightRef.current = true;
      setFlushInFlight(true);
      markSaving();

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
          content: "Saving site conditions…",
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

      try {
        const result = await batchSaveAssistantConstraintAnswers(
          projectId,
          selections
        );
        if (result.error) throw new Error(result.error);

        setOptimisticMessages([]);

        const syncResult = await syncAssistantState(projectId);
        if (syncResult.data) {
          applySyncPayload(syncResult.data);
          applyEstimateChangeFromPayload(
            syncResult.data,
            applied.length > 0
              ? `after adding ${applied.length} constraint${applied.length > 1 ? "s" : ""}`
              : "site conditions confirmed"
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
      } catch (error) {
        markIdle();
        setOptimisticDeclinedSlugs((prev) =>
          prev.filter((slug) => !declinedSlugs.includes(slug))
        );
        for (const s of applied) {
          setOptimisticConstraintSlugs((prev) =>
            prev.filter((slug) => slug !== s.slug)
          );
        }
        const message =
          error instanceof Error ? error.message : "Could not save.";
        setOptimisticMessages((prev) =>
          prev.map((m) =>
            m.pending
              ? {
                  ...m,
                  pending: false,
                  content: "Could not save site conditions. Try again.",
                  error: message,
                }
              : m
          )
        );
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
      applySyncPayload,
      applyEstimateChangeFromPayload,
    ]
  );

  const submitWorkAreaConfirmation = useCallback(
    async (selections: WorkAreaSelection[]) => {
      if (selections.length === 0 || flushInFlightRef.current) return;

      flushInFlightRef.current = true;
      setFlushInFlight(true);
      markSaving();
      markUpdating();

      setOptimisticMessages((prev) => [
        ...prev,
        { id: `wa-user-${Date.now()}`, role: "user", content: "Confirming work areas…" },
        {
          id: `wa-asst-${Date.now()}`,
          role: "assistant",
          content: "Updating estimate…",
          pending: true,
        },
      ]);

      try {
        const result = await confirmAssistantWorkAreas(projectId, selections);
        if (result.error) throw new Error(result.error);

        setOptimisticMessages([]);

        const syncResult = await syncAssistantState(projectId);
        if (syncResult.data) {
          applySyncPayload(syncResult.data);
          applyEstimateChangeFromPayload(syncResult.data, "work areas confirmed");
        } else {
          markSaved({
            costDelta: null,
            previousCompleteness: null,
            newCompleteness: null,
            changeLabel: "work areas confirmed",
          });
        }
      } catch (error) {
        markIdle();
        const message =
          error instanceof Error ? error.message : "Could not save work areas.";
        setOptimisticMessages((prev) =>
          prev.map((m) =>
            m.pending ? { ...m, pending: false, error: message } : m
          )
        );
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
      applySyncPayload,
      applyEstimateChangeFromPayload,
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

      const syncResult = await syncAssistantState(projectId);
      if (syncResult.data) {
        applySyncPayload(syncResult.data);
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
  ]);

  const submitScopeAnswer = useCallback(
    (
      questionId: string,
      questionKey: string,
      answer: string,
      label: string
    ) => {
      markSaving();
      applyOptimisticScopeAnswers([
        { questionId, questionKey, answer, label },
      ]);
    },
    [markSaving, applyOptimisticScopeAnswers]
  );

  const submitQualityLevel = useCallback(
    async (level: string, label: string) => {
      if (flushInFlightRef.current) return;

      markSaving();
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
          content: `Finish level updated to ${label.split(" / ")[0]}.`,
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

        setOptimisticMessages([]);

        const syncResult = await syncAssistantState(projectId);
        if (syncResult.data) {
          applySyncPayload(syncResult.data);
          applyEstimateChangeFromPayload(
            syncResult.data,
            `finish level → ${label.split(" / ")[0]}`
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
        setOptimisticMessages((prev) =>
          prev.map((m) => (m.pending ? { ...m, error: message } : m))
        );
      }
    },
    [
      projectId,
      markSaving,
      markUpdating,
      markSaved,
      markIdle,
      applySyncPayload,
      applyEstimateChangeFromPayload,
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
        const syncResult = await syncAssistantState(projectId);
        if (syncResult.data) {
          applySyncPayload(syncResult.data);
          applyEstimateChangeFromPayload(syncResult.data, "after update");
        }
        clearOptimisticMessages();
        if (result.openBreakdown) {
          requestBreakdownOpen();
        }
        markSaved({
          costDelta: null,
          previousCompleteness: null,
          newCompleteness: null,
          changeLabel: "after update",
        });
      } catch (error) {
        markIdle();
        const message =
          error instanceof Error ? error.message : "Could not send message.";
        resolveOptimisticMessage(optimisticId, message);
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
    ]
  );

  const allMessages = useMemo(() => {
    const persisted = persistedMessages.map((m) => ({
      id: m.id,
      role: m.role as "user" | "assistant",
      content: m.content,
    }));
    return [...persisted, ...optimisticMessages];
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
      syncAssistant,
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
      syncAssistant,
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
