"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import {
  autoSaveQualityLevel,
  batchSaveAssistantConstraintAnswers,
  batchSaveAssistantScopeAnswers,
} from "@/actions/assistant-v2";
import { useEstimateUpdate } from "@/components/projects/estimate-update-context";
import type { AssistantMessageRow } from "@/lib/assistant-v2/assistant-messages-data";
import type { WorkAreaCompletenessInput } from "@/lib/assistant-v2/compute-information-completeness";
import { computeProjectCompleteness } from "@/lib/assistant-v2/compute-information-completeness";

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
  submitQualityLevel: (level: string, label: string) => void;
  addOptimisticUserMessage: (content: string) => string;
  addOptimisticAssistantMessage: (content: string) => void;
  resolveOptimisticMessage: (id: string, error?: string) => void;
  flushInFlight: boolean;
};

const AssistantChatContext = createContext<AssistantChatContextValue | null>(
  null
);

export function AssistantChatProvider({
  projectId,
  persistedMessages,
  initialWorkAreas,
  selectedConstraintSlugs,
  initialQualityLevel,
  children,
}: {
  projectId: string;
  persistedMessages: AssistantMessageRow[];
  initialWorkAreas: WorkAreaCompletenessInput[];
  selectedConstraintSlugs: string[];
  initialQualityLevel: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const { markSaving, markUpdating, markSaved, markIdle } =
    useEstimateUpdate();
  const [optimisticMessages, setOptimisticMessages] = useState<
    OptimisticMessage[]
  >([]);
  const [optimisticAnswers, setOptimisticAnswers] = useState<
    Record<string, string>
  >({});
  const [optimisticConstraintSlugs, setOptimisticConstraintSlugs] = useState(
    selectedConstraintSlugs
  );
  const [optimisticQualityLevel, setOptimisticQualityLevel] = useState<
    string | null
  >(initialQualityLevel);
  const [workAreas, setWorkAreas] =
    useState<WorkAreaCompletenessInput[]>(initialWorkAreas);
  const [flushInFlight, setFlushInFlight] = useState(false);

  const flushInFlightRef = useRef(false);

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
          content: "Updating estimate…",
          pending: true,
        },
      ]);

      applyOptimisticScopeAnswers(answers);
      markUpdating();

      try {
        const result = await batchSaveAssistantScopeAnswers(projectId, answers);
        if (result.error) throw new Error(result.error);

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

        setOptimisticMessages((prev) =>
          prev
            .filter((m) => !m.pending)
            .concat({
              id: `batch-asst-done-${Date.now()}`,
              role: "assistant",
              content: "Estimate updated.",
            })
        );

        markSaved({
          costDelta: null,
          previousCompleteness: prevCompleteness,
          newCompleteness,
          changeLabel:
            answers.length === 1
              ? `after ${answers[0]!.label.toLowerCase()}`
              : `after updating ${answers.length} details`,
        });

        setOptimisticMessages([]);
        router.refresh();
      } catch (error) {
        markIdle();
        const message =
          error instanceof Error ? error.message : "Could not save.";
        setOptimisticMessages((prev) =>
          prev.map((m) =>
            m.pending ? { ...m, pending: false, content: message, error: message } : m
          )
        );
      } finally {
        flushInFlightRef.current = false;
        setFlushInFlight(false);
      }
    },
    [
      projectId,
      router,
      markSaving,
      markUpdating,
      markSaved,
      markIdle,
      workAreas,
      applyOptimisticScopeAnswers,
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
          : "None of these apply";

      setOptimisticMessages((prev) => [
        ...prev,
        { id: `c-batch-user-${Date.now()}`, role: "user", content: userText },
        {
          id: `c-batch-asst-${Date.now()}`,
          role: "assistant",
          content: "Updating estimate…",
          pending: true,
        },
      ]);

      for (const s of applied) {
        setOptimisticConstraintSlugs((prev) =>
          prev.includes(s.slug) ? prev : [...prev, s.slug]
        );
      }

      markUpdating();

      try {
        const result = await batchSaveAssistantConstraintAnswers(
          projectId,
          selections
        );
        if (result.error) throw new Error(result.error);

        const ack =
          applied.length > 0
            ? `Got it. I've added ${applied.map((s) => s.label.toLowerCase()).join(", ")} allowances.`
            : "Got it — noted.";

        setOptimisticMessages((prev) =>
          prev
            .filter((m) => !m.pending)
            .concat({
              id: `c-batch-done-${Date.now()}`,
              role: "assistant",
              content: ack,
            })
        );

        markSaved({
          costDelta: null,
          previousCompleteness: null,
          newCompleteness: null,
          changeLabel:
            applied.length > 0
              ? `after adding ${applied.length} constraint${applied.length > 1 ? "s" : ""}`
              : null,
        });

        setOptimisticMessages([]);
        router.refresh();
      } catch (error) {
        markIdle();
        const message =
          error instanceof Error ? error.message : "Could not save.";
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
    [projectId, router, markSaving, markUpdating, markSaved, markIdle]
  );

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
        },
      ]);

      markUpdating();

      try {
        const result = await autoSaveQualityLevel(
          projectId,
          level as "budget" | "standard" | "premium" | "unknown"
        );
        if (result.error) throw new Error(result.error);

        markSaved({
          costDelta: null,
          previousCompleteness: null,
          newCompleteness: null,
          changeLabel: `finish level → ${label.split(" / ")[0]}`,
        });
        setOptimisticMessages([]);
        router.refresh();
      } catch (error) {
        markIdle();
        const message =
          error instanceof Error ? error.message : "Could not save.";
        setOptimisticMessages((prev) =>
          prev.map((m) => (m.pending ? { ...m, error: message } : m))
        );
      }
    },
    [projectId, router, markSaving, markUpdating, markSaved, markIdle]
  );

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
      { id: `opt-asst-${Date.now()}`, role: "assistant", content },
    ]);
  }, []);

  const resolveOptimisticMessage = useCallback((id: string, error?: string) => {
    setOptimisticMessages((prev) =>
      prev.map((m) =>
        m.id === id ? { ...m, pending: false, error: error ?? undefined } : m
      )
    );
  }, []);

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
      optimisticQualityLevel,
      workAreas,
      setWorkAreas,
      submitScopeAnswer,
      flushScopeBatch,
      submitConstraintBatch,
      submitQualityLevel,
      addOptimisticUserMessage,
      addOptimisticAssistantMessage,
      resolveOptimisticMessage,
      flushInFlight,
    }),
    [
      persistedMessages,
      optimisticMessages,
      allMessages,
      optimisticAnswers,
      optimisticConstraintSlugs,
      optimisticQualityLevel,
      workAreas,
      submitScopeAnswer,
      flushScopeBatch,
      submitConstraintBatch,
      submitQualityLevel,
      addOptimisticUserMessage,
      addOptimisticAssistantMessage,
      resolveOptimisticMessage,
      flushInFlight,
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
