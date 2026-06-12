import { revalidatePath, revalidateTag } from "next/cache";

export type AssistantCacheKind =
  | "project"
  | "assistant"
  | "estimate"
  | "answers"
  | "scopes"
  | "constraints"
  | "messages";

export function assistantCacheTag(
  kind: AssistantCacheKind,
  projectId: string,
  scopeId?: string
): string {
  if (kind === "answers" && scopeId) {
    return `answers-${scopeId}`;
  }
  return `${kind}-${projectId}`;
}

/** Invalidate only the specified cache tags — avoids broad page refresh. */
export function revalidateAssistantTags(
  projectId: string,
  kinds: AssistantCacheKind[],
  scopeId?: string
) {
  const seen = new Set<string>();
  for (const kind of kinds) {
    const tag = assistantCacheTag(kind, projectId, scopeId);
    if (!seen.has(tag)) {
      revalidateTag(tag);
      seen.add(tag);
    }
  }
}

/** Full assistant sync — use sparingly (reset, notes submit). */
export function revalidateProjectAssistant(projectId: string) {
  revalidateAssistantTags(projectId, [
    "assistant",
    "estimate",
    "answers",
    "scopes",
    "constraints",
    "messages",
  ]);
}

export function revalidateConstraintsAndEstimate(projectId: string) {
  revalidateAssistantTags(projectId, ["constraints", "estimate", "messages"]);
}

export function revalidateEstimateOnly(projectId: string) {
  revalidateAssistantTags(projectId, ["estimate"]);
}

export function revalidateScopeAnswers(
  projectId: string,
  scopeId?: string
) {
  revalidateAssistantTags(
    projectId,
    ["answers", "estimate", "scopes", "messages"],
    scopeId
  );
}

/** Use when project or client metadata changes. */
export function revalidateProjectPage(projectId: string) {
  revalidateTag(assistantCacheTag("project", projectId));
  revalidatePath(`/projects/${projectId}`);
  revalidateProjectAssistant(projectId);
}
