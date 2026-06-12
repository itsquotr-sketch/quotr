/** Development-only autosave / estimate tracing. */
export function autosaveDevLog(
  channel: "autosave" | "estimate",
  message: string,
  detail?: string
): void {
  if (process.env.NODE_ENV !== "development") return;
  const suffix = detail ? ` — ${detail}` : "";
  console.log(`[${channel}] ${message}${suffix}`);
}
