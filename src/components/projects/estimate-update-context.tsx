"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
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
};

const EstimateUpdateContext = createContext<EstimateUpdateContextValue | null>(
  null
);

export function EstimateUpdateProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<EstimateUpdateStatus>("idle");
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);

  const markSaving = useCallback(() => setStatus("saving"), []);
  const markUpdating = useCallback(() => setStatus("updating"), []);
  const markSaved = useCallback(() => {
    setStatus("saved");
    setLastUpdatedAt(new Date());
  }, []);
  const markIdle = useCallback(() => setStatus("idle"), []);

  const value = useMemo(
    () => ({
      status,
      lastUpdatedAt,
      markSaving,
      markUpdating,
      markSaved,
      markIdle,
    }),
    [status, lastUpdatedAt, markSaving, markUpdating, markSaved, markIdle]
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
