import { getOpenAiClient, getOpenAiDiscoveryModel } from "@/lib/ai/openai-client";
import { getAllFactsForTemplate, getScopeTemplateByWorkAreaType } from "@/lib/scope-templates";
import { applyInferredFacts } from "@/lib/assistant-v2/facts/infer-related-facts";
import {
  projectScopeFactsSchema,
  type ProjectScopeFactsResult,
  type ExtractedScopeFact,
} from "@/lib/assistant-v2/extraction/extract-project-scope-facts";

function buildSupportedFactKeys(): string {
  const templates = [
    "Deck",
    "Fence",
    "Retaining Wall",
    "Bathroom renovation",
    "Kitchen renovation",
  ];

  const lines: string[] = [];
  for (const typeKey of templates) {
    const template = getScopeTemplateByWorkAreaType(typeKey);
    if (!template) continue;
    const keys = getAllFactsForTemplate(template).map((f) => f.key);
    lines.push(`${typeKey}: ${keys.join(", ")}`);
  }
  return lines.join("\n");
}

function mergeFacts(
  existing: ExtractedScopeFact[],
  incoming: ExtractedScopeFact[]
): ExtractedScopeFact[] {
  const byKey = new Map<string, ExtractedScopeFact>();
  for (const fact of existing) {
    byKey.set(fact.key, fact);
  }
  for (const fact of incoming) {
    const current = byKey.get(fact.key);
    if (!current || fact.confidence >= current.confidence) {
      byKey.set(fact.key, fact);
    }
  }
  return [...byKey.values()];
}

function inferMissingLikely(
  workAreaTypeKey: string,
  facts: ExtractedScopeFact[]
): string[] {
  const template = getScopeTemplateByWorkAreaType(workAreaTypeKey);
  if (!template) return [];

  const knownKeys = new Set(facts.map((f) => f.key));
  const answers: Record<string, string> = {};
  for (const fact of facts) {
    answers[fact.key] = fact.value;
  }
  const inferred = applyInferredFacts(answers);

  const missing: string[] = [];
  for (const factDef of getAllFactsForTemplate(template)) {
    if (!factDef.required) continue;
    if (knownKeys.has(factDef.key)) continue;
    if (inferred[factDef.key]) continue;
    missing.push(factDef.key);
  }

  return missing;
}

function buildAiExtractionPrompt(
  userMessage: string,
  deterministic: ProjectScopeFactsResult
): string {
  return `Extract structured scope facts from this contractor job description.

USER MESSAGE:
${userMessage}

KNOWN WORK AREAS (deterministic):
${JSON.stringify(deterministic.workAreas, null, 2)}

SUPPORTED FACT KEYS PER SCOPE:
${buildSupportedFactKeys()}

RULES:
- Map facts to exact template keys (e.g. deck.area_m2, fence.height_m, retaining_wall.material).
- Do not store free-text notes when a template key exists.
- Use numeric values without units in value field; put units in unit field.
- Return only JSON matching the schema.
- Merge with deterministic facts — do not remove high-confidence deterministic values.`;
}

export async function enrichProjectScopeFactsWithAi(
  userMessage: string,
  deterministic: ProjectScopeFactsResult
): Promise<ProjectScopeFactsResult> {
  const openai = getOpenAiClient();
  if (!openai) return deterministic;

  const response = await openai.responses.create({
    model: getOpenAiDiscoveryModel(),
    input: buildAiExtractionPrompt(userMessage, deterministic),
    text: {
      format: {
        type: "json_schema",
        name: "project_scope_facts",
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            workAreas: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  scopeTypeKey: { type: "string" },
                  label: { type: "string" },
                  confidence: { type: "number" },
                  facts: {
                    type: "array",
                    items: {
                      type: "object",
                      additionalProperties: false,
                      properties: {
                        key: { type: "string" },
                        value: { type: "string" },
                        unit: { type: "string" },
                        confidence: { type: "number" },
                        sourceText: { type: "string" },
                      },
                      required: ["key", "value", "confidence"],
                    },
                  },
                  assumptions: { type: "array", items: { type: "string" } },
                  missingLikely: { type: "array", items: { type: "string" } },
                },
                required: [
                  "scopeTypeKey",
                  "label",
                  "confidence",
                  "facts",
                  "assumptions",
                  "missingLikely",
                ],
              },
            },
            globalFacts: {
              type: "object",
              additionalProperties: false,
              properties: {
                qualityLevel: {
                  type: "string",
                  enum: ["budget", "standard", "premium", "unknown"],
                },
                constraints: { type: "array", items: { type: "string" } },
                notes: { type: "array", items: { type: "string" } },
              },
              required: ["constraints", "notes"],
            },
          },
          required: ["workAreas", "globalFacts"],
        },
        strict: true,
      },
    },
  });

  const raw = response.output_text?.trim();
  if (!raw) return deterministic;

  const parsed = projectScopeFactsSchema.safeParse(JSON.parse(raw));
  if (!parsed.success) return deterministic;

  const mergedAreas = parsed.data.workAreas.map((area) => {
    const detArea = deterministic.workAreas.find(
      (d) => d.scopeTypeKey === area.scopeTypeKey
    );
    const facts = mergeFacts(detArea?.facts ?? [], area.facts);
    const inferred = applyInferredFacts(
      Object.fromEntries(facts.map((f) => [f.key, f.value]))
    );
    for (const [key, value] of Object.entries(inferred)) {
      if (!facts.some((f) => f.key === key)) {
        facts.push({ key, value, confidence: 0.8, sourceText: "inferred" });
      }
    }
    return {
      ...area,
      facts,
      missingLikely: inferMissingLikely(area.scopeTypeKey, facts),
    };
  });

  const mergedWorkAreas =
    mergedAreas.length > 0 ? mergedAreas : deterministic.workAreas;

  return projectScopeFactsSchema.parse({
    workAreas: mergedWorkAreas,
    globalFacts: {
      qualityLevel:
        parsed.data.globalFacts.qualityLevel ??
        deterministic.globalFacts.qualityLevel,
      constraints: [
        ...new Set([
          ...deterministic.globalFacts.constraints,
          ...parsed.data.globalFacts.constraints,
        ]),
      ],
      notes: deterministic.globalFacts.notes,
    },
  });
}
