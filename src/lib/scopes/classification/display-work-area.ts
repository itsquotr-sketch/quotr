import type { ProjectScope } from "@/types/database";
import {
  isBroadCategoryKey,
  isInternalWorksBroadCategory,
} from "@/lib/scopes/classification/classify-detected-scope";
import { BROAD_CATEGORY_DISPLAY_LABELS } from "@/lib/scopes/classification/scope-taxonomy";

export type WorkAreaDisplayInfo = {
  displayName: string;
  statusLabel: string | null;
  isBroadCategory: boolean;
  needsClarification: boolean;
  showConfidence: boolean;
  confidencePercent: number | null;
};

function normaliseName(name: string): string {
  return name.toLowerCase().replace(/\s+/g, " ").trim();
}

function isLegacyInternalAlterationScope(
  scope: ProjectScope & { scope_types?: { name: string } | null }
): boolean {
  const typeName = scope.scope_types?.name?.toLowerCase() ?? "";
  const scopeName = normaliseName(scope.name);
  const confidence = scope.ai_confidence ?? 0;

  return (
    (typeName.includes("internal") || scopeName.includes("internal alteration")) &&
    (confidence === 0 || scope.confidence_level === "low" || scope.classification_status === "needs_clarification")
  );
}

export function resolveBroadCategoryKey(
  scope: ProjectScope & { scope_types?: { name: string } | null }
): string | null {
  if (scope.classification_status === "broad_category" || scope.classification_status === "needs_clarification") {
    const notes = scope.notes ?? "";
    const match = notes.match(/broad_category_key:(\w+)/);
    if (match?.[1]) return match[1];
    return "internal_alteration";
  }

  if (isLegacyInternalAlterationScope(scope)) {
    return "internal_alteration";
  }

  return null;
}

export function getWorkAreaDisplayInfo(
  scope: ProjectScope & { scope_types?: { name: string } | null },
  completenessPercent?: number
): WorkAreaDisplayInfo {
  const broadKey = resolveBroadCategoryKey(scope);
  const isBroad =
    Boolean(broadKey) ||
    scope.classification_status === "broad_category" ||
    scope.classification_status === "needs_clarification";

  if (isBroad && broadKey) {
    return {
      displayName:
        BROAD_CATEGORY_DISPLAY_LABELS[broadKey] ?? "Additional internal works",
      statusLabel: "Needs clarification",
      isBroadCategory: true,
      needsClarification: scope.classification_status !== "confirmed",
      showConfidence: false,
      confidencePercent: null,
    };
  }

  if (isLegacyInternalAlterationScope(scope)) {
    return {
      displayName: "Additional internal works",
      statusLabel: "Needs clarification",
      isBroadCategory: true,
      needsClarification: true,
      showConfidence: false,
      confidencePercent: null,
    };
  }

  if (scope.include_in_quick_estimate === false) {
    return {
      displayName: scope.name,
      statusLabel: "Excluded from estimate",
      isBroadCategory: false,
      needsClarification: false,
      showConfidence: true,
      confidencePercent: completenessPercent ?? null,
    };
  }

  return {
    displayName: scope.name,
    statusLabel: null,
    isBroadCategory: false,
    needsClarification: false,
    showConfidence: true,
    confidencePercent: completenessPercent ?? null,
  };
}

export function shouldExcludeFromQuickEstimate(
  scope: ProjectScope & { scope_types?: { name: string } | null }
): boolean {
  if (scope.include_in_quick_estimate === false) return true;
  const broadKey = resolveBroadCategoryKey(scope);
  if (broadKey && isBroadCategoryKey(broadKey)) return true;
  if (isLegacyInternalAlterationScope(scope)) return true;
  return false;
}

export function formatBroadCategoryNotes(broadCategoryKey: string): string {
  return `broad_category_key:${broadCategoryKey}`;
}

export function isInternalWorksScope(
  scope: ProjectScope & { scope_types?: { name: string } | null }
): boolean {
  const key = resolveBroadCategoryKey(scope);
  return key ? isInternalWorksBroadCategory(key) : isLegacyInternalAlterationScope(scope);
}
