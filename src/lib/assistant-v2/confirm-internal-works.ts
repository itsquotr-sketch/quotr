import { recalculateQuickEstimate } from "@/lib/cost-engine/recalculate-quick-estimate";
import { insertAssistantMessage } from "@/lib/assistant-v2/assistant-messages-data";
import {
  formatBroadCategoryNotes,
} from "@/lib/scopes/classification/display-work-area";
import { INTERNAL_WORKS_CLARIFICATION_OPTIONS } from "@/lib/scopes/classification/types";
import { resolveWorkPackagePricing } from "@/lib/scopes/classification/work-package-pricing";
import { logSupabaseError } from "@/lib/supabase/log-error";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type Supabase = SupabaseClient<Database>;

export type ConfirmInternalWorksResult = {
  error?: string;
  addedPackages: string[];
  scopeNoteMessage: string | null;
};

function packageLabel(key: string): string {
  const opt = INTERNAL_WORKS_CLARIFICATION_OPTIONS.find((o) => o.key === key);
  return opt?.label ?? key.replace(/_/g, " ");
}

async function resolveInternalAlterationScopeTypeId(supabase: Supabase) {
  const { data } = await supabase
    .from("scope_types")
    .select("id")
    .ilike("name", "Internal alteration")
    .eq("is_active", true)
    .maybeSingle();
  return data?.id ?? null;
}

export async function confirmInternalWorksPackages(
  supabase: Supabase,
  params: {
    organisationId: string;
    projectId: string;
    userId: string;
    projectScopeId: string | null;
    selectedPackageKeys: string[];
    broadCategoryKey?: string;
  }
): Promise<ConfirmInternalWorksResult> {
  if (params.selectedPackageKeys.length === 0) {
    return { error: "Select at least one item, or choose None of these apply.", addedPackages: [], scopeNoteMessage: null };
  }

  let scopeId = params.projectScopeId;

  if (!scopeId) {
    const scopeTypeId = await resolveInternalAlterationScopeTypeId(supabase);
    const { count } = await supabase
      .from("project_scopes")
      .select("id", { count: "exact", head: true })
      .eq("project_id", params.projectId);

    const broadKey = params.broadCategoryKey ?? "internal_alteration";
    const { data: scope, error } = await supabase
      .from("project_scopes")
      .insert({
        project_id: params.projectId,
        organisation_id: params.organisationId,
        scope_type_id: scopeTypeId,
        name: "Additional internal works",
        description: "Confirmed internal work packages.",
        status: "draft",
        ai_status: "not_started",
        ai_confidence: null,
        confidence_level: "medium",
        is_custom: false,
        include_in_quick_estimate: false,
        classification_status: "broad_category",
        notes: formatBroadCategoryNotes(broadKey),
        sort_order: count ?? 0,
      })
      .select("id")
      .single();

    if (error || !scope) {
      logSupabaseError("confirmInternalWorksPackages.createScope", error);
      return { error: "Could not save internal works.", addedPackages: [], scopeNoteMessage: null };
    }
    scopeId = scope.id;
  } else {
    await supabase
      .from("project_scopes")
      .update({
        classification_status: "broad_category",
        include_in_quick_estimate: false,
        name: "Additional internal works",
      })
      .eq("id", scopeId)
      .eq("organisation_id", params.organisationId);
  }

  const addedPackages: string[] = [];
  let needsPricingNote = false;
  let needsQuantityNote = false;

  for (const packageKey of params.selectedPackageKeys) {
    if (packageKey === "other") continue;

    const label = packageLabel(packageKey);
    const pricing = resolveWorkPackagePricing(packageKey);

    const { data: existing } = await supabase
      .from("project_scope_packages")
      .select("id")
      .eq("project_id", params.projectId)
      .eq("package_key", packageKey)
      .eq("project_scope_id", scopeId)
      .neq("status", "rejected")
      .maybeSingle();

    if (existing) {
      await supabase
        .from("project_scope_packages")
        .update({
          label,
          status: "confirmed",
          include_in_quick_estimate: pricing.includeInQuickEstimate,
          metadata: { source: "user_clarification" },
        })
        .eq("id", existing.id);
    } else {
      const { error } = await supabase.from("project_scope_packages").insert({
        organisation_id: params.organisationId,
        project_id: params.projectId,
        project_scope_id: scopeId,
        package_key: packageKey,
        label,
        status: "confirmed",
        include_in_quick_estimate: pricing.includeInQuickEstimate,
        metadata: { source: "user_clarification" },
      });

      if (error && error.code !== "42P01") {
        logSupabaseError("confirmInternalWorksPackages.insert", error);
        continue;
      }
    }

    addedPackages.push(label);
    if (pricing.status === "needs_pricing") needsPricingNote = true;
    if (pricing.status === "scope_note_only") needsQuantityNote = true;
  }

  const userContent =
    addedPackages.length > 0
      ? `Confirmed: ${addedPackages.join(", ")}`
      : "Custom internal works";

  await insertAssistantMessage(supabase, {
    organisationId: params.organisationId,
    projectId: params.projectId,
    userId: params.userId,
    role: "user",
    content: userContent,
    metadata: { messageType: "answer", internalWorksConfirmation: true },
  });

  let assistantText = `Got it — I've added ${addedPackages.join(", ")} as scope items.`;
  let scopeNoteMessage: string | null = null;

  if (needsPricingNote) {
    scopeNoteMessage = "Needs pricing before estimate can include this.";
    assistantText += ` ${scopeNoteMessage}`;
  } else if (needsQuantityNote) {
    scopeNoteMessage =
      "I've added these as scope items. Add rates or quantities to include them in the estimate.";
    assistantText += ` ${scopeNoteMessage}`;
  } else if (addedPackages.some((l) => resolveWorkPackagePricing(
    params.selectedPackageKeys[addedPackages.indexOf(l)] ?? ""
  ).includeInQuickEstimate)) {
    await recalculateQuickEstimate(
      supabase,
      params.organisationId,
      params.projectId,
      { triggerEvent: "internal_works_confirmed", changeReason: "internal works packages confirmed" }
    );
  }

  await insertAssistantMessage(supabase, {
    organisationId: params.organisationId,
    projectId: params.projectId,
    userId: params.userId,
    role: "assistant",
    content: assistantText,
    metadata: { messageType: "assistant_text" },
  });

  return { addedPackages, scopeNoteMessage };
}

export async function listScopePackagesForProject(
  supabase: Supabase,
  organisationId: string,
  projectId: string
) {
  const { data, error } = await supabase
    .from("project_scope_packages")
    .select("*")
    .eq("project_id", projectId)
    .eq("organisation_id", organisationId)
    .neq("status", "rejected")
    .order("created_at", { ascending: true });

  if (error) {
    if (error.code === "42P01") return [];
    logSupabaseError("listScopePackagesForProject", error);
    return [];
  }

  return data ?? [];
}

export async function removeBroadCategoryScope(
  supabase: Supabase,
  organisationId: string,
  projectId: string,
  scopeId: string
): Promise<{ error?: string }> {
  const { error: pkgError } = await supabase
    .from("project_scope_packages")
    .delete()
    .eq("project_scope_id", scopeId)
    .eq("organisation_id", organisationId);

  if (pkgError && pkgError.code !== "42P01") {
    logSupabaseError("removeBroadCategoryScope.packages", pkgError);
  }

  const { error } = await supabase
    .from("project_scopes")
    .delete()
    .eq("id", scopeId)
    .eq("project_id", projectId)
    .eq("organisation_id", organisationId);

  if (error) {
    logSupabaseError("removeBroadCategoryScope.scope", error);
    return { error: error.message };
  }

  return {};
}
