import {
  CONSTRAINT_SLUGS_HIDDEN_WHEN_ANSWERED,
  getConstraintBySlug,
  getRelevantConstraints,
  type AssistantConstraint,
} from "@/lib/project-assistant-constraints";
import { normalizeQuestionKey } from "@/lib/question-keys";
import { listProjectEstimateDrivers } from "@/lib/quick-estimate-data";
import { devLog } from "@/lib/dev-log";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type Supabase = SupabaseClient<Database>;

export type SavedConstraintValue = {
  selected?: boolean;
  metres?: number;
  description?: string;
  severity?: "low" | "typical" | "high";
  source?: string;
};

export type SavedProjectConstraint = {
  slug: string;
  label: string;
  metres?: number;
  description?: string;
  severity?: "low" | "typical" | "high";
  source?: string;
};

export type DiscoverySummaryConstraint = {
  slug: string;
  label: string;
  detail?: string;
  source: "notes" | "user";
};

function parseSavedValue(value: unknown): SavedConstraintValue {
  if (!value || typeof value !== "object") {
    return {};
  }
  const row = value as Record<string, unknown>;
  const severity = row.severity;
  return {
    selected: row.selected === true,
    metres: typeof row.metres === "number" ? row.metres : undefined,
    description:
      typeof row.description === "string" ? row.description : undefined,
    severity:
      severity === "low" || severity === "typical" || severity === "high"
        ? severity
        : undefined,
    source: typeof row.source === "string" ? row.source : undefined,
  };
}

function isConstraintSupersededByQuestion(
  slug: string,
  answeredQuestionKeys: Set<string>
): boolean {
  const def = getConstraintBySlug(slug);
  const hideKey =
    def?.hideWhenQuestionAnswered ??
    (slug in CONSTRAINT_SLUGS_HIDDEN_WHEN_ANSWERED
      ? CONSTRAINT_SLUGS_HIDDEN_WHEN_ANSWERED[slug]
      : undefined);
  if (!hideKey) return false;
  const normalizedHide = normalizeQuestionKey(hideKey) ?? hideKey;
  return (
    answeredQuestionKeys.has(hideKey) ||
    answeredQuestionKeys.has(normalizedHide)
  );
}

/** Constraints shown in the UI — relevant options plus any already saved. */
export function getConstraintsForUi(
  workAreaTypeKeys: string[],
  answeredQuestionKeys: Set<string>,
  savedSlugs: string[] = []
): AssistantConstraint[] {
  const relevant = getRelevantConstraints(
    workAreaTypeKeys,
    answeredQuestionKeys
  );
  const seen = new Set(relevant.map((c) => c.slug));

  const extra = savedSlugs
    .filter((slug) => !seen.has(slug))
    .map((slug) => getConstraintBySlug(slug))
    .filter((c): c is AssistantConstraint => Boolean(c));

  return [...relevant, ...extra];
}

export function formatConstraintDetail(
  constraint: Pick<
    SavedProjectConstraint,
    "slug" | "metres" | "description" | "severity"
  >
): string | undefined {
  if (constraint.metres != null) {
    return `${constraint.metres}m`;
  }
  if (constraint.description?.trim()) {
    return constraint.description.trim();
  }
  if (constraint.severity) {
    const labels: Record<string, string> = {
      low: "Low",
      typical: "Typical",
      high: "High",
    };
    return labels[constraint.severity] ?? constraint.severity;
  }
  return undefined;
}

export function formatConstraintSummaryLine(
  constraint: SavedProjectConstraint,
  modifier?: string
): string {
  const detail = formatConstraintDetail(constraint);
  if (detail && modifier) {
    return `${constraint.label}: ${detail} ${modifier}`;
  }
  if (detail) {
    return `${constraint.label}: ${detail}`;
  }
  if (modifier) {
    return `${constraint.label} ${modifier}`;
  }
  return constraint.label;
}

/** Build human-readable constraint lines for discovery summary. */
export function buildDiscoverySummaryConstraints(
  discoveryConstraints: { slug: string; label: string }[],
  savedConstraints: SavedProjectConstraint[],
  answeredQuestionKeys: Set<string> = new Set()
): DiscoverySummaryConstraint[] {
  const items: DiscoverySummaryConstraint[] = [];
  const seen = new Set<string>();

  for (const constraint of discoveryConstraints) {
    if (isConstraintSupersededByQuestion(constraint.slug, answeredQuestionKeys)) {
      continue;
    }
    seen.add(constraint.slug);
    items.push({
      slug: constraint.slug,
      label: constraint.label,
      source: "notes",
    });
  }

  for (const constraint of savedConstraints) {
    if (isConstraintSupersededByQuestion(constraint.slug, answeredQuestionKeys)) {
      continue;
    }

    const detail = formatConstraintDetail(constraint);
    const existing = items.find((item) => item.slug === constraint.slug);

    if (existing) {
      if (detail) {
        existing.detail = detail;
      }
      existing.source = "user";
      continue;
    }

    seen.add(constraint.slug);
    items.push({
      slug: constraint.slug,
      label: constraint.label,
      detail,
      source: constraint.source === "notes" ? "notes" : "user",
    });
  }

  return items;
}

export async function loadSavedProjectConstraints(
  supabase: Supabase,
  organisationId: string,
  projectId: string,
  quickEstimateId?: string | null
): Promise<{
  slugs: string[];
  declinedSlugs: string[];
  followUpValues: Record<string, string | number>;
  constraints: SavedProjectConstraint[];
  assessedSlugs: string[];
  error: string | null;
}> {
  const [{ data: selections, error: selectionsError }, { data: projectDrivers }] =
    await Promise.all([
      supabase
        .from("project_constraint_selections")
        .select("constraint_key, label, selected, metadata")
        .eq("project_id", projectId)
        .eq("organisation_id", organisationId),
      quickEstimateId
        ? listProjectEstimateDrivers(supabase, organisationId, quickEstimateId)
        : Promise.resolve({ data: [] }),
    ]);

  if (selectionsError) {
    return {
      slugs: [],
      declinedSlugs: [],
      followUpValues: {},
      constraints: [],
      assessedSlugs: [],
      error: selectionsError.message,
    };
  }

  const slugs: string[] = [];
  const declinedSlugs: string[] = [];
  const assessedSlugs: string[] = [];
  const followUpValues: Record<string, string | number> = {};
  const constraints: SavedProjectConstraint[] = [];

  for (const row of selections ?? []) {
    const slug = row.constraint_key;
    assessedSlugs.push(slug);
    const parsed = parseSavedValue(row.metadata);
    const def = getConstraintBySlug(slug);
    const isDeclined = row.selected === false;

    if (isDeclined) {
      declinedSlugs.push(slug);
      continue;
    }

    slugs.push(slug);
    constraints.push({
      slug,
      label: row.label || def?.label || slug,
      metres: parsed.metres,
      description: parsed.description,
      severity: parsed.severity,
      source: parsed.source,
    });

    if (parsed.metres != null) {
      followUpValues[slug] = parsed.metres;
    } else if (parsed.description) {
      followUpValues[slug] = parsed.description;
    } else if (parsed.severity) {
      followUpValues[slug] = parsed.severity;
    }
  }

  devLog("constraints.load.saved", {
    projectId,
    slugs,
    declinedSlugs,
    assessedSlugs,
    followUpValues,
    projectEstimateDrivers: (projectDrivers ?? []).map((d) => ({
      id: d.id,
      estimate_driver_id: d.estimate_driver_id,
      slug: (d.estimate_drivers as { slug?: string } | null)?.slug,
    })),
    selectionRows: (selections ?? []).map((row) => ({
      constraint_key: row.constraint_key,
      selected: row.selected,
      metadata: row.metadata,
    })),
  });

  return { slugs, declinedSlugs, followUpValues, constraints, assessedSlugs, error: null };
}

export function mergeDeclinedConstraintSlugs(
  fromDb: string[],
  fromMessages: Iterable<string>
): string[] {
  return [...new Set([...fromDb, ...fromMessages])];
}
