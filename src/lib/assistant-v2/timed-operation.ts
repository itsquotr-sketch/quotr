import { devLog } from "@/lib/dev-log";

const SLOW_OPERATION_MS = 2000;

/** Wrap async work with timeout and dev slow-op logging. */
export async function timedOperation<T>(
  label: string,
  fn: () => Promise<T>,
  options?: { slowThresholdMs?: number }
): Promise<T> {
  const threshold = options?.slowThresholdMs ?? SLOW_OPERATION_MS;
  const started = Date.now();

  try {
    return await fn();
  } finally {
    const elapsed = Date.now() - started;
    if (elapsed >= threshold) {
      devLog("slow-operation", { label, elapsedMs: elapsed });
    }
  }
}
