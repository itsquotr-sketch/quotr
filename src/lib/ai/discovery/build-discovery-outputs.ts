import type { DiscoveryRunOutcome, DiscoveryResult } from "@/lib/ai/discovery/types";
import type { Json } from "@/types/database";
import type { Database } from "@/types/database";

export type DiscoveryOutputInsert =
  Database["public"]["Tables"]["discovery_outputs"]["Insert"];

function compositeKey(
  outputType: string,
  outputKey: string
): string {
  return `${outputType}\0${outputKey}`;
}

/** Last row wins when discovery emits duplicate (type, key) pairs. */
export function dedupeDiscoveryOutputRows(
  rows: DiscoveryOutputInsert[]
): DiscoveryOutputInsert[] {
  const byKey = new Map<string, DiscoveryOutputInsert>();
  for (const row of rows) {
    byKey.set(
      compositeKey(row.output_type, row.output_key),
      row
    );
  }
  return [...byKey.values()];
}

export function buildDiscoveryOutputRows(
  organisationId: string,
  projectId: string,
  discoveryRunId: string,
  result: DiscoveryResult
): DiscoveryOutputInsert[] {
  const rows: DiscoveryOutputInsert[] = [];

  const push = (
    outputType: DiscoveryOutputInsert["output_type"],
    outputKey: string,
    title: string | null,
    content: unknown,
    confidence: number | null
  ) => {
    rows.push({
      organisation_id: organisationId,
      project_id: projectId,
      discovery_run_id: discoveryRunId,
      output_type: outputType,
      output_key: outputKey,
      title,
      content: content as Json,
      confidence,
      status: "pending",
    });
  };

  for (const workArea of result.workAreas) {
    push(
      "work_area",
      workArea.typeKey,
      workArea.name,
      workArea,
      workArea.confidence
    );
  }
  for (const fact of result.facts) {
    push("fact", fact.key, fact.label, fact, fact.confidence);
  }
  for (const question of result.questions) {
    push("question", question.key, question.text, question, null);
  }
  for (const constraint of result.constraints) {
    push(
      "constraint",
      constraint.slug,
      constraint.label,
      constraint,
      constraint.confidence
    );
  }
  for (const trade of result.trades) {
    push(
      "trade",
      `${trade.workAreaTypeKey}:${trade.name}`,
      trade.name,
      trade,
      null
    );
  }
  for (const risk of result.risks ?? []) {
    push("risk", risk.title, risk.title, risk, null);
  }
  for (const assumption of result.assumptions ?? []) {
    push("assumption", assumption, assumption, { text: assumption }, null);
  }

  return dedupeDiscoveryOutputRows(rows);
}

export function buildDiscoveryOutputRowsFromOutcome(
  organisationId: string,
  projectId: string,
  discoveryRunId: string,
  outcome: DiscoveryRunOutcome
): DiscoveryOutputInsert[] {
  return buildDiscoveryOutputRows(
    organisationId,
    projectId,
    discoveryRunId,
    outcome.result
  );
}
