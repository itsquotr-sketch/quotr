/** Development-only structured logging for tracing data flows. */
export function devLog(context: string, data: unknown): void {
  if (process.env.NODE_ENV !== "development") {
    return;
  }

  console.log(`[dev:${context}]`, JSON.stringify(data, null, 2));
}
