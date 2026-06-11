import type { ScopeDefinition, ScopeFactDefinition } from "@/lib/scopes/types";
import type {
  ScopeTemplate,
  ScopeTemplateConstraint,
  ScopeTemplateFact,
  ScopeTemplateQuestion,
} from "@/lib/scope-templates/types";

function factToTemplateFact(fact: ScopeFactDefinition): ScopeTemplateFact {
  return {
    key: fact.key,
    label: fact.label,
    unit: fact.unit,
    required: fact.required,
    extractionPatterns: fact.extractionPatterns,
    extractValue: fact.extractValue,
  };
}

function factToTemplateQuestion(fact: ScopeFactDefinition): ScopeTemplateQuestion {
  return {
    questionKey: fact.key,
    label: fact.questionText,
    type: fact.type === "boolean" ? "select" : fact.type,
    unit: fact.unit,
    required: fact.required,
    affectsEstimate: fact.affectsEstimate,
    options: fact.options,
    placeholder: fact.placeholder,
    helpText: fact.helpText,
  };
}

export function scopeToTemplate(scope: ScopeDefinition): ScopeTemplate {
  const allFacts = [...scope.requiredFacts, ...scope.optionalFacts];

  return {
    key: scope.id,
    name: scope.name,
    workAreaTypeKey: scope.workAreaTypeKey,
    category: scope.category,
    aliases: scope.aliases,
    description: scope.description,
    requiredFacts: scope.requiredFacts.map(factToTemplateFact),
    optionalFacts: scope.optionalFacts.map(factToTemplateFact),
    questions: allFacts
      .filter((f) => f.affectsEstimate || f.affectsConfidence || f.required)
      .map(factToTemplateQuestion),
    constraints: scope.constraints.map(
      (c): ScopeTemplateConstraint => ({
        key: c.key,
        label: c.questionText,
        slug: c.slug,
        driverSlug: c.driverSlug,
        hideWhenQuestionAnswered: c.hideWhenFactAnswered,
        universal: c.universal,
        followUp: c.followUp,
      })
    ),
    likelyTrades: scope.likelyTrades,
    benchmarkRates: scope.benchmarkRates,
    estimateRules: {
      calculationType: scope.estimateRules.calculationType,
      requiredFactKeys: scope.estimateRules.requiredFactKeys,
      lowMultiplier: 0.88,
      highMultiplier: 1.22,
      layoutChangeModifier: scope.estimateRules.layoutChangeModifier,
      elevatedModifier: scope.estimateRules.elevatedModifier,
    },
  };
}
