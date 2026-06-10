import { normalizeQuestionKey } from "@/lib/question-keys";
import { getTemplateQuestionDefs } from "@/lib/scope-templates";
import type { Json } from "@/types/database";

export const PROJECT_ASSISTANT_STEPS = [
  { step: 1, title: "Tell Quotr what you know", key: "notes" },
  { step: 2, title: "Confirm work areas", key: "work-areas" },
  { step: 3, title: "Answer key questions", key: "questions" },
  { step: 4, title: "Budget, finish and constraints", key: "constraints" },
  { step: 5, title: "Quick estimate", key: "result" },
] as const;

export type ProjectAssistantStep =
  (typeof PROJECT_ASSISTANT_STEPS)[number]["step"];

export type ScopeQuestionInputType = "text" | "number" | "select" | "boolean";

export type ScopeQuestionDef = {
  key: string;
  text: string;
  inputType: ScopeQuestionInputType;
  options?: { value: string; label: string }[];
  unit?: string;
  placeholder?: string;
};

const YES_NO_UNSURE = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
  { value: "unknown", label: "Not sure yet" },
] as const;

export function resolveWorkAreaTypeKey(
  scopeTypeName: string | null | undefined,
  scopeName?: string
): string {
  const lowerName = scopeName?.toLowerCase() ?? "";

  if (lowerName.includes("bathroom")) return "Bathroom renovation";
  if (lowerName.includes("kitchen")) return "Kitchen renovation";
  if (lowerName.includes("deck")) return "Deck";
  if (lowerName.includes("retaining")) return "Retaining Wall";
  if (lowerName.includes("paint")) return "Painting";
  if (lowerName.includes("internal") || lowerName.includes("alteration")) {
    return "Internal Alteration";
  }

  const normalized: Record<string, string> = {
    "Bathroom renovation": "Bathroom renovation",
    "Kitchen renovation": "Kitchen renovation",
    "Internal alteration": "Internal Alteration",
    "Internal Alteration": "Internal Alteration",
    Deck: "Deck",
    Fencing: "Fence",
    Painting: "Painting",
    Other: "Custom Scope",
  };

  if (scopeTypeName && normalized[scopeTypeName]) {
    return normalized[scopeTypeName];
  }

  if (scopeTypeName) {
    const typeLower = scopeTypeName.toLowerCase();
    if (typeLower.includes("bathroom")) return "Bathroom renovation";
    if (typeLower.includes("kitchen")) return "Kitchen renovation";
    if (typeLower.includes("deck")) return "Deck";
    if (typeLower.includes("retaining")) return "Retaining Wall";
    if (typeLower.includes("internal")) return "Internal Alteration";
  }

  return scopeTypeName ?? "Custom Scope";
}

const WORK_AREA_QUESTION_DEFS: Record<string, ScopeQuestionDef[]> = {
  "Kitchen renovation": [
    {
      key: "cabinetry",
      text: "Is cabinetry included?",
      inputType: "select",
      options: [...YES_NO_UNSURE],
    },
    {
      key: "benchtops",
      text: "Are benchtops included?",
      inputType: "select",
      options: [...YES_NO_UNSURE],
    },
    {
      key: "appliances_client",
      text: "Are appliances supplied by the client?",
      inputType: "select",
      options: [...YES_NO_UNSURE],
    },
    {
      key: "plumbing_changes",
      text: "Are plumbing changes required?",
      inputType: "select",
      options: [...YES_NO_UNSURE],
    },
    {
      key: "electrical_changes",
      text: "Are electrical changes required?",
      inputType: "select",
      options: [...YES_NO_UNSURE],
    },
    {
      key: "splashback",
      text: "Is splashback/tiling included?",
      inputType: "select",
      options: [...YES_NO_UNSURE],
    },
  ],
  "Internal Alteration": [
    {
      key: "walls_removed",
      text: "Are walls being removed?",
      inputType: "select",
      options: [...YES_NO_UNSURE],
    },
    {
      key: "walls_added",
      text: "Are new walls being built?",
      inputType: "select",
      options: [...YES_NO_UNSURE],
    },
    {
      key: "structural",
      text: "Any structural work?",
      inputType: "select",
      options: [...YES_NO_UNSURE],
    },
    {
      key: "doors_openings",
      text: "Any doors/openings required?",
      inputType: "select",
      options: [...YES_NO_UNSURE],
    },
    {
      key: "electrical_affected",
      text: "Any electrical affected?",
      inputType: "select",
      options: [...YES_NO_UNSURE],
    },
    {
      key: "gib_painting",
      text: "Is GIB/stopping/painting included?",
      inputType: "select",
      options: [...YES_NO_UNSURE],
    },
  ],
  Painting: [
    {
      key: "interior_exterior",
      text: "Interior or exterior?",
      inputType: "select",
      options: [
        { value: "interior", label: "Interior" },
        { value: "exterior", label: "Exterior" },
        { value: "both", label: "Both" },
      ],
    },
    {
      key: "painting.area_m2",
      text: "Approximate area?",
      inputType: "number",
      unit: "m²",
      placeholder: "e.g. 80",
    },
    {
      key: "plaster_repairs",
      text: "Any plaster repairs required?",
      inputType: "select",
      options: [...YES_NO_UNSURE],
    },
  ],
};

const GENERIC_QUESTION_DEFS: ScopeQuestionDef[] = [
  {
    key: "access_restrictions",
    text: "Is access tight?",
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
    key: "rubbish_removal",
    text: "Is rubbish removal required?",
    inputType: "select",
    options: [...YES_NO_UNSURE],
  },
  {
    key: "time_constraints",
    text: "Are working hours restricted?",
    inputType: "select",
    options: [...YES_NO_UNSURE],
  },
  {
    key: "client_budget_known",
    text: "Is the client budget known?",
    inputType: "select",
    options: [
      { value: "yes", label: "Yes — client shared a budget" },
      { value: "rough", label: "Rough idea only" },
      { value: "no", label: "No — not discussed" },
    ],
  },
];

export function getQuestionDefsForWorkAreaType(
  workAreaTypeKey: string
): ScopeQuestionDef[] {
  const templateDefs = getTemplateQuestionDefs(workAreaTypeKey);
  if (templateDefs.length > 0) return templateDefs;
  return WORK_AREA_QUESTION_DEFS[workAreaTypeKey] ?? GENERIC_QUESTION_DEFS;
}

export function questionTextFromDef(def: ScopeQuestionDef): string {
  return def.text;
}

export function findQuestionDefByText(
  questionText: string,
  workAreaTypeKey: string
): ScopeQuestionDef | undefined {
  const defs = getQuestionDefsForWorkAreaType(workAreaTypeKey);
  return defs.find((d) => d.text === questionText);
}

export function findQuestionDefByKey(
  questionKey: string | null | undefined,
  workAreaTypeKey: string
): ScopeQuestionDef | undefined {
  if (!questionKey) return undefined;
  const defs = getQuestionDefsForWorkAreaType(workAreaTypeKey);
  const normalized = normalizeQuestionKey(questionKey);
  return defs.find(
    (d) => d.key === questionKey || d.key === normalized
  );
}

export function resolveQuestionDef(
  question: {
    question: string;
    question_key?: string | null;
  },
  workAreaTypeKey: string
): ScopeQuestionDef | undefined {
  return (
    findQuestionDefByKey(question.question_key, workAreaTypeKey) ??
    findQuestionDefByText(question.question, workAreaTypeKey)
  );
}

export function questionDefToDbFields(def: ScopeQuestionDef) {
  return {
    question: questionTextFromDef(def),
    question_key: def.key,
    question_type: def.inputType,
    options: def.options ? (def.options as unknown as Json) : null,
    unit: def.unit ?? null,
  };
}
