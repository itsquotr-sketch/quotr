import type {
  DiscoveryConstraint,
  DiscoveryFact,
  DiscoveryQuestion,
  DiscoveryTrade,
  DiscoveryWorkArea,
} from "@/lib/ai/discovery/types";
import {
  getAllFactsForTemplate,
  getScopeTemplateByWorkAreaType,
  matchTemplatesFromNotes,
  templateQuestionToDef,
} from "@/lib/scope-templates";
import { extractConstraintsFromNotes } from "@/lib/ai/discovery/constraint-rules";
import { deriveAdditionalFacts } from "@/lib/scopes/derive-facts";
import { normalizeQuestionKey } from "@/lib/question-keys";

function buildDescription(
  templateName: string,
  matchedKeywords: string[]
): string {
  return `Suggested from your project notes based on mentions of: ${matchedKeywords.join(", ")}. Review this ${templateName.toLowerCase()} scope before accepting.`;
}

export function matchWorkAreasFromTemplates(
  sourceNotes: string
): DiscoveryWorkArea[] {
  return matchTemplatesFromNotes(sourceNotes).map((match) => ({
    typeKey: match.template.workAreaTypeKey,
    name: match.suggestedName,
    description: buildDescription(
      match.template.name,
      match.matchedKeywords
    ),
    locationArea: match.locationArea,
    confidence: match.confidence,
    matchedKeywords: match.matchedKeywords,
  }));
}

export function extractFactsFromTemplates(
  sourceNotes: string
): DiscoveryFact[] {
  const text = sourceNotes.trim();
  if (!text) return [];

  const facts: DiscoveryFact[] = [];
  const seen = new Set<string>();

  for (const match of matchTemplatesFromNotes(text)) {
    for (const factDef of getAllFactsForTemplate(match.template)) {
      if (!factDef.extractionPatterns?.length) continue;

      for (const pattern of factDef.extractionPatterns) {
        const patternMatch = text.match(pattern);
        if (!patternMatch) continue;

        const rawValue = factDef.extractValue?.(patternMatch) ?? null;
        if (!rawValue) continue;

        const canonicalKey = normalizeQuestionKey(factDef.key) ?? factDef.key;
        const dedupeKey = `${canonicalKey}:${rawValue}`;
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);

        const displayValue =
          factDef.unit && /^\d/.test(rawValue)
            ? `${rawValue} ${factDef.unit}`
            : rawValue;

        facts.push({
          key: canonicalKey,
          label: factDef.label,
          value: displayValue,
          unit: factDef.unit,
          workAreaTypeKey: match.template.workAreaTypeKey,
          source: "notes",
          confidence: 0.75,
        });
        break;
      }
    }
  }

  for (const derivedFact of deriveAdditionalFacts(facts)) {
    const canonicalKey =
      normalizeQuestionKey(derivedFact.key) ?? derivedFact.key;
    if (facts.some((f) => (normalizeQuestionKey(f.key) ?? f.key) === canonicalKey)) {
      continue;
    }

    const displayValue =
      derivedFact.unit && /^\d/.test(derivedFact.value)
        ? `${derivedFact.value} ${derivedFact.unit}`
        : derivedFact.value;
    const dedupeKey = `${canonicalKey}:${displayValue}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    facts.push({
      ...derivedFact,
      key: canonicalKey,
      value: displayValue,
    });
  }

  return facts;
}

function factKeysFromDiscovery(facts: DiscoveryFact[]): Set<string> {
  return new Set(
    facts
      .filter((f) => f.confidence >= 0.7)
      .map((f) => normalizeQuestionKey(f.key) ?? f.key)
  );
}

export function buildQuestionsFromTemplates(
  workAreas: DiscoveryWorkArea[],
  extractedFacts: DiscoveryFact[]
): DiscoveryQuestion[] {
  const knownFactKeys = factKeysFromDiscovery(extractedFacts);
  const questions: DiscoveryQuestion[] = [];

  for (const area of workAreas) {
    const template = getScopeTemplateByWorkAreaType(area.typeKey);
    if (!template) continue;

    for (const question of template.questions) {
      const key = normalizeQuestionKey(question.questionKey) ?? question.questionKey;
      if (knownFactKeys.has(key)) continue;

      const def = templateQuestionToDef(question);
      questions.push({
        key: question.questionKey,
        text: def.text,
        workAreaTypeKey: area.typeKey,
        workAreaName: area.name,
        inputType: question.type,
        unit: question.unit,
      });
    }
  }

  return questions;
}

export function buildTradesFromTemplates(
  workAreas: DiscoveryWorkArea[]
): DiscoveryTrade[] {
  const trades: DiscoveryTrade[] = [];
  const seen = new Set<string>();

  for (const area of workAreas) {
    const template = getScopeTemplateByWorkAreaType(area.typeKey);
    if (!template) continue;

    for (const name of template.likelyTrades) {
      const key = `${area.typeKey}:${name}`;
      if (seen.has(key)) continue;
      seen.add(key);
      trades.push({ name, workAreaTypeKey: area.typeKey });
    }
  }

  return trades;
}

export function buildConstraintsFromTemplates(
  workAreas: DiscoveryWorkArea[],
  sourceNotes: string
): DiscoveryConstraint[] {
  const fromNotes = extractConstraintsFromNotes(sourceNotes);
  const workAreaTypeKeys = workAreas.map((w) => w.typeKey);
  const seen = new Set(fromNotes.map((c) => c.slug));

  for (const typeKey of workAreaTypeKeys) {
    const template = getScopeTemplateByWorkAreaType(typeKey);
    if (!template) continue;

    for (const constraint of template.constraints) {
      if (seen.has(constraint.slug)) continue;
      // Template constraints are suggestions — only add if mentioned in notes
      // for scope-specific ones; universal handled by constraint-rules
    }
  }

  return fromNotes;
}
