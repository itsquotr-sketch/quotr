import type { DiscoveryWorkArea } from "@/lib/ai/discovery/types";
import { classifyDetectedScope } from "@/lib/scopes/classification/classify-detected-scope";
import type { ProcessedDiscoveryItems } from "@/lib/scopes/classification/types";
import {
  BROAD_CATEGORY_DISPLAY_LABELS,
  BROAD_CATEGORY_TAXONOMY,
  resolveWorkAreaTypeKeyFromCanonical,
  WORK_AREA_TAXONOMY,
} from "@/lib/scopes/classification/scope-taxonomy";
import { getScopeByWorkAreaType } from "@/lib/scopes";

export type ProcessDiscoveryContext = {
  notes: string;
  confirmedWorkAreaTypeKeys?: string[];
};

function canonicalKeysFromWorkAreas(workAreas: DiscoveryWorkArea[]): string[] {
  const keys: string[] = [];
  for (const area of workAreas) {
    const classified = classifyDetectedScope(area.name || area.typeKey);
    if (classified.classification === "work_area" && classified.canonicalKey) {
      keys.push(classified.canonicalKey);
    } else {
      const scope = getScopeByWorkAreaType(area.typeKey);
      if (scope) {
        keys.push(scope.id);
      }
    }
  }
  return keys;
}

function buildWorkAreaDescription(
  typeKey: string,
  matchedKeywords: string[]
): string {
  if (matchedKeywords.length === 0) {
    return `Suggested ${typeKey.toLowerCase()} scope from your project notes.`;
  }
  return `Suggested from your notes based on: ${matchedKeywords.join(", ")}.`;
}

function notesMentionBroadCategory(
  notes: string,
  broadCategoryKey: string
): boolean {
  const lower = notes.toLowerCase();
  const entry = BROAD_CATEGORY_TAXONOMY.find((b) => b.key === broadCategoryKey);
  if (!entry) return false;
  return entry.aliases.some((alias) => lower.includes(alias.toLowerCase()));
}

/**
 * Apply scope classification to discovery work areas.
 * Filters broad categories, absorbed packages, and duplicate scopes.
 */
export function processDiscoveryWorkAreas(
  items: DiscoveryWorkArea[],
  context: ProcessDiscoveryContext
): ProcessedDiscoveryItems {
  const result: ProcessedDiscoveryItems = {
    workAreas: [],
    broadCategories: [],
    heldPackages: [],
    unknownItems: [],
  };

  const seenWorkAreaKeys = new Set<string>();
  const seenBroadKeys = new Set<string>();
  const seenPackageKeys = new Set<string>();

  const confirmedCanonical = (context.confirmedWorkAreaTypeKeys ?? [])
    .map((key) => {
      const classified = classifyDetectedScope(key);
      return classified.canonicalKey ?? key;
    })
    .filter(Boolean);

  const pass1WorkAreaKeys = canonicalKeysFromWorkAreas(items);
  const parentKeys = [...new Set([...confirmedCanonical, ...pass1WorkAreaKeys])];

  for (const item of items) {
    const label = item.name || item.typeKey;
    const classified = classifyDetectedScope(label, {
      parentWorkAreaKeys: parentKeys,
      notesContext: context.notes,
    });

    if (classified.classification === "work_area" && classified.canonicalKey) {
      if (seenWorkAreaKeys.has(classified.canonicalKey)) continue;

      const taxonomy = WORK_AREA_TAXONOMY.find(
        (w) => w.key === classified.canonicalKey
      );
      const typeKey = resolveWorkAreaTypeKeyFromCanonical(classified.canonicalKey);

      seenWorkAreaKeys.add(classified.canonicalKey);
      result.workAreas.push({
        typeKey,
        name: taxonomy?.label ?? item.name,
        description: item.description || buildWorkAreaDescription(typeKey, item.matchedKeywords),
        locationArea: item.locationArea,
        confidence: Math.max(item.confidence, classified.confidence),
        matchedKeywords: item.matchedKeywords,
        canonicalKey: classified.canonicalKey,
      });
      continue;
    }

    if (classified.classification === "work_package" && classified.canonicalKey) {
      const taxonomy = WORK_AREA_TAXONOMY.find((w) =>
        w.includedPackages?.includes(classified.canonicalKey!)
      );
      const absorbedByDetectedParent = parentKeys.some((pk) => {
        const parent = WORK_AREA_TAXONOMY.find((w) => w.key === pk);
        return parent?.includedPackages?.includes(classified.canonicalKey!);
      });

      if (absorbedByDetectedParent || taxonomy) {
        continue;
      }

      if (seenPackageKeys.has(classified.canonicalKey)) continue;
      seenPackageKeys.add(classified.canonicalKey);

      const pkgLabel =
        classified.inputLabel.length > 3
          ? classified.inputLabel
          : classified.canonicalKey.replace(/_/g, " ");

      result.heldPackages.push({
        packageKey: classified.canonicalKey,
        label: pkgLabel.charAt(0).toUpperCase() + pkgLabel.slice(1),
        parentWorkAreaKey: null,
        confidence: classified.confidence,
        sourceLabel: item.name,
      });
      continue;
    }

    if (
      classified.classification === "broad_category" &&
      classified.canonicalKey
    ) {
      const hasSpecificWorkAreas = result.workAreas.length > 0 || parentKeys.length > 0;
      if (
        hasSpecificWorkAreas &&
        !notesMentionBroadCategory(context.notes, classified.canonicalKey)
      ) {
        continue;
      }

      if (seenBroadKeys.has(classified.canonicalKey)) continue;
      seenBroadKeys.add(classified.canonicalKey);

      result.broadCategories.push({
        broadCategoryKey: classified.canonicalKey,
        displayLabel:
          BROAD_CATEGORY_DISPLAY_LABELS[classified.canonicalKey] ??
          "Additional works",
        sourceLabel: item.name,
        confidence: classified.confidence,
      });
      continue;
    }

    if (classified.classification === "unknown") {
      result.unknownItems.push({
        label: item.name,
        reason: classified.reason,
      });
    }
  }

  // Extract explicit packages from notes (e.g. wall removal + repaint alongside bathroom)
  if (context.notes) {
    const noteFragmentPackages: { fragment: string; packageKey: string; label: string }[] = [
      { fragment: "non-load-bearing wall", packageKey: "demolition", label: "Demolition" },
      { fragment: "non load bearing wall", packageKey: "demolition", label: "Demolition" },
      { fragment: "remove wall", packageKey: "demolition", label: "Demolition" },
      { fragment: "wall removal", packageKey: "demolition", label: "Demolition" },
      { fragment: "repaint hallway", packageKey: "painting", label: "Painting" },
      { fragment: "repaint", packageKey: "painting", label: "Painting" },
      { fragment: "new partition", packageKey: "partitions", label: "Partitions" },
      { fragment: "ceiling", packageKey: "ceiling_works", label: "Ceiling works" },
      { fragment: "flooring", packageKey: "flooring", label: "Flooring" },
      { fragment: "electrical", packageKey: "electrical", label: "Electrical" },
      { fragment: "plumbing", packageKey: "plumbing", label: "Plumbing" },
    ];

    const notesLower = context.notes.toLowerCase();
    const sortedFragments = [...noteFragmentPackages].sort(
      (a, b) => b.fragment.length - a.fragment.length
    );

    for (const { fragment, packageKey, label } of sortedFragments) {
      if (!notesLower.includes(fragment)) continue;
      if (seenPackageKeys.has(packageKey)) continue;
      seenPackageKeys.add(packageKey);
      result.heldPackages.push({
        packageKey,
        label,
        parentWorkAreaKey: null,
        confidence: 0.65,
        sourceLabel: fragment,
      });
    }
  }

  return result;
}

/**
 * Re-process a full discovery result, returning work areas suitable for suggestions.
 */
export function applyClassificationToDiscoveryResult(
  workAreas: DiscoveryWorkArea[],
  notes: string
): {
  workAreas: DiscoveryWorkArea[];
  processed: ProcessedDiscoveryItems;
} {
  const processed = processDiscoveryWorkAreas(workAreas, { notes });
  return {
    processed,
    workAreas: processed.workAreas.map((w) => ({
      typeKey: w.typeKey,
      name: w.name,
      description: w.description,
      locationArea: w.locationArea,
      confidence: w.confidence,
      matchedKeywords: w.matchedKeywords,
    })),
  };
}
