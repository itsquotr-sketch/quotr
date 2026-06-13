import type { DiscoveryRunResult } from "@/lib/ai/discovery/types";
import { insertAssistantMessage } from "@/lib/assistant-v2/assistant-messages-data";
import { applyClassificationToDiscoveryResult } from "@/lib/scopes/classification/process-discovery-items";
import { isInternalWorksBroadCategory } from "@/lib/scopes/classification/classify-detected-scope";
import {
  formatBroadCategoryNotes,
  getWorkAreaDisplayInfo,
} from "@/lib/scopes/classification/display-work-area";
import { INTERNAL_WORKS_CLARIFICATION_OPTIONS } from "@/lib/scopes/classification/types";
import { resolveWorkPackagePricing } from "@/lib/scopes/classification/work-package-pricing";
import { logSupabaseError } from "@/lib/supabase/log-error";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type Supabase = SupabaseClient<Database>;

async function resolveInternalAlterationScopeTypeId(supabase: Supabase) {
  const { data } = await supabase
    .from("scope_types")
    .select("id")
    .ilike("name", "Internal alteration")
    .eq("is_active", true)
    .maybeSingle();
  return data?.id ?? null;
}

async function findExistingBroadCategoryScope(
  supabase: Supabase,
  organisationId: string,
  projectId: string,
  broadCategoryKey: string
) {
  const { data } = await supabase
    .from("project_scopes")
    .select("id, name, classification_status, notes")
    .eq("project_id", projectId)
    .eq("organisation_id", organisationId)
    .in("classification_status", ["broad_category", "needs_clarification"])
    .maybeSingle();

  if (!data) return null;
  const notes = data.notes ?? "";
  if (notes.includes(`broad_category_key:${broadCategoryKey}`)) {
    return data;
  }
  if (
    isInternalWorksBroadCategory(broadCategoryKey) &&
    data.name.toLowerCase().includes("internal")
  ) {
    return data;
  }
  return null;
}

async function ensureBroadCategoryScope(
  supabase: Supabase,
  params: {
    organisationId: string;
    projectId: string;
    broadCategoryKey: string;
    displayLabel: string;
  }
): Promise<string | null> {
  const existing = await findExistingBroadCategoryScope(
    supabase,
    params.organisationId,
    params.projectId,
    params.broadCategoryKey
  );
  if (existing) return existing.id;

  const scopeTypeId = await resolveInternalAlterationScopeTypeId(supabase);

  const { count } = await supabase
    .from("project_scopes")
    .select("id", { count: "exact", head: true })
    .eq("project_id", params.projectId);

  const { data: scope, error } = await supabase
    .from("project_scopes")
    .insert({
      project_id: params.projectId,
      organisation_id: params.organisationId,
      scope_type_id: scopeTypeId,
      name: params.displayLabel,
      description: "Internal works that need clarification before pricing.",
      status: "draft",
      ai_status: "not_started",
      ai_confidence: 0,
      confidence_level: "low",
      is_custom: false,
      include_in_quick_estimate: false,
      classification_status: "needs_clarification",
      notes: formatBroadCategoryNotes(params.broadCategoryKey),
      sort_order: count ?? 0,
    })
    .select("id")
    .single();

  if (error) {
    logSupabaseError("ensureBroadCategoryScope.insert", error);
    return null;
  }

  return scope?.id ?? null;
}

async function insertHeldPackages(
  supabase: Supabase,
  params: {
    organisationId: string;
    projectId: string;
    projectScopeId: string | null;
    packages: { packageKey: string; label: string }[];
  }
) {
  if (params.packages.length === 0) return;

  for (const pkg of params.packages) {
    const pricing = resolveWorkPackagePricing(pkg.packageKey);

    const existingQuery = supabase
      .from("project_scope_packages")
      .select("id")
      .eq("project_id", params.projectId)
      .eq("package_key", pkg.packageKey)
      .neq("status", "rejected");

    const { data: existing } = params.projectScopeId
      ? await existingQuery
          .eq("project_scope_id", params.projectScopeId)
          .maybeSingle()
      : await existingQuery.is("project_scope_id", null).maybeSingle();

    if (existing) continue;

    const { error } = await supabase.from("project_scope_packages").insert({
      organisation_id: params.organisationId,
      project_id: params.projectId,
      project_scope_id: params.projectScopeId,
      package_key: pkg.packageKey,
      label: pkg.label,
      status: "suggested",
      include_in_quick_estimate: pricing.includeInQuickEstimate,
      metadata: { source: "discovery" },
    });

    if (error && error.code !== "42P01") {
      logSupabaseError("insertHeldPackages", error);
    }
  }
}

export async function insertInternalWorksClarificationMessage(
  supabase: Supabase,
  params: {
    organisationId: string;
    projectId: string;
    userId: string;
    broadCategoryKey: string;
    projectScopeId: string | null;
    detectedPackages?: { packageKey: string; label: string }[];
  }
) {
  const isInternal = isInternalWorksBroadCategory(params.broadCategoryKey);
  const content = isInternal
    ? "I found some additional internal works, but I need to clarify what they involve before estimating them."
    : "I found some additional works, but I need to clarify what they involve before estimating them.";

  await insertAssistantMessage(supabase, {
    organisationId: params.organisationId,
    projectId: params.projectId,
    userId: params.userId,
    role: "assistant",
    content,
    metadata: {
      messageType: "internal_works_clarification",
      broadCategoryKey: params.broadCategoryKey,
      projectScopeId: params.projectScopeId,
      question: "Which of these apply?",
      options: INTERNAL_WORKS_CLARIFICATION_OPTIONS.map((o) => ({
        key: o.key,
        label: o.label,
      })),
      detectedPackages: params.detectedPackages ?? [],
    },
  });
}

/**
 * Classify discovery items and split work areas from broad categories / packages.
 */
export function classifyDiscoveryResult(
  result: DiscoveryRunResult,
  notes: string
): DiscoveryRunResult & {
  broadCategories: ReturnType<
    typeof applyClassificationToDiscoveryResult
  >["processed"]["broadCategories"];
  heldPackages: ReturnType<
    typeof applyClassificationToDiscoveryResult
  >["processed"]["heldPackages"];
  unknownItems: ReturnType<
    typeof applyClassificationToDiscoveryResult
  >["processed"]["unknownItems"];
} {
  const { workAreas, processed } = applyClassificationToDiscoveryResult(
    result.workAreas,
    notes
  );

  return {
    ...result,
    workAreas,
    broadCategories: processed.broadCategories,
    heldPackages: processed.heldPackages,
    unknownItems: processed.unknownItems,
  };
}

export async function applyBroadCategoryAndPackages(
  supabase: Supabase,
  params: {
    organisationId: string;
    projectId: string;
    userId: string;
    classified: ReturnType<typeof classifyDiscoveryResult>;
  }
): Promise<void> {
  for (const broad of params.classified.broadCategories) {
    const scopeId = await ensureBroadCategoryScope(supabase, {
      organisationId: params.organisationId,
      projectId: params.projectId,
      broadCategoryKey: broad.broadCategoryKey,
      displayLabel: broad.displayLabel,
    });

    const relatedPackages = params.classified.heldPackages.filter(
      (p) => !p.parentWorkAreaKey
    );

    if (scopeId && relatedPackages.length > 0) {
      await insertHeldPackages(supabase, {
        organisationId: params.organisationId,
        projectId: params.projectId,
        projectScopeId: scopeId,
        packages: relatedPackages.map((p) => ({
          packageKey: p.packageKey,
          label: p.label,
        })),
      });
    }

    await insertInternalWorksClarificationMessage(supabase, {
      organisationId: params.organisationId,
      projectId: params.projectId,
      userId: params.userId,
      broadCategoryKey: broad.broadCategoryKey,
      projectScopeId: scopeId,
      detectedPackages: relatedPackages.map((p) => ({
        packageKey: p.packageKey,
        label: p.label,
      })),
    });
  }

  if (
    params.classified.broadCategories.length === 0 &&
    params.classified.heldPackages.length > 0
  ) {
    const scopeId = await ensureBroadCategoryScope(supabase, {
      organisationId: params.organisationId,
      projectId: params.projectId,
      broadCategoryKey: "internal_works",
      displayLabel: "Additional internal works",
    });

    await insertHeldPackages(supabase, {
      organisationId: params.organisationId,
      projectId: params.projectId,
      projectScopeId: scopeId,
      packages: params.classified.heldPackages.map((p) => ({
        packageKey: p.packageKey,
        label: p.label,
      })),
    });

    if (scopeId) {
      await insertInternalWorksClarificationMessage(supabase, {
        organisationId: params.organisationId,
        projectId: params.projectId,
        userId: params.userId,
        broadCategoryKey: "internal_works",
        projectScopeId: scopeId,
        detectedPackages: params.classified.heldPackages.map((p) => ({
          packageKey: p.packageKey,
          label: p.label,
        })),
      });
    }
  }

  if (params.classified.unknownItems.length > 0) {
    await insertAssistantMessage(supabase, {
      organisationId: params.organisationId,
      projectId: params.projectId,
      userId: params.userId,
      role: "assistant",
      content:
        "I found some work mentioned in your notes but need a bit more detail. What internal works are involved?",
      metadata: {
        messageType: "internal_works_clarification",
        broadCategoryKey: "internal_works",
        projectScopeId: null,
        question: "Which of these apply?",
        options: INTERNAL_WORKS_CLARIFICATION_OPTIONS.map((o) => ({
          key: o.key,
          label: o.label,
        })),
        detectedPackages: [],
      },
    });
  }
}

/** Migrate legacy internal alteration scopes for display without deleting data. */
export async function normaliseLegacyBroadCategoryScopes(
  supabase: Supabase,
  organisationId: string,
  projectId: string
): Promise<void> {
  const { data: scopes } = await supabase
    .from("project_scopes")
    .select("id, name, ai_confidence, classification_status, scope_types(name)")
    .eq("project_id", projectId)
    .eq("organisation_id", organisationId);

  for (const scope of scopes ?? []) {
    const display = getWorkAreaDisplayInfo(
      scope as Parameters<typeof getWorkAreaDisplayInfo>[0]
    );
    if (!display.isBroadCategory || scope.classification_status !== "confirmed") {
      continue;
    }

    const typeName = (scope.scope_types as { name: string } | null)?.name ?? "";
    if (
      typeName.toLowerCase().includes("internal") &&
      (scope.ai_confidence === 0 || scope.ai_confidence === null)
    ) {
      await supabase
        .from("project_scopes")
        .update({
          name: "Additional internal works",
          classification_status: "needs_clarification",
          include_in_quick_estimate: false,
          notes: formatBroadCategoryNotes("internal_alteration"),
        })
        .eq("id", scope.id)
        .eq("organisation_id", organisationId);
    }
  }
}
