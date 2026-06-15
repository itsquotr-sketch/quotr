export type AssistantSyncKind =
  | "estimate"
  | "messages"
  | "scopes"
  | "answers"
  | "constraints";

export type SyncRequest = {
  kinds: AssistantSyncKind[];
  scopeId?: string;
};

/** Merge sync kinds — later request supersedes overlapping data needs. */
export function mergeSyncRequests(
  pending: SyncRequest | null,
  incoming: SyncRequest
): SyncRequest {
  if (!pending) return incoming;

  const kindSet = new Set<AssistantSyncKind>([
    ...pending.kinds,
    ...incoming.kinds,
  ]);

  if (kindSet.has("scopes")) {
    kindSet.add("answers");
  }
  if (kindSet.has("answers")) {
    kindSet.add("estimate");
  }
  if (kindSet.has("constraints")) {
    kindSet.add("estimate");
    kindSet.add("messages");
  }

  return {
    kinds: [...kindSet],
    scopeId: incoming.scopeId ?? pending.scopeId,
  };
}

export function syncKindsToLoader(
  kinds: AssistantSyncKind[]
): AssistantSyncKind[] {
  const set = new Set(kinds);
  if (set.has("scopes")) set.add("answers");
  if (set.has("answers")) set.add("estimate");
  if (set.has("constraints")) {
    set.add("estimate");
    set.add("messages");
  }
  return [...set];
}
