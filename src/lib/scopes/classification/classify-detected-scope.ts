import type { ClassifiedScopeResult } from "@/lib/scopes/classification/types";
import { classifiedScopeResultSchema } from "@/lib/scopes/classification/types";
import {
  BROAD_CATEGORY_TAXONOMY,
  findBroadCategoryEntry,
  findWorkAreaEntry,
  findWorkPackageEntry,
  normaliseScopeLabel,
  WORK_AREA_TAXONOMY,
  WORK_PACKAGE_TAXONOMY,
} from "@/lib/scopes/classification/scope-taxonomy";

export type ClassifyScopeOptions = {
  /** When set, packages included in this work area are not promoted to separate scopes */
  parentWorkAreaKeys?: string[];
  /** Full project notes for contextual matching */
  notesContext?: string;
};

function scoreMatch(
  label: string,
  aliases: string[]
): { score: number; matchedAlias: string | null } {
  const normalised = normaliseScopeLabel(label);
  let bestScore = 0;
  let matchedAlias: string | null = null;

  for (const alias of aliases) {
    const aliasNorm = normaliseScopeLabel(alias);
    if (normalised === aliasNorm) {
      return { score: 1, matchedAlias: alias };
    }
    if (normalised.includes(aliasNorm) && aliasNorm.length >= 4) {
      const score = 0.6 + (aliasNorm.length / Math.max(normalised.length, 1)) * 0.35;
      if (score > bestScore) {
        bestScore = score;
        matchedAlias = alias;
      }
    }
    if (aliasNorm.includes(normalised) && normalised.length >= 4) {
      const score = 0.55 + (normalised.length / aliasNorm.length) * 0.35;
      if (score > bestScore) {
        bestScore = score;
        matchedAlias = alias;
      }
    }
  }

  return { score: bestScore, matchedAlias };
}

function isPackageCoveredByParent(
  packageKey: string,
  parentWorkAreaKeys: string[]
): boolean {
  for (const parentKey of parentWorkAreaKeys) {
    const parent = WORK_AREA_TAXONOMY.find((e) => e.key === parentKey);
    if (parent?.includedPackages?.includes(packageKey)) {
      return true;
    }
  }
  return false;
}

function detectPackagesInNotes(notes: string): string[] {
  const found: string[] = [];
  for (const pkg of WORK_PACKAGE_TAXONOMY) {
    const { score } = scoreMatch(notes, pkg.aliases);
    if (score >= 0.6) {
      found.push(pkg.key);
    }
  }
  return found;
}

/**
 * Classify a detected scope label into work_area, work_package, broad_category, or unknown.
 */
export function classifyDetectedScope(
  inputLabel: string,
  options: ClassifyScopeOptions = {}
): ClassifiedScopeResult {
  const trimmed = inputLabel.trim();
  if (!trimmed) {
    return classifiedScopeResultSchema.parse({
      inputLabel: inputLabel,
      classification: "unknown",
      canonicalKey: null,
      confidence: 0,
      reason: "Empty label — not enough information to classify.",
    });
  }

  const parentKeys = options.parentWorkAreaKeys ?? [];

  const workAreaMatch = findWorkAreaEntry(trimmed);
  if (workAreaMatch) {
    const { score, matchedAlias } = scoreMatch(trimmed, workAreaMatch.aliases);
    return classifiedScopeResultSchema.parse({
      inputLabel: trimmed,
      classification: "work_area",
      canonicalKey: workAreaMatch.key,
      confidence: Math.min(0.95, Math.max(0.5, score)),
      reason: matchedAlias
        ? `Matched work area "${workAreaMatch.label}" from "${matchedAlias}".`
        : `Matched work area "${workAreaMatch.label}".`,
    });
  }

  const packageMatch = findWorkPackageEntry(trimmed);
  if (packageMatch) {
    const { score, matchedAlias } = scoreMatch(trimmed, packageMatch.aliases);
    if (isPackageCoveredByParent(packageMatch.key, parentKeys)) {
      return classifiedScopeResultSchema.parse({
        inputLabel: trimmed,
        classification: "work_package",
        canonicalKey: packageMatch.key,
        confidence: Math.min(0.9, score),
        reason: `"${packageMatch.label}" is part of an existing work area — kept as a package, not a separate scope.`,
      });
    }
    return classifiedScopeResultSchema.parse({
      inputLabel: trimmed,
      classification: "work_package",
      canonicalKey: packageMatch.key,
      confidence: Math.min(0.9, Math.max(0.45, score)),
      reason: matchedAlias
        ? `Matched work package "${packageMatch.label}" from "${matchedAlias}".`
        : `Matched work package "${packageMatch.label}".`,
    });
  }

  const broadMatch = findBroadCategoryEntry(trimmed);
  if (broadMatch) {
    const { score, matchedAlias } = scoreMatch(trimmed, broadMatch.aliases);
    const notesPackages = options.notesContext
      ? detectPackagesInNotes(options.notesContext)
      : [];
    const suggestedChildren =
      notesPackages.length > 0
        ? notesPackages
        : broadMatch.suggestedChildren ?? [];

    return classifiedScopeResultSchema.parse({
      inputLabel: trimmed,
      classification: "broad_category",
      canonicalKey: broadMatch.key,
      confidence: Math.min(0.85, Math.max(0.35, score)),
      reason: matchedAlias
        ? `"${broadMatch.label}" is too broad to price directly — needs clarification.`
        : `"${broadMatch.label}" is too broad to price directly.`,
      suggestedChildren,
    });
  }

  // Legacy type keys from discovery engine
  const legacyWorkAreaKeys: Record<string, string> = {
    "bathroom renovation": "bathroom_renovation",
    deck: "deck",
    "retaining wall": "retaining_wall",
    "kitchen renovation": "kitchen_renovation",
    fence: "fence",
    painting: "painting_project",
    flooring: "flooring_project",
    "internal alteration": "internal_alteration",
    "general building works": "general_building",
    "custom scope": "unknown",
  };

  const legacyKey = legacyWorkAreaKeys[normaliseScopeLabel(trimmed)];
  if (legacyKey) {
    if (
      BROAD_CATEGORY_TAXONOMY.some((b) => b.key === legacyKey)
    ) {
      const broad = BROAD_CATEGORY_TAXONOMY.find((b) => b.key === legacyKey)!;
      return classifiedScopeResultSchema.parse({
        inputLabel: trimmed,
        classification: "broad_category",
        canonicalKey: legacyKey,
        confidence: 0.4,
        reason: `"${broad.label}" is too broad to price directly — needs clarification.`,
        suggestedChildren: broad.suggestedChildren,
      });
    }
    const workArea = WORK_AREA_TAXONOMY.find((w) => w.key === legacyKey);
    if (workArea) {
      return classifiedScopeResultSchema.parse({
        inputLabel: trimmed,
        classification: "work_area",
        canonicalKey: legacyKey,
        confidence: 0.7,
        reason: `Recognised work area "${workArea.label}".`,
      });
    }
  }

  if (trimmed.split(/\s+/).length <= 2 && trimmed.length < 12) {
    return classifiedScopeResultSchema.parse({
      inputLabel: trimmed,
      classification: "unknown",
      canonicalKey: null,
      confidence: 0.2,
      reason: "Not enough detail to classify this item.",
    });
  }

  return classifiedScopeResultSchema.parse({
    inputLabel: trimmed,
    classification: "unknown",
    canonicalKey: null,
    confidence: 0.3,
    reason: "Could not match to a known work area or package — needs clarification.",
  });
}

export function isBroadCategoryKey(key: string): boolean {
  return BROAD_CATEGORY_TAXONOMY.some((b) => b.key === key);
}

export function isInternalWorksBroadCategory(key: string): boolean {
  return key === "internal_alteration" || key === "internal_works";
}
