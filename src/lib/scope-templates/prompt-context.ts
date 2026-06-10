import { getAllScopeTemplates } from "@/lib/scope-templates";

function formatQuestionList(
  questions: { questionKey: string; label: string; required: boolean; affectsEstimate: boolean }[]
): string {
  return questions
    .map(
      (q) =>
        `${q.questionKey} (${q.required ? "required" : "optional"}, ${q.affectsEstimate ? "affects estimate" : "informational"}): ${q.label}`
    )
    .join("; ");
}

export function buildTemplatePromptContext(): string {
  const templates = getAllScopeTemplates();

  const summaries = templates.map((template) => {
    const requiredFacts = template.requiredFacts
      .map((f) => `${f.key}${f.unit ? ` (${f.unit})` : ""}`)
      .join(", ");
    const optionalFacts = template.optionalFacts
      .map((f) => f.key)
      .join(", ");
    const constraintKeys = [
      ...template.constraints.map((c) => c.key),
    ].join(", ");
    const trades = template.likelyTrades.join(", ");
    const rates = template.benchmarkRates;
    const questions = formatQuestionList(template.questions);

    return `TEMPLATE: ${template.key}
  name: ${template.name}
  workAreaTypeKey: ${template.workAreaTypeKey}
  aliases: ${template.aliases.join(", ")}
  requiredFacts: ${requiredFacts || "none"}
  optionalFacts: ${optionalFacts || "none"}
  commonQuestions: ${questions}
  likelyTrades: ${trades}
  benchmarkRates: low $${rates.low}/${rates.unit}, typical $${rates.typical}/${rates.unit}, high $${rates.high}/${rates.unit}
  commonConstraints: ${constraintKeys || "see universal constraints"}
  estimateRequiredKeys: ${template.estimateRules.requiredFactKeys.join(", ")}`;
  });

  return `SUPPORTED SCOPE TEMPLATES — map notes to these where possible:
${summaries.join("\n\n")}

UNIVERSAL CONSTRAINTS (site-wide):
tight_access, poor_parking, occupied_house, restricted_working_hours, urgent_turnaround, long_carting_distance

TEMPLATE RULES:
- Match work areas to template keys (bathroom_renovation, deck, retaining_wall) when notes fit.
- Extract dimensions and selections as facts using the keys above.
- If no template matches, use type "custom_scope" and explain what is missing.
- Only ask questions for facts not already extracted with confidence >= 0.7.
- Never invent pricing. Never invent measurements.
- Return templateKey on each work area when matched.`;
}
