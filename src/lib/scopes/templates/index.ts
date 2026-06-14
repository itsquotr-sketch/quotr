import { bathroomRenovationScopeTemplate } from "@/lib/scopes/templates/bathroom-renovation";
import { deckScopeTemplate } from "@/lib/scopes/templates/deck";
import { retainingWallScopeTemplate } from "@/lib/scopes/templates/retaining-wall";
import {
  fenceScopeTemplate,
  flooringScopeTemplate,
  kitchenRenovationScopeTemplate,
  paintingScopeTemplate,
} from "@/lib/scopes/templates/stubs";
import type { MatchedScopeTemplate, ScopeTemplate } from "@/lib/scopes/templates/types";
import { assertValidScopeTemplate } from "@/lib/scopes/templates/validate-scope-template";

export type {
  ScopeTemplate,
  ScopeCategory,
  ScopePricingMode,
  CanonicalScopeFactDefinition,
  ScopeComponentDefinition,
  ScopeAllocations,
  MatchedScopeTemplate,
} from "@/lib/scopes/templates/types";

export {
  deckScopeTemplate,
  bathroomRenovationScopeTemplate,
  retainingWallScopeTemplate,
  fenceScopeTemplate,
  paintingScopeTemplate,
  kitchenRenovationScopeTemplate,
  flooringScopeTemplate,
};

export {
  validateScopeTemplate,
  assertValidScopeTemplate,
  validateAllScopeTemplates,
} from "@/lib/scopes/templates/validate-scope-template";

/** All registered canonical scope templates (priced + stubs). */
export const ALL_CANONICAL_SCOPE_TEMPLATES: ScopeTemplate[] = [
  deckScopeTemplate,
  bathroomRenovationScopeTemplate,
  retainingWallScopeTemplate,
  fenceScopeTemplate,
  paintingScopeTemplate,
  kitchenRenovationScopeTemplate,
  flooringScopeTemplate,
];

/** Templates with pricing support enabled. */
export const PRICED_SCOPE_TEMPLATES: ScopeTemplate[] =
  ALL_CANONICAL_SCOPE_TEMPLATES.filter((t) => t.pricing.supported);

const byScopeTypeKey = new Map(
  ALL_CANONICAL_SCOPE_TEMPLATES.map((t) => [t.scopeTypeKey, t])
);
const byWorkAreaTypeKey = new Map(
  ALL_CANONICAL_SCOPE_TEMPLATES.map((t) => [t.workAreaTypeKey, t])
);

// Validate priced templates at module load in development
if (process.env.NODE_ENV !== "production") {
  for (const template of ALL_CANONICAL_SCOPE_TEMPLATES) {
    assertValidScopeTemplate(template);
  }
}

export function getCanonicalScopeTemplate(
  scopeTypeKey: string
): ScopeTemplate | undefined {
  return byScopeTypeKey.get(scopeTypeKey);
}

export function getCanonicalScopeTemplateByWorkAreaType(
  workAreaTypeKey: string
): ScopeTemplate | undefined {
  return byWorkAreaTypeKey.get(workAreaTypeKey);
}

export function isPricingSupportedScope(scopeTypeKey: string): boolean {
  const template = getCanonicalScopeTemplate(scopeTypeKey);
  return template?.pricing.supported === true;
}

export function isPricingSupportedWorkAreaType(
  workAreaTypeKey: string
): boolean {
  const template = getCanonicalScopeTemplateByWorkAreaType(workAreaTypeKey);
  if (template) return template.pricing.supported;
  return false;
}

export function getTemplateAllocations(
  workAreaTypeKey: string
): ScopeTemplate["pricing"]["defaultAllocations"] | null {
  const template = getCanonicalScopeTemplateByWorkAreaType(workAreaTypeKey);
  return template?.pricing.defaultAllocations ?? null;
}

function findMatchedKeywords(content: string, aliases: string[]): string[] {
  const normalised = content.toLowerCase().replace(/\s+/g, " ").trim();
  return aliases.filter((alias) => normalised.includes(alias));
}

export function matchCanonicalTemplatesFromNotes(
  content: string
): MatchedScopeTemplate[] {
  const trimmed = content.trim();
  if (!trimmed) return [];

  const matches: MatchedScopeTemplate[] = [];

  for (const template of ALL_CANONICAL_SCOPE_TEMPLATES) {
    const matchedKeywords = findMatchedKeywords(trimmed, template.aliases);
    if (matchedKeywords.length === 0) continue;

    const ratio = matchedKeywords.length / template.aliases.length;
    matches.push({
      template,
      confidence: Math.min(0.95, Math.round((0.45 + ratio * 0.5) * 100) / 100),
      matchedKeywords,
    });
  }

  return matches.sort((a, b) => b.confidence - a.confidence);
}

export function getCanonicalTemplateByAlias(
  text: string
): ScopeTemplate | undefined {
  const normalised = text.toLowerCase().replace(/\s+/g, " ").trim();
  for (const template of ALL_CANONICAL_SCOPE_TEMPLATES) {
    if (template.aliases.some((alias) => normalised.includes(alias))) {
      return template;
    }
    if (normalised === template.label.toLowerCase()) {
      return template;
    }
    if (normalised === template.workAreaTypeKey.toLowerCase()) {
      return template;
    }
  }
  return undefined;
}

export const UNSUPPORTED_SCOPE_PRICING_MESSAGE =
  "I can track this scope, but pricing support is not ready yet.";
