import { extractFactsFromNotes } from "@/lib/ai/discovery/fact-rules";
import type {
  DiscoveryFact,
  DiscoveryQuestion,
  DiscoveryResult,
  DiscoveryTrade,
  DiscoveryWorkArea,
} from "@/lib/ai/discovery/types";
import { applyClassificationToDiscoveryResult } from "@/lib/scopes/classification/process-discovery-items";
import {
  getQuestionDefsForWorkAreaType,
  questionTextFromDef,
} from "@/lib/project-assistant-questions";
import { getTradesForWorkAreaType } from "@/lib/project-assistant-trades";
import { generateScopeSuggestionsFromNotes } from "@/lib/scope-suggestion-rules";
import {
  buildConstraintsFromTemplates,
  buildQuestionsFromTemplates,
  buildTradesFromTemplates,
} from "@/lib/scope-templates/discovery";
import { getAllScopeTemplates } from "@/lib/scope-templates";

export const RULE_BASED_DISCOVERY_VERSION = "1.0.0";

export interface RuleBasedDiscoveryProvider {
  readonly id: string;
  readonly version: string;
  discoverProject(sourceNotes: string): DiscoveryResult;
}

function mapWorkAreas(sourceNotes: string): DiscoveryWorkArea[] {
  return generateScopeSuggestionsFromNotes(sourceNotes).map((s) => ({
    typeKey: s.suggestedScopeType,
    name: s.suggestedName,
    description: s.suggestedDescription,
    locationArea: s.suggestedLocationArea,
    confidence: s.confidence,
    matchedKeywords: s.matchedKeywords,
  }));
}

const TEMPLATE_WORK_AREA_TYPES = new Set(
  getAllScopeTemplates().map((t) => t.workAreaTypeKey)
);

function buildQuestionsForWorkAreas(
  workAreas: DiscoveryWorkArea[],
  facts: DiscoveryFact[]
): DiscoveryQuestion[] {
  const templateQuestions = buildQuestionsFromTemplates(workAreas, facts);
  const legacyQuestions: DiscoveryQuestion[] = [];

  for (const area of workAreas) {
    if (TEMPLATE_WORK_AREA_TYPES.has(area.typeKey)) continue;

    const defs = getQuestionDefsForWorkAreaType(area.typeKey);
    for (const def of defs) {
      legacyQuestions.push({
        key: def.key,
        text: questionTextFromDef(def),
        workAreaTypeKey: area.typeKey,
        workAreaName: area.name,
        inputType: def.inputType,
        unit: def.unit,
      });
    }
  }

  return [...templateQuestions, ...legacyQuestions];
}

function buildTradesForWorkAreas(
  workAreas: DiscoveryWorkArea[]
): DiscoveryTrade[] {
  const templateTrades = buildTradesFromTemplates(workAreas);
  const seen = new Set(templateTrades.map((t) => `${t.workAreaTypeKey}:${t.name}`));
  const trades = [...templateTrades];

  for (const area of workAreas) {
    if (TEMPLATE_WORK_AREA_TYPES.has(area.typeKey)) continue;

    for (const name of getTradesForWorkAreaType(area.typeKey)) {
      const key = `${area.typeKey}:${name}`;
      if (seen.has(key)) continue;
      seen.add(key);
      trades.push({ name, workAreaTypeKey: area.typeKey });
    }
  }

  return trades;
}

/**
 * Rule-based discovery — keyword matching and pattern extraction.
 */
export class RuleBasedDiscoveryCore implements RuleBasedDiscoveryProvider {
  readonly id = "rule-based";
  readonly version = RULE_BASED_DISCOVERY_VERSION;

  discoverProject(sourceNotes: string): DiscoveryResult {
    const trimmed = sourceNotes.trim();
    const rawWorkAreas = mapWorkAreas(trimmed);
    const { workAreas } = applyClassificationToDiscoveryResult(
      rawWorkAreas,
      trimmed
    );
    const facts = extractFactsFromNotes(trimmed);
    const constraints = buildConstraintsFromTemplates(workAreas, trimmed);
    const questions = buildQuestionsForWorkAreas(workAreas, facts);
    const trades = buildTradesForWorkAreas(workAreas);

    return { workAreas, facts, questions, constraints, trades };
  }
}

/** Build questions and trades from confirmed work area type keys. */
export function buildDiscoveryQuestionsAndTrades(
  workAreas: { typeKey: string; name: string }[]
): Pick<DiscoveryResult, "questions" | "trades"> {
  const asWorkAreas: DiscoveryWorkArea[] = workAreas.map((w) => ({
    typeKey: w.typeKey,
    name: w.name,
    description: "",
    locationArea: null,
    confidence: 1,
    matchedKeywords: [],
  }));

  return {
    questions: buildQuestionsForWorkAreas(asWorkAreas, []),
    trades: buildTradesForWorkAreas(asWorkAreas),
  };
}

export const ruleBasedDiscoveryProvider = new RuleBasedDiscoveryCore();
