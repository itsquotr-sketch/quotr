import { getAllScopeTemplates } from "@/lib/scope-templates";

export function buildTemplatePromptContext(): string {
  const templates = getAllScopeTemplates();

  const summaries = templates.map((template) => {
    const requiredFacts = template.requiredFacts.map((f) => f.key).join(", ");
    const questionKeys = template.questions.map((q) => q.questionKey).join(", ");
    const constraintKeys = template.constraints.map((c) => c.key).join(", ");
    const trades = template.likelyTrades.join(", ");

    return `TEMPLATE: ${template.key}
  name: ${template.name}
  workAreaTypeKey: ${template.workAreaTypeKey}
  aliases: ${template.aliases.join(", ")}
  requiredFacts: ${requiredFacts || "none"}
  questionKeys: ${questionKeys}
  constraintKeys: ${constraintKeys}
  likelyTrades: ${trades}`;
  });

  return `SUPPORTED SCOPE TEMPLATES (use these where possible):
${summaries.join("\n\n")}

RULES:
- Match work areas to template keys (bathroom_renovation, deck, retaining_wall) when notes fit.
- If no template matches, use type "custom_scope" and explain what is missing.
- Only extract facts using keys defined in the matched template.
- Only ask questions for facts not already extracted with confidence >= 0.7.
- Never invent pricing. Never invent measurements.
- Return templateKey on each work area when matched.`;
}
