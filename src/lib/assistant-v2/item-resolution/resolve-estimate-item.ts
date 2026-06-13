import { labelForAllowanceKey } from "@/lib/assistant-v2/intent/allowance-keys";
import { listProjectAllowances } from "@/lib/assistant-v2/project-allowances-data";
import {
  rankCandidateMatches,
  resolveAllowanceKeyHint,
} from "@/lib/assistant-v2/item-resolution/match-candidates";
import type {
  EstimateItemCandidate,
  EstimateItemCandidateType,
  ResolveEstimateItemParams,
  ResolveEstimateItemResult,
} from "@/lib/assistant-v2/item-resolution/types";
import { parseQuickEstimateSummary } from "@/lib/project-assistant-summary";
import { getQuickEstimateForProject } from "@/lib/quick-estimate-data";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type Supabase = SupabaseClient<Database>;

function extractSubjectFromCommand(command: string): string {
  const patterns = [
    /(?:increase|decrease|change|update|set|make|remove|delete|take out|drop|reduce)\s+(?:the\s+)?(.+?)(?:\s+allowance|\s+to|\s+from|\s*$)/i,
    /(?:allowance for|allowance on)\s+(.+?)(?:\s+to|\s+from|\s*$)/i,
    /(.+?)\s+allowance/i,
  ];

  for (const pattern of patterns) {
    const match = command.match(pattern);
    if (match?.[1]) {
      return match[1].trim();
    }
  }

  return command.trim();
}

async function loadAllowanceCandidates(
  supabase: Supabase,
  organisationId: string,
  projectId: string
): Promise<EstimateItemCandidate[]> {
  const candidates: EstimateItemCandidate[] = [];
  const seenKeys = new Set<string>();

  const { data: projectAllowances } = await listProjectAllowances(
    supabase,
    organisationId,
    projectId
  );

  for (const row of projectAllowances) {
    seenKeys.add(row.allowance_key);
    candidates.push({
      itemType: "allowance",
      itemId: row.id,
      itemKey: row.allowance_key,
      label: row.label,
      currentAmount: Number(row.amount),
      source: "project_allowance",
    });
  }

  const { data: quickEstimate } = await getQuickEstimateForProject(
    supabase,
    organisationId,
    projectId
  );

  const summary = parseQuickEstimateSummary(quickEstimate?.notes ?? null);
  const trace = summary?.estimateTrace;

  if (trace?.missingFacts) {
    for (const fact of trace.missingFacts) {
      if (fact.label.toLowerCase().includes("allowance")) {
        const key = fact.key.replace(/\./g, "_");
        if (!seenKeys.has(key)) {
          candidates.push({
            itemType: "allowance",
            itemKey: key,
            label: fact.label,
            source: "estimate_trace",
          });
        }
      }
    }
  }

  if (summary?.allowances) {
    for (const allowanceText of summary.allowances) {
      const hint = resolveAllowanceKeyHint(allowanceText);
      const key = hint ?? allowanceText.toLowerCase().replace(/\s+/g, "_");
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        candidates.push({
          itemType: "allowance",
          itemKey: key,
          label: allowanceText.replace(/\s*allowance$/i, "").trim() || allowanceText,
          source: "estimate_trace",
        });
      }
    }
  }

  const breakdown = trace?.costBreakdown ?? summary?.costBreakdown;
  if (breakdown && breakdown.allowances > 0) {
    for (const area of breakdown.byWorkArea ?? []) {
      if (area.allowances <= 0) continue;
      const key = `work_area_${area.workAreaTypeKey.toLowerCase().replace(/\s+/g, "_")}_allowances`;
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        candidates.push({
          itemType: "allowance",
          itemKey: key,
          label: `${area.name} allowances`,
          currentAmount: area.allowances,
          source: "breakdown",
        });
      }
    }
  }

  return candidates;
}

async function loadWorkAreaCandidates(
  supabase: Supabase,
  organisationId: string,
  projectId: string
): Promise<EstimateItemCandidate[]> {
  const { data: scopes } = await supabase
    .from("project_scopes")
    .select("id, name, include_in_quick_estimate")
    .eq("project_id", projectId)
    .eq("organisation_id", organisationId);

  return (scopes ?? []).map((scope) => ({
    itemType: "work_area" as const,
    itemId: scope.id,
    itemKey: scope.name.toLowerCase().replace(/\s+/g, "_"),
    label: scope.name,
    source: "project_scope" as const,
  }));
}

async function loadCandidates(
  supabase: Supabase,
  params: ResolveEstimateItemParams
): Promise<EstimateItemCandidate[]> {
  switch (params.candidateType) {
    case "allowance":
      return loadAllowanceCandidates(
        supabase,
        params.organisationId,
        params.projectId
      );
    case "work_area":
      return loadWorkAreaCandidates(
        supabase,
        params.organisationId,
        params.projectId
      );
    default:
      return [];
  }
}

function buildResultFromMatch(
  best: ReturnType<typeof rankCandidateMatches>[number],
  params: ResolveEstimateItemParams
): ResolveEstimateItemResult {
  const { candidate, confidence, reason } = best;
  const intent = params.commandIntent ?? "update";

  if (intent === "remove") {
    if (confidence >= 0.8) {
      return {
        matched: true,
        confidence,
        itemType: candidate.itemType,
        itemId: candidate.itemId,
        itemKey: candidate.itemKey,
        label: candidate.label,
        currentAmount: candidate.currentAmount,
        suggestedAction: "remove",
        reason,
      };
    }
    if (confidence >= 0.5) {
      const amountText =
        candidate.currentAmount != null
          ? ` of $${candidate.currentAmount.toLocaleString("en-NZ")}`
          : "";
      return {
        matched: true,
        confidence,
        itemType: candidate.itemType,
        itemId: candidate.itemId,
        itemKey: candidate.itemKey,
        label: candidate.label,
        currentAmount: candidate.currentAmount,
        suggestedAction: "confirm",
        reason: `Found existing ${candidate.label}${amountText}. Confirm removal?`,
      };
    }
    return {
      matched: false,
      confidence,
      itemType: params.candidateType,
      suggestedAction: "confirm",
      reason: `Could not find an existing item matching "${extractSubjectFromCommand(params.userCommand)}".`,
    };
  }

  // update / add
  if (confidence >= 0.8) {
    return {
      matched: true,
      confidence,
      itemType: candidate.itemType,
      itemId: candidate.itemId,
      itemKey: candidate.itemKey,
      label: candidate.label,
      currentAmount: candidate.currentAmount,
      suggestedAction: "update",
      reason,
    };
  }

  if (confidence >= 0.5) {
    const amount = params.targetAmount;
    const amountText =
      amount != null ? `$${amount.toLocaleString("en-NZ")}` : "the new amount";
    const currentText =
      candidate.currentAmount != null
        ? `$${candidate.currentAmount.toLocaleString("en-NZ")}`
        : "an existing value";
    return {
      matched: true,
      confidence,
      itemType: candidate.itemType,
      itemId: candidate.itemId,
      itemKey: candidate.itemKey,
      label: candidate.label,
      currentAmount: candidate.currentAmount,
      suggestedAction: "confirm",
      reason: `Found existing ${candidate.label} of ${currentText}. Update to ${amountText}?`,
    };
  }

  const hintKey = resolveAllowanceKeyHint(params.userCommand);
  const hintLabel = hintKey ? labelForAllowanceKey(hintKey) : extractSubjectFromCommand(params.userCommand);
  const amount = params.targetAmount;
  const amountText =
    amount != null
      ? ` for $${amount.toLocaleString("en-NZ")}`
      : "";

  return {
    matched: false,
    confidence,
    itemType: params.candidateType,
    itemKey: hintKey ?? undefined,
    label: hintLabel,
    suggestedAction: "confirm",
    reason: `No existing match found. Add ${hintLabel}${amountText}?`,
  };
}

/**
 * Resolve a user command to an existing estimate item before add/update/remove.
 */
export async function resolveEstimateItem(
  supabase: Supabase,
  params: ResolveEstimateItemParams
): Promise<ResolveEstimateItemResult> {
  const subject = extractSubjectFromCommand(params.userCommand);
  const candidates = await loadCandidates(supabase, params);

  if (candidates.length === 0) {
    const hintKey = resolveAllowanceKeyHint(subject);
    const hintLabel = hintKey
      ? labelForAllowanceKey(hintKey)
      : subject || "item";
    const amount = params.targetAmount;
    const amountText =
      amount != null
        ? ` for $${amount.toLocaleString("en-NZ")}`
        : "";

    return {
      matched: false,
      confidence: 0,
      itemType: params.candidateType,
      itemKey: hintKey ?? undefined,
      label: hintLabel,
      suggestedAction: params.commandIntent === "remove" ? "confirm" : "add",
      reason:
        params.commandIntent === "remove"
          ? `Could not find an existing ${hintLabel} to remove.`
          : `No existing allowance found. Add ${hintLabel}${amountText}?`,
    };
  }

  const ranked = rankCandidateMatches(subject, candidates);

  if (ranked.length === 0) {
    const hintKey = resolveAllowanceKeyHint(subject);
    return {
      matched: false,
      confidence: 0,
      itemType: params.candidateType,
      itemKey: hintKey ?? undefined,
      label: hintKey ? labelForAllowanceKey(hintKey) : subject,
      suggestedAction: params.commandIntent === "remove" ? "confirm" : "add",
      reason: "No matching item in current estimate state.",
    };
  }

  return buildResultFromMatch(ranked[0], params);
}

export type { EstimateItemCandidateType };
