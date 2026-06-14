"use client";

import { autosaveDevLog } from "@/lib/autosave/autosave-dev-log";
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

export type EstimateChangeSummary = {
  costDelta: number | null;
  previousCompleteness: number | null;
  newCompleteness: number | null;
  changeLabel: string | null;
};

type EstimateUpdateContextValue = {
  status: EstimateUpdateStatus;
  lastUpdatedAt: Date | null;
  lastChange: EstimateChangeSummary | null;
  breakdownOpenRequest: number;
  whyOpenRequest: number;
  markSaving: () => void;
  markUpdating: () => void;
  markSaved: (change?: EstimateChangeSummary) => void;
  markIdle: () => void;
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
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [lastChange, setLastChange] = useState<EstimateChangeSummary | null>(
    null
  );
  const [breakdownOpenRequest, setBreakdownOpenRequest] = useState(0);
  const [whyOpenRequest, setWhyOpenRequest] = useState(0);
  const recalcInFlightRef = useRef(false);
  const snapshotRef = useRef<{
    costMid: number | null;
    completeness: number;
  } | null>(null);

  const markSaving = useCallback(() => setStatus("saving"), []);
  const markUpdating = useCallback(() => setStatus("updating"), []);
  const markSaved = useCallback((change?: EstimateChangeSummary) => {
    setStatus("saved");
    setLastUpdatedAt(new Date());
    if (change) setLastChange(change);
  }, []);
  const markIdle = useCallback(() => setStatus("idle"), []);
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
      markSaving();
      autosaveDevLog("estimate", `recalculating due to: ${reason}`);
      try {
        markUpdating();
        await fn();
        markSaved();
      } finally {
        recalcInFlightRef.current = false;
      }
    },
    [markSaving, markUpdating, markSaved]
  );

  const value = useMemo(
    () => ({
      status,
      lastUpdatedAt,
      lastChange,
      breakdownOpenRequest,
      whyOpenRequest,
      markSaving,
      markUpdating,
      markSaved,
      markIdle,
      requestBreakdownOpen,
      requestWhyOpen,
      recordEstimateSnapshot,
      runGuardedRefresh,
    }),
    [
      status,
      lastUpdatedAt,
      lastChange,
      breakdownOpenRequest,
      whyOpenRequest,
      markSaving,
      markUpdating,
      markSaved,
      markIdle,
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
