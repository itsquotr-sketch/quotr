import { bathroomRenovationTemplate } from "@/lib/scope-templates/bathroom-renovation";
import { deckTemplate } from "@/lib/scope-templates/deck";
import { retainingWallTemplate } from "@/lib/scope-templates/retaining-wall";
import { UNIVERSAL_TEMPLATE_CONSTRAINTS } from "@/lib/scope-templates/shared";
import type {
  MatchedScopeTemplate,
  ScopeTemplate,
  ScopeTemplateConstraint,
  ScopeTemplateQuestion,
} from "@/lib/scope-templates/types";
import type { ScopeQuestionDef } from "@/lib/project-assistant-questions";
import type { AssistantConstraint } from "@/lib/project-assistant-constraints";
import { normalizeQuestionKey } from "@/lib/question-keys";

export type {
  ScopeTemplate,
  ScopeTemplateQuestion,
  ScopeTemplateFact,
  ScopeTemplateConstraint,
  ScopeTemplateBenchmarkRates,
  ScopeTemplateEstimateRules,
  MatchedScopeTemplate,
} from "@/lib/scope-templates/types";

export { deckTemplate, retainingWallTemplate, bathroomRenovationTemplate };

const ALL_TEMPLATES: ScopeTemplate[] = [
  bathroomRenovationTemplate,
  deckTemplate,
  retainingWallTemplate,
];

const templateByKey = new Map(ALL_TEMPLATES.map((t) => [t.key, t]));
const templateByWorkAreaType = new Map(
  ALL_TEMPLATES.map((t) => [t.workAreaTypeKey, t])
);

export function getAllScopeTemplates(): ScopeTemplate[] {
  return ALL_TEMPLATES;
}

export function getScopeTemplate(key: string): ScopeTemplate | undefined {
  return templateByKey.get(key);
}

export function getScopeTemplateByWorkAreaType(
  workAreaTypeKey: string
): ScopeTemplate | undefined {
  return templateByWorkAreaType.get(workAreaTypeKey);
}

export function getScopeTemplateByAlias(text: string): ScopeTemplate | undefined {
  const normalised = text.toLowerCase().replace(/\s+/g, " ").trim();
  for (const template of ALL_TEMPLATES) {
    if (template.aliases.some((alias) => normalised.includes(alias))) {
      return template;
    }
  }
  return undefined;
}

function findMatchedKeywords(content: string, aliases: string[]): string[] {
  const normalised = content.toLowerCase().replace(/\s+/g, " ").trim();
  return aliases.filter((alias) => normalised.includes(alias));
}

function computeMatchConfidence(
  matchCount: number,
  aliasCount: number
): number {
  if (matchCount === 0) return 0.35;
  const ratio = matchCount / aliasCount;
  return Math.min(0.95, Math.round((0.45 + ratio * 0.5) * 100) / 100);
}

export function matchTemplatesFromNotes(
  content: string
): MatchedScopeTemplate[] {
  const trimmed = content.trim();
  if (!trimmed) return [];

  const matches: MatchedScopeTemplate[] = [];

  for (const template of ALL_TEMPLATES) {
    const matchedKeywords = findMatchedKeywords(trimmed, template.aliases);
    if (matchedKeywords.length === 0) continue;

    matches.push({
      template,
      confidence: computeMatchConfidence(
        matchedKeywords.length,
        template.aliases.length
      ),
      matchedKeywords,
      suggestedName: template.name,
      locationArea:
        template.category === "Outdoor"
          ? "Outdoor"
          : template.category === "Interior"
            ? template.name
            : null,
    });
  }

  return matches.sort((a, b) => b.confidence - a.confidence);
}

export function templateQuestionToDef(
  question: ScopeTemplateQuestion
): ScopeQuestionDef {
  return {
    key: question.questionKey,
    text: question.label,
    inputType: question.type,
    options: question.options,
    unit: question.unit,
    placeholder: question.placeholder,
  };
}

export function getTemplateQuestionDefs(
  workAreaTypeKey: string
): ScopeQuestionDef[] {
  const template = getScopeTemplateByWorkAreaType(workAreaTypeKey);
  if (!template) return [];
  return template.questions.map(templateQuestionToDef);
}

export function getTemplateRequiredQuestionKeys(
  workAreaTypeKey: string
): string[] {
  const template = getScopeTemplateByWorkAreaType(workAreaTypeKey);
  if (!template) return [];
  return template.questions.filter((q) => q.required).map((q) => q.questionKey);
}

export function isTemplateRequiredQuestion(
  workAreaTypeKey: string,
  questionKey: string | null | undefined
): boolean {
  const key = normalizeQuestionKey(questionKey);
  if (!key) return false;
  return getTemplateRequiredQuestionKeys(workAreaTypeKey).includes(key);
}

function templateConstraintToAssistant(
  constraint: ScopeTemplateConstraint
): AssistantConstraint {
  return {
    slug: constraint.slug,
    label: constraint.label,
    driverSlug: constraint.driverSlug,
    hideWhenQuestionAnswered: constraint.hideWhenQuestionAnswered,
    universal: constraint.universal,
    followUp: constraint.followUp,
    workAreaTypes: constraint.universal ? undefined : [],
  };
}

export function getTemplateConstraintsForWorkAreas(
  workAreaTypeKeys: string[]
): AssistantConstraint[] {
  const types = new Set(workAreaTypeKeys);
  const constraints: AssistantConstraint[] = [];
  const seen = new Set<string>();

  for (const universal of UNIVERSAL_TEMPLATE_CONSTRAINTS) {
    if (seen.has(universal.slug)) continue;
    seen.add(universal.slug);
    constraints.push(templateConstraintToAssistant(universal));
  }

  for (const template of ALL_TEMPLATES) {
    if (!types.has(template.workAreaTypeKey)) continue;
    for (const constraint of template.constraints) {
      if (seen.has(constraint.slug)) continue;
      seen.add(constraint.slug);
      constraints.push({
        ...templateConstraintToAssistant(constraint),
        workAreaTypes: [template.workAreaTypeKey],
      });
    }
  }

  return constraints;
}

export function getTemplateTradesForWorkArea(workAreaTypeKey: string): string[] {
  return getScopeTemplateByWorkAreaType(workAreaTypeKey)?.likelyTrades ?? [];
}

export function getAllFactsForTemplate(template: ScopeTemplate) {
  return [...template.requiredFacts, ...template.optionalFacts];
}
