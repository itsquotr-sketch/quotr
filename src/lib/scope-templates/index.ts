import {
  getAllScopeTemplates as getScopesAsTemplates,
  getScopeByAlias,
  getScopeTemplate as getScopeTemplateFromScopes,
  getScopeTemplateByWorkAreaType as getScopeTemplateByWorkAreaTypeFromScopes,
  matchScopesFromNotes,
} from "@/lib/scopes";
import { UNIVERSAL_SCOPE_CONSTRAINTS } from "@/lib/scopes/shared";
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

import { bathroomRenovationScope } from "@/lib/scopes/bathroom-renovation";
import { deckScope } from "@/lib/scopes/deck";
import { retainingWallScope } from "@/lib/scopes/retaining-wall";
import { scopeToTemplate } from "@/lib/scopes/to-template";

export const deckTemplate = scopeToTemplate(deckScope);
export const retainingWallTemplate = scopeToTemplate(retainingWallScope);
export const bathroomRenovationTemplate = scopeToTemplate(bathroomRenovationScope);

export function getAllScopeTemplates(): ScopeTemplate[] {
  return getScopesAsTemplates();
}

export function getScopeTemplate(key: string): ScopeTemplate | undefined {
  return getScopeTemplateFromScopes(key);
}

export function getScopeTemplateByWorkAreaType(
  workAreaTypeKey: string
): ScopeTemplate | undefined {
  return getScopeTemplateByWorkAreaTypeFromScopes(workAreaTypeKey);
}

export function getScopeTemplateByAlias(text: string): ScopeTemplate | undefined {
  const scope = getScopeByAlias(text);
  return scope ? getScopeTemplateFromScopes(scope.id) : undefined;
}

export function matchTemplatesFromNotes(
  content: string
): MatchedScopeTemplate[] {
  return matchScopesFromNotes(content).map((match) => ({
    template: getScopeTemplateFromScopes(match.scope.id)!,
    confidence: match.confidence,
    matchedKeywords: match.matchedKeywords,
    suggestedName: match.suggestedName,
    locationArea: match.locationArea,
  }));
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

export function isTemplateAffectsEstimateQuestion(
  workAreaTypeKey: string,
  questionKey: string | null | undefined
): boolean {
  const key = normalizeQuestionKey(questionKey);
  if (!key) return true;
  const template = getScopeTemplateByWorkAreaType(workAreaTypeKey);
  if (!template) return true;
  const question = template.questions.find((q) => q.questionKey === key);
  return question?.affectsEstimate ?? true;
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

  for (const universal of UNIVERSAL_SCOPE_CONSTRAINTS) {
    if (seen.has(universal.slug)) continue;
    seen.add(universal.slug);
    constraints.push(templateConstraintToAssistant(universal));
  }

  for (const template of getAllScopeTemplates()) {
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
