import { describe, expect, it } from "vitest";
import { extractFactsFromNotes } from "@/lib/ai/discovery/fact-rules";
import {
  buildDiscoveryOutputRowsFromOutcome,
  dedupeDiscoveryOutputRows,
} from "@/lib/ai/discovery/build-discovery-outputs";
import { RuleBasedDiscoveryCore } from "@/lib/ai/discovery/rule-based-core";
import { ruleBasedAiDiscoveryProvider } from "@/lib/ai/discovery/rule-based-discovery-provider";

const PROMPT =
  "7m by 3m timber deck with single step and pergola, also a new 3m fence with gate, and new retaining wall (6m long by 1.8m high) including all excavation";

function findDuplicateKeys<T>(
  items: T[],
  getKey: (item: T) => string
): string[] {
  const seen = new Set<string>();
  const dups: string[] = [];
  for (const item of items) {
    const key = getKey(item);
    if (seen.has(key)) dups.push(key);
    seen.add(key);
  }
  return dups;
}

describe("discovery output keys", () => {
  it("has no duplicate fact or question keys for multi-scope prompt", () => {
    const core = new RuleBasedDiscoveryCore();
    const result = core.discoverProject(PROMPT);

    expect(findDuplicateKeys(result.facts, (f) => f.key)).toEqual([]);
    expect(findDuplicateKeys(result.questions, (q) => q.key)).toEqual([]);
    expect(findDuplicateKeys(result.workAreas, (w) => w.typeKey)).toEqual([]);
  });

  it("has no duplicate fact keys when notes mention contractor supplied fence material", async () => {
    const text = `${PROMPT} Fence material supply contractor supplied.`;
    const facts = extractFactsFromNotes(text);
    expect(findDuplicateKeys(facts, (f) => f.key)).toEqual([]);

    const outcome = await ruleBasedAiDiscoveryProvider.discoverProject({
      projectId: "p",
      organisationId: "o",
      userId: "u",
      inputText: text,
    });

    expect(findDuplicateKeys(outcome.result.facts, (f) => f.key)).toEqual([]);
    expect(findDuplicateKeys(outcome.result.questions, (q) => q.key)).toEqual([]);
    expect(findDuplicateKeys(outcome.result.workAreas, (w) => w.typeKey)).toEqual(
      []
    );
  });

  it("dedupes discovery output rows before persistence", async () => {
    const outcome = await ruleBasedAiDiscoveryProvider.discoverProject({
      projectId: "p",
      organisationId: "o",
      userId: "u",
      inputText: PROMPT,
    });

    const rows = buildDiscoveryOutputRowsFromOutcome("o", "p", "run-1", outcome);
    const composite = rows.map((r) => `${r.output_type}:${r.output_key}`);
    expect(new Set(composite).size).toBe(composite.length);

    const withDupes = dedupeDiscoveryOutputRows([
      ...rows,
      { ...rows[0]!, title: "duplicate" },
    ]);
    expect(withDupes.length).toBe(rows.length);
  });
});
