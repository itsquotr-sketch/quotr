import { insertAssistantMessage } from "@/lib/assistant-v2/assistant-messages-data";
import {
  buildEvaluateWorkAreas,
  getFollowUpFactQuestionsForScope,
} from "@/lib/assistant-v2/completeness/build-evaluate-input";
import { buildScopeFollowUpMessage } from "@/lib/assistant-v2/completeness/evaluate-project-completeness";
import type {
  OnlyIncludeWorkAreasPayload,
  WorkAreaCommandPayload,
} from "@/lib/assistant-v2/intent/types";
import type { CommandResult } from "@/lib/assistant-v2/commands/update-allowance";
import { recalculateQuickEstimate } from "@/lib/cost-engine/recalculate-quick-estimate";
import type { EstimateChangeEvent } from "@/lib/cost-engine/recalculate-quick-estimate";
import { formatCurrencyRange } from "@/lib/format-currency";
import { listScopeQuestionsForProject } from "@/lib/project-assistant-data";
import { resolveWorkAreaTypeKey } from "@/lib/project-assistant-questions";
import { getScopeByAlias } from "@/lib/scopes";
import {
  getCanonicalTemplateByAlias,
} from "@/lib/scopes/templates";
import {
  buildMultiScopePricingGuidance,
  resolveScopePricingState,
} from "@/lib/scopes/pricing-state";
import { ensureQuestionsForProjectScopes } from "@/lib/scope-questions-seed";
import { syncScopeQuestionsForScope } from "@/lib/scope-questions-seed";
import { logSupabaseError } from "@/lib/supabase/log-error";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, ProjectScope } from "@/types/database";
type Supabase = SupabaseClient<Database>;

const TEMPLATE_SCOPE_TYPE_SLUGS: Record<string, string> = {
  deck: "deck",
  retaining_wall: "other",
  bathroom_renovation: "bathroom-renovation",
  fence: "other",
  painting_project: "other",
  kitchen_renovation: "other",
  flooring_project: "other",
};

function formatEstimateDelta(
  event: EstimateChangeEvent | null | undefined
): string {
  if (!event || event.kind === "unchanged") return "";

  const prevMid = (event.previousLow + event.previousHigh) / 2;
  const newMid = (event.newLow + event.newHigh) / 2;
  const delta = Math.abs(newMid - prevMid);

  if (delta < 50) return "";

  const formatted = `$${Math.round(delta).toLocaleString("en-NZ")}`;
  if (event.kind === "increased") return ` Estimate increased by ${formatted}.`;
  if (event.kind === "decreased") return ` Estimate decreased by ${formatted}.`;

  const from = formatCurrencyRange(event.previousLow, event.previousHigh);
  const to = formatCurrencyRange(event.newLow, event.newHigh);
  return ` Estimate updated: ${from} → ${to}.`;
}

async function appendScopeFollowUpIfNeeded(
  supabase: Supabase,
  params: {
    organisationId: string;
    projectId: string;
    userId: string;
    scopeId: string;
    scopeName: string;
    action: "added" | "included";
  }
): Promise<void> {
  const { data: scopes } = await supabase
    .from("project_scopes")
    .select("*, scope_types(name)")
    .eq("project_id", params.projectId)
    .eq("organisation_id", params.organisationId);

  if (!scopes?.length) return;

  const scopeIds = scopes.map((s) => s.id);
  const { data: scopeQuestions } = await listScopeQuestionsForProject(
    supabase,
    scopeIds
  );

  const workAreas = buildEvaluateWorkAreas(
    scopes as (ProjectScope & { scope_types: { name: string } | null })[],
    scopeQuestions ?? [],
    null
  );

  const followUpQuestions = getFollowUpFactQuestionsForScope(
    workAreas,
    params.scopeId,
    3
  );

  if (followUpQuestions.length === 0) return;

  const content = buildScopeFollowUpMessage(
    params.scopeName,
    followUpQuestions,
    params.action
  );

  await insertAssistantMessage(supabase, {
    organisationId: params.organisationId,
    projectId: params.projectId,
    userId: params.userId,
    role: "assistant",
    content,
    metadata: {
      messageType: "scope_follow_up",
      scopeId: params.scopeId,
      commandIntent: params.action === "added" ? "add_work_area" : "include_work_area",
    },
  });
}

async function findScopeByName(
  supabase: Supabase,
  organisationId: string,
  projectId: string,
  workAreaName: string
) {
  const { data: scopes } = await supabase
    .from("project_scopes")
    .select("id, name, include_in_quick_estimate, scope_types(name)")
    .eq("project_id", projectId)
    .eq("organisation_id", organisationId);

  if (!scopes?.length) return null;

  const lower = workAreaName.toLowerCase();
  return (
    scopes.find((s) => s.name.toLowerCase() === lower) ??
    scopes.find(
      (s) =>
        s.name.toLowerCase().includes(lower) ||
        lower.includes(s.name.toLowerCase())
    ) ??
    null
  );
}

export async function executeExcludeWorkArea(
  supabase: Supabase,
  params: {
    organisationId: string;
    projectId: string;
    userId: string;
    payload: WorkAreaCommandPayload;
  }
): Promise<CommandResult> {
  const scope = params.payload.scopeId
    ? (
        await supabase
          .from("project_scopes")
          .select("id, name, include_in_quick_estimate")
          .eq("id", params.payload.scopeId)
          .eq("organisation_id", params.organisationId)
          .maybeSingle()
      ).data
    : await findScopeByName(
        supabase,
        params.organisationId,
        params.projectId,
        params.payload.workAreaName
      );

  if (!scope) {
    return {
      success: false,
      message: "",
      error: `Could not find work area "${params.payload.workAreaName}".`,
    };
  }

  if (scope.include_in_quick_estimate === false) {
    return {
      success: true,
      message: `${scope.name} is already excluded from this estimate.`,
      estimateRecalculated: false,
    };
  }

  const { error } = await supabase
    .from("project_scopes")
    .update({ include_in_quick_estimate: false })
    .eq("id", scope.id)
    .eq("organisation_id", params.organisationId);

  if (error) {
    logSupabaseError("executeExcludeWorkArea", error);
    return { success: false, message: "", error: "Could not exclude work area." };
  }

  const recalc = await recalculateQuickEstimate(
    supabase,
    params.organisationId,
    params.projectId,
    { triggerEvent: "work_area_excluded", changeReason: `${scope.name} excluded` }
  );

  const message = `Removed ${scope.name} from the quick estimate. It is still saved on the project if you need it later.${formatEstimateDelta(recalc.estimateChange)}`;

  await insertAssistantMessage(supabase, {
    organisationId: params.organisationId,
    projectId: params.projectId,
    userId: params.userId,
    role: "assistant",
    content: message,
    metadata: { messageType: "assistant_text", commandIntent: "exclude_work_area" },
  });

  return { success: true, message, estimateRecalculated: true };
}

export async function executeIncludeWorkArea(
  supabase: Supabase,
  params: {
    organisationId: string;
    projectId: string;
    userId: string;
    payload: WorkAreaCommandPayload;
  }
): Promise<CommandResult> {
  const scope = await findScopeByName(
    supabase,
    params.organisationId,
    params.projectId,
    params.payload.workAreaName
  );

  if (!scope) {
    return {
      success: false,
      message: "",
      error: `Could not find work area "${params.payload.workAreaName}".`,
    };
  }

  if (scope.include_in_quick_estimate !== false) {
    return {
      success: true,
      message: `${scope.name} is already included in this estimate.`,
      estimateRecalculated: false,
    };
  }

  const { error } = await supabase
    .from("project_scopes")
    .update({ include_in_quick_estimate: true })
    .eq("id", scope.id)
    .eq("organisation_id", params.organisationId);

  if (error) {
    logSupabaseError("executeIncludeWorkArea", error);
    return { success: false, message: "", error: "Could not include work area." };
  }

  await recalculateQuickEstimate(
    supabase,
    params.organisationId,
    params.projectId,
    { triggerEvent: "work_area_included", changeReason: `${scope.name} included` }
  );

  const message = `Included ${scope.name} in this estimate.`;

  await insertAssistantMessage(supabase, {
    organisationId: params.organisationId,
    projectId: params.projectId,
    userId: params.userId,
    role: "assistant",
    content: message,
    metadata: { messageType: "assistant_text", commandIntent: "include_work_area" },
  });

  await appendScopeFollowUpIfNeeded(supabase, {
    organisationId: params.organisationId,
    projectId: params.projectId,
    userId: params.userId,
    scopeId: scope.id,
    scopeName: scope.name,
    action: "included",
  });

  return { success: true, message, estimateRecalculated: true };
}

export async function executeAddWorkArea(
  supabase: Supabase,
  params: {
    organisationId: string;
    projectId: string;
    userId: string;
    payload: WorkAreaCommandPayload;
  }
): Promise<CommandResult> {
  const name = params.payload.workAreaName.trim();
  if (!name) {
    return { success: false, message: "", error: "Work area name is required." };
  }

  const existing = await findScopeByName(
    supabase,
    params.organisationId,
    params.projectId,
    name
  );

  if (existing) {
    if (existing.include_in_quick_estimate === false) {
      return executeIncludeWorkArea(supabase, {
        ...params,
        payload: { workAreaName: existing.name, scopeId: existing.id },
      });
    }
    return {
      success: true,
      message: `${existing.name} is already in this estimate.`,
      estimateRecalculated: false,
    };
  }

  const supportedScope = getScopeByAlias(name);
  const canonicalTemplate = getCanonicalTemplateByAlias(name);
  const pricingSupported =
    supportedScope != null ||
    (canonicalTemplate?.pricing.supported ?? false);
  const isCustom =
    params.payload.isCustom ?? (!pricingSupported && !canonicalTemplate);
  const includeInEstimate =
    pricingSupported && !(canonicalTemplate && !canonicalTemplate.pricing.supported);

  let scopeTypeId: string | null = null;
  const templateKey =
    supportedScope?.id ?? canonicalTemplate?.scopeTypeKey ?? null;
  if (templateKey) {
    const slug = TEMPLATE_SCOPE_TYPE_SLUGS[templateKey] ?? "other";
    const { data: scopeType } = await supabase
      .from("scope_types")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();
    scopeTypeId = scopeType?.id ?? null;
  } else {
    const { data: otherType } = await supabase
      .from("scope_types")
      .select("id")
      .eq("slug", "other")
      .maybeSingle();
    scopeTypeId = otherType?.id ?? null;
  }

  const displayName =
    supportedScope?.name ?? canonicalTemplate?.label ?? name;

  const { data: maxSort } = await supabase
    .from("project_scopes")
    .select("sort_order")
    .eq("project_id", params.projectId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: scope, error: scopeError } = await supabase
    .from("project_scopes")
    .insert({
      organisation_id: params.organisationId,
      project_id: params.projectId,
      scope_type_id: scopeTypeId,
      name: displayName,
      is_custom: isCustom,
      include_in_quick_estimate: includeInEstimate,
      sort_order: (maxSort?.sort_order ?? 0) + 1,
      status: "draft",
      ai_status: "not_started",
      estimate_status: "draft",
    })
    .select("id, name, scope_types(name)")
    .single();

  if (scopeError || !scope) {
    logSupabaseError("executeAddWorkArea", scopeError);
    return { success: false, message: "", error: "Could not add work area." };
  }

  await syncScopeQuestionsForScope(
    supabase,
    params.organisationId,
    params.projectId,
    scope as { id: string; name: string; scope_types: { name: string } | null }
  );
  await ensureQuestionsForProjectScopes(
    supabase,
    params.organisationId,
    params.projectId
  );

  await recalculateQuickEstimate(
    supabase,
    params.organisationId,
    params.projectId,
    { triggerEvent: "work_area_added", changeReason: `${displayName} added` }
  );

  const pricingState = resolveScopePricingState({
    workAreaTypeKey: canonicalTemplate?.workAreaTypeKey ?? displayName,
    scopeName: displayName,
  });

  const message = isCustom
    ? `Added ${displayName} as a custom work area. ${pricingState.message} It is excluded from the quick estimate for now.`
    : !pricingState.canIncludeInEstimate
      ? `Added ${displayName} to the project. ${pricingState.message}`
      : pricingState.usesRoughAllowance
        ? `Added ${displayName} to the project. ${pricingState.message}`
        : `Added ${displayName} to the project and included it in the quick estimate.`;

  await insertAssistantMessage(supabase, {
    organisationId: params.organisationId,
    projectId: params.projectId,
    userId: params.userId,
    role: "assistant",
    content: message,
    metadata: { messageType: "assistant_text", commandIntent: "add_work_area" },
  });

  if (includeInEstimate && !isCustom) {
  await appendScopeFollowUpIfNeeded(supabase, {
    organisationId: params.organisationId,
    projectId: params.projectId,
    userId: params.userId,
    scopeId: scope.id,
    scopeName: displayName,
    action: "added",
  });

  const { data: allScopes } = await supabase
    .from("project_scopes")
    .select("name, scope_types(name)")
    .eq("project_id", params.projectId)
    .eq("organisation_id", params.organisationId);

  const guidance = buildMultiScopePricingGuidance({
    workAreas: (allScopes ?? []).map((s) => ({
      scopeName: s.name,
      workAreaTypeKey: resolveWorkAreaTypeKey(
        (s.scope_types as { name: string } | null)?.name ?? null,
        s.name
      ),
    })),
  });

  if (guidance) {
    await insertAssistantMessage(supabase, {
      organisationId: params.organisationId,
      projectId: params.projectId,
      userId: params.userId,
      role: "assistant",
      content: guidance.message,
      metadata: {
        messageType: "fallback_options",
        fallbackOptions: guidance.options,
      },
    });
  }
  }

  return { success: true, message, estimateRecalculated: includeInEstimate };
}

export async function executeOnlyIncludeWorkAreas(
  supabase: Supabase,
  params: {
    organisationId: string;
    projectId: string;
    userId: string;
    payload: OnlyIncludeWorkAreasPayload;
  }
): Promise<CommandResult> {
  const { data: scopes } = await supabase
    .from("project_scopes")
    .select("id, name, include_in_quick_estimate")
    .eq("project_id", params.projectId)
    .eq("organisation_id", params.organisationId);

  if (!scopes?.length) {
    return {
      success: false,
      message: "",
      error: "No work areas found on this project.",
    };
  }

  const includedNames = params.payload.includedWorkAreaNames.map((n) =>
    n.toLowerCase()
  );

  const toInclude = scopes.filter((s) =>
    includedNames.some(
      (name) =>
        s.name.toLowerCase() === name ||
        s.name.toLowerCase().includes(name) ||
        name.includes(s.name.toLowerCase())
    )
  );

  if (toInclude.length === 0) {
    return {
      success: false,
      message: "",
      error: `Could not find work area matching "${params.payload.includedWorkAreaNames.join(", ")}".`,
    };
  }

  const includeIds = new Set(toInclude.map((s) => s.id));

  for (const scope of scopes) {
    const shouldInclude = includeIds.has(scope.id);
    if (scope.include_in_quick_estimate === shouldInclude) continue;

    const { error } = await supabase
      .from("project_scopes")
      .update({ include_in_quick_estimate: shouldInclude })
      .eq("id", scope.id)
      .eq("organisation_id", params.organisationId);

    if (error) {
      logSupabaseError("executeOnlyIncludeWorkAreas", error);
      return {
        success: false,
        message: "",
        error: "Could not update work areas.",
      };
    }
  }

  const recalc = await recalculateQuickEstimate(
    supabase,
    params.organisationId,
    params.projectId,
    {
      triggerEvent: "work_area_excluded",
      changeReason: `Only pricing ${toInclude.map((s) => s.name).join(", ")}`,
    }
  );

  const excluded = scopes
    .filter((s) => !includeIds.has(s.id))
    .map((s) => s.name);

  const message =
    excluded.length > 0
      ? `Quick estimate now includes only ${toInclude.map((s) => s.name).join(", ")}. Excluded: ${excluded.join(", ")}.${formatEstimateDelta(recalc.estimateChange)}`
      : `Quick estimate includes ${toInclude.map((s) => s.name).join(", ")}.${formatEstimateDelta(recalc.estimateChange)}`;

  await insertAssistantMessage(supabase, {
    organisationId: params.organisationId,
    projectId: params.projectId,
    userId: params.userId,
    role: "assistant",
    content: message,
    metadata: {
      messageType: "assistant_text",
      commandIntent: "only_include_work_areas",
    },
  });

  return { success: true, message, estimateRecalculated: true };
}
