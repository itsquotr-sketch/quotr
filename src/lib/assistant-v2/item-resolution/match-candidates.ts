import {
  ALLOWANCE_DEFINITIONS,
  resolveAllowanceKey,
} from "@/lib/assistant-v2/intent/allowance-keys";
import type { EstimateItemCandidate } from "@/lib/assistant-v2/item-resolution/types";
import {
  ALLOWANCE_SYNONYM_CLUSTERS,
  clusterKeysForText,
  normalizeItemText,
  tokenizeItemText,
} from "@/lib/assistant-v2/item-resolution/normalize-item-text";

export type ItemMatchScore = {
  candidate: EstimateItemCandidate;
  confidence: number;
  reason: string;
};

function scoreSubstringMatch(command: string, candidate: EstimateItemCandidate): number {
  const cmd = normalizeItemText(command);
  const label = normalizeItemText(candidate.label);
  const key = normalizeItemText(candidate.itemKey.replace(/_/g, " "));

  if (!cmd) return 0;

  if (cmd === label || cmd === key) return 1;
  if (label.includes(cmd) || cmd.includes(label)) return 0.92;
  if (key.includes(cmd) || cmd.includes(key)) return 0.88;

  const def = ALLOWANCE_DEFINITIONS.find((d) => d.key === candidate.itemKey);
  if (def) {
    for (const alias of def.aliases) {
      const normalisedAlias = normalizeItemText(alias);
      if (cmd.includes(normalisedAlias) || normalisedAlias.includes(cmd)) {
        return Math.min(0.95, 0.7 + normalisedAlias.length / 40);
      }
    }
  }

  return 0;
}

function scoreTokenOverlap(command: string, candidate: EstimateItemCandidate): number {
  const cmdTokens = new Set(tokenizeItemText(command));
  const labelTokens = tokenizeItemText(candidate.label);
  const keyTokens = tokenizeItemText(candidate.itemKey.replace(/_/g, " "));

  if (cmdTokens.size === 0) return 0;

  const allCandidateTokens = new Set([...labelTokens, ...keyTokens]);
  let overlap = 0;
  for (const token of cmdTokens) {
    if (allCandidateTokens.has(token)) overlap += 1;
  }

  if (overlap === 0) return 0;
  return Math.min(0.85, overlap / cmdTokens.size);
}

function scoreClusterMatch(command: string, candidate: EstimateItemCandidate): number {
  const clusterKeys = clusterKeysForText(command);
  if (clusterKeys.length === 0) return 0;
  if (clusterKeys.includes(candidate.itemKey)) {
    return 0.82;
  }
  return 0;
}

export function scoreCandidateMatch(
  command: string,
  candidate: EstimateItemCandidate
): ItemMatchScore {
  const substring = scoreSubstringMatch(command, candidate);
  const tokens = scoreTokenOverlap(command, candidate);
  const cluster = scoreClusterMatch(command, candidate);

  const confidence = Math.max(substring, tokens, cluster);
  let reason = "No strong match";
  if (confidence === substring && substring > 0) {
    reason = `Label/key match (${Math.round(substring * 100)}%)`;
  } else if (confidence === cluster && cluster > 0) {
    reason = "Synonym cluster match";
  } else if (confidence === tokens && tokens > 0) {
    reason = "Token overlap match";
  }

  return { candidate, confidence, reason };
}

export function rankCandidateMatches(
  command: string,
  candidates: EstimateItemCandidate[]
): ItemMatchScore[] {
  const scored = candidates.map((candidate) =>
    scoreCandidateMatch(command, candidate)
  );

  return scored
    .filter((s) => s.confidence > 0)
    .sort((a, b) => {
      if (b.confidence !== a.confidence) return b.confidence - a.confidence;
      // Prefer project_allowance over trace-only
      const sourceOrder = {
        project_allowance: 4,
        project_scope: 4,
        breakdown: 3,
        estimate_trace: 2,
        scope_template: 1,
      };
      return (
        sourceOrder[b.candidate.source] - sourceOrder[a.candidate.source]
      );
    });
}

/** Resolve allowance key hint from command text using definitions + clusters. */
export function resolveAllowanceKeyHint(command: string): string | null {
  const def = resolveAllowanceKey(command);
  if (def) return def.key;

  const clusterKeys = clusterKeysForText(command);
  if (clusterKeys.length > 0) return clusterKeys[0];

  return null;
}

export function keysInSameCluster(keyA: string, keyB: string): boolean {
  return ALLOWANCE_SYNONYM_CLUSTERS.some(
    (cluster) => cluster.keys.includes(keyA) && cluster.keys.includes(keyB)
  );
}
