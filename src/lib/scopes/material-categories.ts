import type { ScopeFactOption } from "@/lib/scopes/templates/types";
import type { ScopeMaterialCategories } from "@/lib/scopes/templates/types";
import { getAnswerValue } from "@/lib/question-keys";

/** Values that mean the user selected "Not Sure". */
export const NOT_SURE_MATERIAL_VALUES = new Set(["unknown", "not_sure"]);

export type MaterialCategorySource = "user_provided" | "assumed";

export type ResolvedMaterialCategory = {
  scopeTypeKey: string;
  factKey: string;
  categoryValue: string;
  categoryLabel: string;
  source: MaterialCategorySource;
  benchmarkTier: "budget" | "standard" | "premium";
  rateMultiplier: number;
};

const DECK_MATERIAL_CATEGORIES: ScopeMaterialCategories = {
  factKey: "deck.material_type",
  questionText: "What type of decking should I assume?",
  defaultCategoryKey: "treated_pine",
  categories: [
    { value: "treated_pine", label: "Treated Pine", benchmarkTier: "budget" },
    { value: "hardwood_timber", label: "Hardwood Timber", benchmarkTier: "standard" },
    { value: "composite", label: "Composite", benchmarkTier: "premium" },
    { value: "unknown", label: "Not Sure", benchmarkTier: "standard" },
  ],
};

const FENCE_MATERIAL_CATEGORIES: ScopeMaterialCategories = {
  factKey: "fence.material_type",
  questionText: "What type of fencing should I assume?",
  defaultCategoryKey: "timber",
  categories: [
    { value: "timber", label: "Timber", benchmarkTier: "standard" },
    { value: "steel", label: "Steel", benchmarkTier: "standard", rateMultiplier: 1.1 },
    { value: "aluminium", label: "Aluminium", benchmarkTier: "premium", rateMultiplier: 1.15 },
    { value: "pvc", label: "PVC", benchmarkTier: "standard", rateMultiplier: 1.05 },
    { value: "masonry", label: "Masonry", benchmarkTier: "premium", rateMultiplier: 1.2 },
    { value: "unknown", label: "Not Sure", benchmarkTier: "standard" },
  ],
};

const RETAINING_WALL_MATERIAL_CATEGORIES: ScopeMaterialCategories = {
  factKey: "retaining_wall.material",
  questionText: "What type of retaining wall should I assume?",
  defaultCategoryKey: "timber",
  categories: [
    { value: "timber", label: "Timber", benchmarkTier: "budget", rateMultiplier: 0.9 },
    { value: "concrete_block", label: "Concrete Block", benchmarkTier: "standard" },
    { value: "concrete_sleeper", label: "Concrete Sleeper", benchmarkTier: "standard", rateMultiplier: 1.05 },
    { value: "stone", label: "Stone", benchmarkTier: "premium", rateMultiplier: 1.15 },
    { value: "keystone", label: "Keystone", benchmarkTier: "premium", rateMultiplier: 1.12 },
    { value: "unknown", label: "Not Sure", benchmarkTier: "standard" },
  ],
};

const BATHROOM_MATERIAL_CATEGORIES: ScopeMaterialCategories = {
  factKey: "bathroom.finish_level",
  questionText: "What finish level should I assume for fixtures and finishes?",
  defaultCategoryKey: "standard",
  categories: [
    { value: "budget", label: "Budget / basic", benchmarkTier: "budget" },
    { value: "standard", label: "Standard / mid-range", benchmarkTier: "standard" },
    { value: "premium", label: "Premium / high-end", benchmarkTier: "premium" },
    { value: "unknown", label: "Not Sure", benchmarkTier: "standard" },
  ],
};

const MATERIAL_CONFIG_BY_SCOPE: Record<string, ScopeMaterialCategories> = {
  deck: DECK_MATERIAL_CATEGORIES,
  fence: FENCE_MATERIAL_CATEGORIES,
  retaining_wall: RETAINING_WALL_MATERIAL_CATEGORIES,
  bathroom_renovation: BATHROOM_MATERIAL_CATEGORIES,
};

const MATERIAL_CONFIG_BY_WORK_AREA: Record<string, ScopeMaterialCategories> = {
  Deck: DECK_MATERIAL_CATEGORIES,
  Fence: FENCE_MATERIAL_CATEGORIES,
  "Retaining Wall": RETAINING_WALL_MATERIAL_CATEGORIES,
  "Bathroom renovation": BATHROOM_MATERIAL_CATEGORIES,
};

/** Legacy answer values mapped to canonical material category keys. */
const LEGACY_MATERIAL_VALUES: Record<string, Record<string, string>> = {
  deck: {
    timber: "treated_pine",
    hardwood: "hardwood_timber",
    treated: "treated_pine",
  },
  fence: {
    metal: "steel",
    composite: "pvc",
  },
  retaining_wall: {
    block: "concrete_block",
    concrete: "concrete_sleeper",
  },
};

export function getMaterialCategoriesForScope(
  scopeTypeKey: string
): ScopeMaterialCategories | undefined {
  return MATERIAL_CONFIG_BY_SCOPE[scopeTypeKey];
}

export function getMaterialCategoriesForWorkArea(
  workAreaTypeKey: string
): ScopeMaterialCategories | undefined {
  return MATERIAL_CONFIG_BY_WORK_AREA[workAreaTypeKey];
}

export function getMaterialCategoryOptions(
  scopeTypeKey: string
): ScopeFactOption[] {
  const config = getMaterialCategoriesForScope(scopeTypeKey);
  if (!config) return [];
  return config.categories.map(({ value, label }) => ({ value, label }));
}

export function getMaterialQuestionText(scopeTypeKey: string): string | undefined {
  return getMaterialCategoriesForScope(scopeTypeKey)?.questionText;
}

export function getMaterialQuestionTextForWorkArea(
  workAreaTypeKey: string
): string | undefined {
  return getMaterialCategoriesForWorkArea(workAreaTypeKey)?.questionText;
}

export function isNotSureMaterialValue(value: string | null | undefined): boolean {
  if (!value) return false;
  return NOT_SURE_MATERIAL_VALUES.has(value.trim().toLowerCase());
}

function normalizeRawMaterialValue(
  scopeTypeKey: string,
  rawValue: string | null | undefined
): string | null {
  if (!rawValue?.trim()) return null;
  const trimmed = rawValue.trim().toLowerCase();
  if (NOT_SURE_MATERIAL_VALUES.has(trimmed)) return "unknown";
  const legacy = LEGACY_MATERIAL_VALUES[scopeTypeKey]?.[trimmed];
  return legacy ?? trimmed;
}

function findCategory(config: ScopeMaterialCategories, value: string) {
  return config.categories.find((c) => c.value === value);
}

const WORK_AREA_TO_SCOPE_TYPE: Record<string, string> = {
  Deck: "deck",
  Fence: "fence",
  "Retaining Wall": "retaining_wall",
  "Bathroom renovation": "bathroom_renovation",
};

function resolveScopeTypeKey(
  scopeTypeKey?: string,
  workAreaTypeKey?: string
): string | undefined {
  if (scopeTypeKey && MATERIAL_CONFIG_BY_SCOPE[scopeTypeKey]) {
    return scopeTypeKey;
  }
  if (workAreaTypeKey) {
    const fromWorkArea = WORK_AREA_TO_SCOPE_TYPE[workAreaTypeKey];
    if (fromWorkArea && MATERIAL_CONFIG_BY_SCOPE[fromWorkArea]) {
      return fromWorkArea;
    }
  }
  return scopeTypeKey;
}

/**
 * Resolves the effective material category for pricing, confidence, and trace.
 * "Not Sure" maps to the scope default benchmark category with source "assumed".
 */
export function resolveMaterialCategory(input: {
  scopeTypeKey?: string;
  workAreaTypeKey?: string;
  answers: Record<string, string>;
}): ResolvedMaterialCategory | null {
  const scopeKey = resolveScopeTypeKey(input.scopeTypeKey, input.workAreaTypeKey);
  if (!scopeKey) return null;

  const config = getMaterialCategoriesForScope(scopeKey);
  if (!config) return null;

  const rawValue = getAnswerValue(input.answers, config.factKey);
  const normalized = normalizeRawMaterialValue(scopeKey, rawValue);

  if (!normalized) return null;

  if (normalized === "unknown") {
    const defaultCat = findCategory(config, config.defaultCategoryKey);
    if (!defaultCat) return null;
    return {
      scopeTypeKey: scopeKey,
      factKey: config.factKey,
      categoryValue: defaultCat.value,
      categoryLabel: defaultCat.label,
      source: "assumed",
      benchmarkTier: defaultCat.benchmarkTier ?? "standard",
      rateMultiplier: defaultCat.rateMultiplier ?? 1,
    };
  }

  const category = findCategory(config, normalized);
  if (!category) return null;

  return {
    scopeTypeKey: scopeKey,
    factKey: config.factKey,
    categoryValue: category.value,
    categoryLabel: category.label,
    source: "user_provided",
    benchmarkTier: category.benchmarkTier ?? "standard",
    rateMultiplier: category.rateMultiplier ?? 1,
  };
}

export function isMaterialCategoryUserProvided(
  answers: Record<string, string>,
  scopeTypeKey?: string,
  workAreaTypeKey?: string
): boolean {
  const resolved = resolveMaterialCategory({ scopeTypeKey, workAreaTypeKey, answers });
  return resolved?.source === "user_provided";
}

export function isMaterialCategoryAnswered(
  answers: Record<string, string>,
  scopeTypeKey?: string,
  workAreaTypeKey?: string
): boolean {
  const scopeKey = resolveScopeTypeKey(scopeTypeKey, workAreaTypeKey);
  if (!scopeKey) return false;
  const config = getMaterialCategoriesForScope(scopeKey);
  if (!config) return false;
  const raw = getAnswerValue(answers, config.factKey);
  return Boolean(raw?.trim());
}

export function getMaterialFactKeyForWorkArea(
  workAreaTypeKey: string
): string | undefined {
  return getMaterialCategoriesForWorkArea(workAreaTypeKey)?.factKey;
}

export function isMaterialFactAnswered(
  scopeTypeKey: string,
  factKey: string,
  rawValue: string
): boolean {
  const config = getMaterialCategoriesForScope(scopeTypeKey);
  if (!config || config.factKey !== factKey) return false;
  const normalized = normalizeRawMaterialValue(scopeTypeKey, rawValue);
  if (!normalized) return false;
  if (normalized === "unknown") return true;
  return config.categories.some((c) => c.value === normalized);
}

const FACT_PREFIX_TO_SCOPE: Record<string, string> = {
  deck: "deck",
  fence: "fence",
  retaining_wall: "retaining_wall",
  bathroom: "bathroom_renovation",
};

export function scopeTypeKeyFromFactKey(factKey: string): string | undefined {
  const prefix = factKey.split(".")[0];
  return prefix ? FACT_PREFIX_TO_SCOPE[prefix] : undefined;
}

export function isMaterialFactAnsweredForKey(
  factKey: string,
  rawValue: string
): boolean {
  const scopeTypeKey = scopeTypeKeyFromFactKey(factKey);
  if (!scopeTypeKey) return false;
  return isMaterialFactAnswered(scopeTypeKey, factKey, rawValue);
}

export function enrichFactWithMaterialCategories(
  factKey: string,
  scopeTypeKey: string,
  base: { questionText?: string; options?: ScopeFactOption[] }
): { questionText?: string; options?: ScopeFactOption[] } {
  const config = getMaterialCategoriesForScope(scopeTypeKey);
  if (!config || config.factKey !== factKey) return base;

  return {
    questionText: config.questionText,
    options: getMaterialCategoryOptions(scopeTypeKey),
  };
}

export {
  DECK_MATERIAL_CATEGORIES,
  FENCE_MATERIAL_CATEGORIES,
  RETAINING_WALL_MATERIAL_CATEGORIES,
  BATHROOM_MATERIAL_CATEGORIES,
};
