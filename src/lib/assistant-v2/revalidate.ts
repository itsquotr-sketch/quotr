import { revalidatePath, revalidateTag } from "next/cache";

export function assistantCacheTag(
  kind: "project" | "assistant" | "estimate" | "answers" | "scopes",
  projectId: string
): string {
  return `${kind}-${projectId}`;
}

/** Targeted invalidation for assistant flows — avoids full project page refresh. */
export function revalidateProjectAssistant(projectId: string) {
  revalidateTag(assistantCacheTag("assistant", projectId));
  revalidateTag(assistantCacheTag("estimate", projectId));
  revalidateTag(assistantCacheTag("answers", projectId));
  revalidateTag(assistantCacheTag("scopes", projectId));
  revalidatePath(`/projects/${projectId}/assistant-v2`);
}

/** Use when project or client metadata changes. */
export function revalidateProjectPage(projectId: string) {
  revalidateTag(assistantCacheTag("project", projectId));
  revalidatePath(`/projects/${projectId}`);
  revalidateProjectAssistant(projectId);
}
