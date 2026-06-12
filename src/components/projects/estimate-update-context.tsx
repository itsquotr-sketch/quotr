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

type EstimateUpdateContextValue = {
  status: EstimateUpdateStatus;
  lastUpdatedAt: Date | null;
  markSaving: () => void;
  markUpdating: () => void;
  markSaved: () => void;
  markIdle: () => void;
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
  const recalcInFlightRef = useRef(false);

  const markSaving = useCallback(() => setStatus("saving"), []);
  const markUpdating = useCallback(() => setStatus("updating"), []);
  const markSaved = useCallback(() => {
    setStatus("saved");
    setLastUpdatedAt(new Date());
  }, []);
  const markIdle = useCallback(() => setStatus("idle"), []);

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
      markSaving,
      markUpdating,
      markSaved,
      markIdle,
      runGuardedRefresh,
    }),
    [
      status,
      lastUpdatedAt,
      markSaving,
      markUpdating,
      markSaved,
      markIdle,
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
