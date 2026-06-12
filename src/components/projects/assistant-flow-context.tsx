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
  analyseProject,
  analyseProjectBasic,
} from "@/actions/project-assistant";
import type { ProjectAssistantActionState } from "@/actions/project-assistant";

export type AnalysisStepId =
  | "reading"
  | "work_areas"
  | "measurements"
  | "missing"
  | "estimate";

export type StepStatus = "pending" | "active" | "complete" | "failed";

export type AnalysisStep = {
  id: AnalysisStepId;
  label: string;
  status: StepStatus;
};

export type AnalysisPhase = "idle" | "analysing" | "complete" | "failed";

const DEFAULT_STEPS: AnalysisStep[] = [
  { id: "reading", label: "Reading notes", status: "pending" },
  { id: "work_areas", label: "Identifying work areas", status: "pending" },
  { id: "measurements", label: "Extracting measurements", status: "pending" },
  { id: "missing", label: "Finding missing information", status: "pending" },
  { id: "estimate", label: "Preparing estimate", status: "pending" },
];

const STEP_ORDER: AnalysisStepId[] = [
  "reading",
  "work_areas",
  "measurements",
  "missing",
  "estimate",
];

type AssistantFlowContextValue = {
  analysisPhase: AnalysisPhase;
  analysisSteps: AnalysisStep[];
  analysisMode: "ai" | "rules" | null;
  usedFallback: boolean;
  analysisMessage: string | null;
  analysisError: string | null;
  showSlowMessage: boolean;
  showTimeoutActions: boolean;
  isAnalysing: boolean;
  startAnalysis: (mode?: "ai" | "rules") => void;
  runAnalyseExisting: () => Promise<ProjectAssistantActionState>;
  runAnalyseBasic: () => Promise<ProjectAssistantActionState>;
  finishAnalysis: (result: ProjectAssistantActionState) => Promise<ProjectAssistantActionState>;
  resetAnalysisUi: () => void;
  scrollTo: (target: string) => void;
  registerScrollTarget: (id: string, el: HTMLElement | null) => void;
};

const AssistantFlowContext = createContext<AssistantFlowContextValue | null>(
  null
);

function advanceSteps(steps: AnalysisStep[], activeIndex: number): AnalysisStep[] {
  return steps.map((step, i) => {
    if (i < activeIndex) return { ...step, status: "complete" as const };
    if (i === activeIndex) return { ...step, status: "active" as const };
    return { ...step, status: "pending" as const };
  });
}

function completeAllSteps(steps: AnalysisStep[]): AnalysisStep[] {
  return steps.map((s) => ({ ...s, status: "complete" as const }));
}

function failAllSteps(steps: AnalysisStep[]): AnalysisStep[] {
  return steps.map((s) =>
    s.status === "complete" ? s : { ...s, status: "failed" as const }
  );
}

export function AssistantFlowProvider({
  projectId,
  aiAvailable,
  children,
}: {
  projectId: string;
  aiAvailable: boolean;
  children: ReactNode;
}) {
  const router = useRouter();
  const scrollTargets = useRef<Map<string, HTMLElement>>(new Map());
  const inFlightRef = useRef(false);
  const progressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const slowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timeoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [analysisPhase, setAnalysisPhase] = useState<AnalysisPhase>("idle");
  const [analysisSteps, setAnalysisSteps] =
    useState<AnalysisStep[]>(DEFAULT_STEPS);
  const [analysisMode, setAnalysisMode] = useState<"ai" | "rules" | null>(null);
  const [usedFallback, setUsedFallback] = useState(false);
  const [analysisMessage, setAnalysisMessage] = useState<string | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [showSlowMessage, setShowSlowMessage] = useState(false);
  const [showTimeoutActions, setShowTimeoutActions] = useState(false);

  const clearTimers = useCallback(() => {
    if (progressTimerRef.current) {
      clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }
    if (slowTimerRef.current) {
      clearTimeout(slowTimerRef.current);
      slowTimerRef.current = null;
    }
    if (timeoutTimerRef.current) {
      clearTimeout(timeoutTimerRef.current);
      timeoutTimerRef.current = null;
    }
  }, []);

  const registerScrollTarget = useCallback(
    (id: string, el: HTMLElement | null) => {
      if (el) scrollTargets.current.set(id, el);
      else scrollTargets.current.delete(id);
    },
    []
  );

  const scrollTo = useCallback((target: string) => {
    scrollTargets.current.get(target)?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }, []);

  const resetAnalysisUi = useCallback(() => {
    clearTimers();
    inFlightRef.current = false;
    setAnalysisPhase("idle");
    setAnalysisSteps(DEFAULT_STEPS);
    setAnalysisMode(null);
    setUsedFallback(false);
    setAnalysisMessage(null);
    setAnalysisError(null);
    setShowSlowMessage(false);
    setShowTimeoutActions(false);
  }, [clearTimers]);

  const beginAnalysis = useCallback(
    (mode: "ai" | "rules") => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      clearTimers();
      setAnalysisPhase("analysing");
      setAnalysisMode(mode);
      setUsedFallback(false);
      setAnalysisMessage(null);
      setAnalysisError(null);
      setShowSlowMessage(false);
      setShowTimeoutActions(false);
      setAnalysisSteps(advanceSteps(DEFAULT_STEPS, 0));

      progressTimerRef.current = setInterval(() => {
        setAnalysisSteps((prevSteps) => {
          const currentActive = prevSteps.findIndex((s) => s.status === "active");
          const next = Math.min(
            currentActive < 0 ? 0 : currentActive + 1,
            STEP_ORDER.length - 1
          );
          return advanceSteps(DEFAULT_STEPS, next);
        });
      }, 1800);

      slowTimerRef.current = setTimeout(() => setShowSlowMessage(true), 8000);
      timeoutTimerRef.current = setTimeout(
        () => setShowTimeoutActions(true),
        20000
      );
    },
    [clearTimers]
  );

  const finishAnalysis = useCallback(
    async (result: ProjectAssistantActionState) => {
      clearTimers();

      if (result.error) {
        setAnalysisPhase("failed");
        setAnalysisSteps(failAllSteps([...DEFAULT_STEPS]));
        setAnalysisError(result.error);
        inFlightRef.current = false;
        return result;
      }

      setAnalysisSteps(completeAllSteps([...DEFAULT_STEPS]));
      setAnalysisPhase("complete");
      setUsedFallback(result.usedFallback ?? false);
      setAnalysisMessage(result.message ?? "Analysis complete.");
      setShowSlowMessage(false);
      setShowTimeoutActions(false);

      await router.refresh();
      inFlightRef.current = false;
      return result;
    },
    [clearTimers, router]
  );

  const runAnalyseExisting = useCallback(async () => {
    beginAnalysis(aiAvailable ? "ai" : "rules");
    const result = await analyseProject(projectId);
    return finishAnalysis(result);
  }, [aiAvailable, beginAnalysis, finishAnalysis, projectId]);

  const runAnalyseBasic = useCallback(async () => {
    beginAnalysis("rules");
    const result = await analyseProjectBasic(projectId);
    return finishAnalysis(result);
  }, [beginAnalysis, finishAnalysis, projectId]);

  const startAnalysis = useCallback(
    (mode?: "ai" | "rules") => {
      beginAnalysis(mode ?? (aiAvailable ? "ai" : "rules"));
    },
    [aiAvailable, beginAnalysis]
  );

  const value = useMemo(
    () => ({
      analysisPhase,
      analysisSteps,
      analysisMode,
      usedFallback,
      analysisMessage,
      analysisError,
      showSlowMessage,
      showTimeoutActions,
      isAnalysing: analysisPhase === "analysing",
      startAnalysis,
      runAnalyseExisting,
      runAnalyseBasic,
      finishAnalysis,
      resetAnalysisUi,
      scrollTo,
      registerScrollTarget,
    }),
    [
      analysisPhase,
      analysisSteps,
      analysisMode,
      usedFallback,
      analysisMessage,
      analysisError,
      showSlowMessage,
      showTimeoutActions,
      startAnalysis,
      runAnalyseExisting,
      runAnalyseBasic,
      finishAnalysis,
      resetAnalysisUi,
      scrollTo,
      registerScrollTarget,
    ]
  );

  return (
    <AssistantFlowContext.Provider value={value}>
      {children}
    </AssistantFlowContext.Provider>
  );
}

export function useAssistantFlow() {
  const ctx = useContext(AssistantFlowContext);
  if (!ctx) {
    throw new Error("useAssistantFlow must be used within AssistantFlowProvider");
  }
  return ctx;
}

export function useScrollTarget(id: string) {
  const { registerScrollTarget } = useAssistantFlow();
  return useCallback(
    (el: HTMLElement | null) => registerScrollTarget(id, el),
    [id, registerScrollTarget]
  );
}
