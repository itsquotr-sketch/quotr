"use client";

import { autosaveDevLog } from "@/lib/autosave/autosave-dev-log";
import { createSyncVersionTracker } from "@/lib/assistant-v2/sync-versioning";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type EstimateUpdateStatus = "idle" | "saving" | "updating" | "saved";

export type PendingAction =
  | "saving_answer"
  | "updating_estimate"
  | "changing_finish_level"
  | "toggling_constraints"
  | "removing_work_area"
  | "adding_work_area"
  | "retrying_estimate"
  | "opening_insight"
  | "applying_margin"
  | null;

export type EstimateChangeSummary = {
  costDelta: number | null;
  previousCompleteness: number | null;
  newCompleteness: number | null;
  changeLabel: string | null;
};

type EstimateUpdateContextValue = {
  status: EstimateUpdateStatus;
  pendingAction: PendingAction;
  lastUpdatedAt: Date | null;
  lastChange: EstimateChangeSummary | null;
  breakdownOpenRequest: number;
  whyOpenRequest: number;
  markSaving: () => void;
  markUpdating: () => void;
  markSaved: (change?: EstimateChangeSummary) => void;
  markIdle: () => void;
  setPendingAction: (action: PendingAction) => void;
  isActionPending: (action: Exclude<PendingAction, null>) => boolean;
  beginSync: () => number;
  isSyncCurrent: (version: number) => boolean;
  requestBreakdownOpen: () => void;
  requestWhyOpen: () => void;
  recordEstimateSnapshot: (
    costMid: number | null,
    completeness: number
  ) => void;
  runGuardedRefresh: (
    fn: () => Promise<void>,
    reason: string
  ) => Promise<void>;
};

const EstimateUpdateContext = createContext<EstimateUpdateContextValue | null>(
  null
);

export function EstimateUpdateProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<EstimateUpdateStatus>("idle");
  const [pendingAction, setPendingActionState] = useState<PendingAction>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [lastChange, setLastChange] = useState<EstimateChangeSummary | null>(
    null
  );
  const [breakdownOpenRequest, setBreakdownOpenRequest] = useState(0);
  const [whyOpenRequest, setWhyOpenRequest] = useState(0);
  const recalcInFlightRef = useRef(false);
  const syncVersionTrackerRef = useRef(createSyncVersionTracker());
  const snapshotRef = useRef<{
    costMid: number | null;
    completeness: number;
  } | null>(null);

  const markSaving = useCallback(() => setStatus("saving"), []);
  const markUpdating = useCallback(() => setStatus("updating"), []);
  const markSaved = useCallback((change?: EstimateChangeSummary) => {
    setStatus("saved");
    setPendingActionState(null);
    setLastUpdatedAt(new Date());
    if (change) setLastChange(change);
  }, []);
  const markIdle = useCallback(() => {
    setStatus("idle");
    setPendingActionState(null);
  }, []);

  const setPendingAction = useCallback((action: PendingAction) => {
    setPendingActionState(action);
  }, []);

  const isActionPending = useCallback(
    (action: Exclude<PendingAction, null>) => pendingAction === action,
    [pendingAction]
  );

  const beginSync = useCallback(
    () => syncVersionTrackerRef.current.beginSync(),
    []
  );

  const isSyncCurrent = useCallback(
    (version: number) => syncVersionTrackerRef.current.isCurrent(version),
    []
  );
  const requestBreakdownOpen = useCallback(
    () => setBreakdownOpenRequest((n) => n + 1),
    []
  );

  const requestWhyOpen = useCallback(
    () => setWhyOpenRequest((n) => n + 1),
    []
  );

  const recordEstimateSnapshot = useCallback(
    (costMid: number | null, completeness: number) => {
      snapshotRef.current = { costMid, completeness };
    },
    []
  );

  const runGuardedRefresh = useCallback(
    async (fn: () => Promise<void>, reason: string) => {
      if (recalcInFlightRef.current) {
        autosaveDevLog(
          "estimate",
          "skipped — recalculation already in progress",
          reason
        );
        return;
      }

      recalcInFlightRef.current = true;
      setPendingActionState("retrying_estimate");
      markSaving();
      autosaveDevLog("estimate", `recalculating due to: ${reason}`);
      try {
        markUpdating();
        await fn();
        markSaved();
      } catch {
        markIdle();
      } finally {
        recalcInFlightRef.current = false;
      }
    },
    [markSaving, markUpdating, markSaved, markIdle]
  );

  const value = useMemo(
    () => ({
      status,
      pendingAction,
      lastUpdatedAt,
      lastChange,
      breakdownOpenRequest,
      whyOpenRequest,
      markSaving,
      markUpdating,
      markSaved,
      markIdle,
      setPendingAction,
      isActionPending,
      beginSync,
      isSyncCurrent,
      requestBreakdownOpen,
      requestWhyOpen,
      recordEstimateSnapshot,
      runGuardedRefresh,
    }),
    [
      status,
      pendingAction,
      lastUpdatedAt,
      lastChange,
      breakdownOpenRequest,
      whyOpenRequest,
      markSaving,
      markUpdating,
      markSaved,
      markIdle,
      setPendingAction,
      isActionPending,
      beginSync,
      isSyncCurrent,
      requestBreakdownOpen,
      requestWhyOpen,
      recordEstimateSnapshot,
      runGuardedRefresh,
    ]
  );

  return (
    <EstimateUpdateContext.Provider value={value}>
      {children}
    </EstimateUpdateContext.Provider>
  );
}

export function useEstimateUpdate() {
  const ctx = useContext(EstimateUpdateContext);
  if (!ctx) {
    throw new Error("useEstimateUpdate must be used within EstimateUpdateProvider");
  }
  return ctx;
}

export function formatLastUpdated(date: Date | null): string | null {
  if (!date) return null;
  try {
    return new Intl.RelativeTimeFormat("en-NZ", { numeric: "auto" }).format(
      Math.round((date.getTime() - Date.now()) / 1000),
      "second"
    );
  } catch {
    return "just now";
  }
}
