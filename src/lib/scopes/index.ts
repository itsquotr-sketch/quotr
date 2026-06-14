import { bathroomRenovationScope } from "@/lib/scopes/bathroom-renovation";
import { deckScope } from "@/lib/scopes/deck";
import { retainingWallScope } from "@/lib/scopes/retaining-wall";
import { UNIVERSAL_SCOPE_CONSTRAINTS } from "@/lib/scopes/shared";
import { scopeToTemplate } from "@/lib/scopes/to-template";
import type { MatchedScope, ScopeDefinition } from "@/lib/scopes/types";
import type { ScopeTemplate } from "@/lib/scope-templates/types";

export type {
  ScopeDefinition,
  ScopeFactDefinition,
  ScopeConstraintDefinition,
  ScopeBenchmarkRates,
  ScopeConfidenceRules,
  MatchedScope,
} from "@/lib/scopes/types";

export {
  deckScope,
  retainingWallScope,
  bathroomRenovationScope,
  UNIVERSAL_SCOPE_CONSTRAINTS,
};

export {
  buildScopeMissingLabels,
  buildScopeTightenLabels,
  getKnownFactsForScope,
  getMissingRequiredFacts,
  getMissingOptionalHighImpact,
  questionKeyMatchesScopeFact,
  isScopeSupportedWorkArea,
  isFactKnownForScope,
  factIsAnswered,
} from "@/lib/scopes/missing-facts";

export {
  resolveEstimateQualityLevel,
  buildScopeQualityFactors,
} from "@/lib/scopes/confidence";

export { scopeToTemplate } from "@/lib/scopes/to-template";

export {
  ALL_CANONICAL_SCOPE_TEMPLATES,
  getCanonicalScopeTemplate,
  getCanonicalScopeTemplateByWorkAreaType,
  getCanonicalTemplateByAlias,
  isPricingSupportedScope,
  isPricingSupportedWorkAreaType,
  UNSUPPORTED_SCOPE_PRICING_MESSAGE,
} from "@/lib/scopes/templates";

const ALL_SCOPES: ScopeDefinition[] = [
  bathroomRenovationScope,
  deckScope,
  retainingWallScope,
];

const scopeById = new Map(ALL_SCOPES.map((s) => [s.id, s]));
const scopeByWorkAreaType = new Map(
  ALL_SCOPES.map((s) => [s.workAreaTypeKey, s])
);

export function getAllScopes(): ScopeDefinition[] {
  return ALL_SCOPES;
}

export function getScopeById(id: string): ScopeDefinition | undefined {
  return scopeById.get(id);
}

export function getScopeByWorkAreaType(
  workAreaTypeKey: string
): ScopeDefinition | undefined {
  return scopeByWorkAreaType.get(workAreaTypeKey);
}

export function getScopeByAlias(text: string): ScopeDefinition | undefined {
  const normalised = text.toLowerCase().replace(/\s+/g, " ").trim();
  for (const scope of ALL_SCOPES) {
    if (scope.aliases.some((alias) => normalised.includes(alias))) {
      return scope;
    }
  }
  return undefined;
}

export function getAllFactsForScope(scope: ScopeDefinition) {
  return [...scope.requiredFacts, ...scope.optionalFacts];
}

export function getAllScopeTemplates(): ScopeTemplate[] {
  return ALL_SCOPES.map(scopeToTemplate);
}

export function getScopeTemplateByWorkAreaType(
  workAreaTypeKey: string
): ScopeTemplate | undefined {
  const scope = getScopeByWorkAreaType(workAreaTypeKey);
  return scope ? scopeToTemplate(scope) : undefined;
}

export function getScopeTemplate(key: string): ScopeTemplate | undefined {
  const scope = getScopeById(key);
  return scope ? scopeToTemplate(scope) : undefined;
}

function findMatchedKeywords(content: string, aliases: string[]): string[] {
  const normalised = content.toLowerCase().replace(/\s+/g, " ").trim();
  return aliases.filter((alias) => normalised.includes(alias));
}

export function matchScopesFromNotes(content: string): MatchedScope[] {
  const trimmed = content.trim();
  if (!trimmed) return [];

  const matches: MatchedScope[] = [];

  for (const scope of ALL_SCOPES) {
    const matchedKeywords = findMatchedKeywords(trimmed, scope.aliases);
    if (matchedKeywords.length === 0) continue;

    const ratio = matchedKeywords.length / scope.aliases.length;
    matches.push({
      scope,
      confidence: Math.min(0.95, Math.round((0.45 + ratio * 0.5) * 100) / 100),
      matchedKeywords,
      suggestedName: scope.name,
      locationArea:
        scope.category === "Outdoor"
          ? "Outdoor"
          : scope.category === "Interior"
            ? scope.name
            : null,
    });
  }

  return matches.sort((a, b) => b.confidence - a.confidence);
}
