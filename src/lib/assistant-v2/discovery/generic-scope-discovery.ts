import { getScopeByWorkAreaType } from "@/lib/scopes";
import { getCanonicalScopeTemplateByWorkAreaType } from "@/lib/scopes/templates";
import {
  getMaterialCategoriesForWorkArea,
  getMaterialCategoryOptions,
} from "@/lib/scopes/material-categories";
import type {
  CanonicalScopeFactDefinition,
  ScopeTemplate,
} from "@/lib/scopes/templates/types";
import type { ScopeQuestionDef } from "@/lib/project-assistant-questions";

const YES_NO_UNSURE = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
  { value: "unknown", label: "Not sure yet" },
] as const;

const FINISH_LEVEL_OPTIONS = [
  { value: "budget", label: "Budget" },
  { value: "standard", label: "Standard" },
  { value: "premium", label: "Premium" },
  { value: "unknown", label: "Not sure yet" },
] as const;

function slugifyScopeName(scopeName: string): string {
  return scopeName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 32) || "custom";
}

function canonicalFactToQuestionDef(
  fact: CanonicalScopeFactDefinition,
  template?: ScopeTemplate
): ScopeQuestionDef {
  const inputType =
    fact.type === "boolean" || fact.type === "select"
      ? "select"
      : fact.type === "number"
        ? "number"
        : "text";

  const materialConfig = template?.materialCategories;
  const isMaterialFact =
    materialConfig && materialConfig.factKey === fact.key;

  return {
    key: fact.key,
    text: isMaterialFact
      ? materialConfig.questionText
      : (fact.questionText ?? fact.label),
    inputType,
    unit: fact.unit,
    options:
      isMaterialFact
        ? getMaterialCategoryOptions(template!.scopeTypeKey)
        : (fact.options ??
          (inputType === "select" ? [...YES_NO_UNSURE] : undefined)),
    placeholder: fact.unit ? `e.g. 20` : undefined,
  };
}

function templateFactsToQuestionDefs(template: ScopeTemplate): ScopeQuestionDef[] {
  const defs: ScopeQuestionDef[] = [];

  for (const fact of template.facts.required) {
    defs.push(canonicalFactToQuestionDef(fact, template));
  }
  for (const fact of template.facts.useful) {
    defs.push(canonicalFactToQuestionDef(fact, template));
  }
  for (const fact of template.facts.optional) {
    defs.push(canonicalFactToQuestionDef(fact, template));
  }

  return defs;
}

/**
 * Tier 3 — generic discovery questions for unknown / custom work areas.
 * Every scope must have a discovery path.
 */
export function getGenericDiscoveryQuestionDefs(
  scopeName = "Custom Scope"
): ScopeQuestionDef[] {
  const prefix = slugifyScopeName(scopeName);

  return [
    {
      key: `${prefix}.primary_dimensions`,
      text: `What are the main dimensions for ${scopeName}?`,
      inputType: "text",
      placeholder: "e.g. 7m x 4m or 20m long",
    },
    {
      key: `${prefix}.material_type`,
      text: `What type of ${scopeName.toLowerCase()} should I assume?`,
      inputType: "text",
      placeholder: "e.g. timber, concrete, plasterboard",
    },
    {
      key: `${prefix}.finish_level`,
      text: `What finish level is expected for ${scopeName}?`,
      inputType: "select",
      options: [...FINISH_LEVEL_OPTIONS],
    },
    {
      key: "access_restrictions",
      text: "Is site access tight or restricted?",
      inputType: "select",
      options: [...YES_NO_UNSURE],
    },
    {
      key: "client_materials",
      text: "Is the client supplying materials?",
      inputType: "select",
      options: [...YES_NO_UNSURE],
    },
    {
      key: "demolition_required",
      text: "Is demolition or removal of existing work required?",
      inputType: "select",
      options: [...YES_NO_UNSURE],
    },
    {
      key: "site_constraints",
      text: "Are there site constraints to note (slope, neighbours, weather)?",
      inputType: "select",
      options: [...YES_NO_UNSURE],
    },
  ];
}

/**
 * Resolves discovery questions using Tier 1 → Tier 2 → Tier 3 fallback.
 */
export function getDiscoveryQuestionDefsForWorkArea(
  workAreaTypeKey: string,
  scopeName?: string
): ScopeQuestionDef[] {
  const canonical = getCanonicalScopeTemplateByWorkAreaType(workAreaTypeKey);
  if (canonical) {
    const fromTemplate = templateFactsToQuestionDefs(canonical);
    if (fromTemplate.length > 0) {
      return fromTemplate;
    }
  }

  const materialConfig = getMaterialCategoriesForWorkArea(workAreaTypeKey);
  if (materialConfig) {
    return getGenericDiscoveryQuestionDefs(scopeName ?? workAreaTypeKey).map(
      (def) =>
        def.key.includes("material")
          ? {
              ...def,
              text: materialConfig.questionText,
              inputType: "select" as const,
              options: getMaterialCategoryOptions(
                canonical?.scopeTypeKey ?? workAreaTypeKey.toLowerCase()
              ),
            }
          : def
    );
  }

  return getGenericDiscoveryQuestionDefs(scopeName ?? workAreaTypeKey);
}

export function canonicalFactToTrackableFact(
  fact: CanonicalScopeFactDefinition,
  importance: "critical" | "useful" | "optional"
): {
  key: string;
  label: string;
  type: "number" | "select" | "boolean" | "text";
  unit?: string;
  required: boolean;
  affectsEstimate: boolean;
  affectsConfidence: boolean;
  options?: { value: string; label: string }[];
} {
  return {
    key: fact.key,
    label: fact.label,
    type: fact.type ?? "text",
    unit: fact.unit,
    required: importance === "critical",
    affectsEstimate: fact.affectsEstimate ?? importance !== "optional",
    affectsConfidence: fact.affectsConfidence ?? true,
    options: fact.options,
  };
}

export function getTrackableFactsForWorkAreaType(workAreaTypeKey: string): {
  key: string;
  label: string;
  type: "number" | "select" | "boolean" | "text";
  unit?: string;
  required: boolean;
  affectsEstimate: boolean;
  affectsConfidence: boolean;
  options?: { value: string; label: string }[];
}[] {
  const scope = getScopeByWorkAreaType(workAreaTypeKey);
  if (scope) {
    const highImpact = new Set(scope.confidenceRules.highImpactOptionalKeys);
    return [
      ...scope.requiredFacts,
      ...scope.optionalFacts.filter((f) => highImpact.has(f.key)),
    ];
  }

  const canonical = getCanonicalScopeTemplateByWorkAreaType(workAreaTypeKey);
  if (canonical) {
    return [
      ...canonical.facts.required.map((f) =>
        canonicalFactToTrackableFact(f, "critical")
      ),
      ...canonical.facts.useful.map((f) =>
        canonicalFactToTrackableFact(f, "useful")
      ),
      ...canonical.facts.optional.map((f) =>
        canonicalFactToTrackableFact(f, "optional")
      ),
    ];
  }

  return getGenericDiscoveryQuestionDefs(workAreaTypeKey).map((def) => ({
    key: def.key,
    label: def.text.replace(/\?$/, ""),
    type: def.inputType === "number" ? "number" : def.inputType === "select" ? "select" : "text",
    unit: def.unit,
    required: def.key.includes("primary_dimensions") || def.key.includes("material"),
    affectsEstimate: true,
    affectsConfidence: true,
    options: def.options,
  }));
}
