import { runAssistantAutopilot } from "@/lib/assistant-v2/autopilot/run-assistant-autopilot";
import { insertAssistantMessage } from "@/lib/assistant-v2/assistant-messages-data";
import { ensureQuestionsForProjectScopes } from "@/lib/scope-questions-seed";
import { logSupabaseError } from "@/lib/supabase/log-error";
import { resolveWorkAreaTypeKey } from "@/lib/project-assistant-questions";
import { syncScopeQuestionsForScope } from "@/lib/scope-questions-seed";
import {
  CUSTOM_SCOPE_FALLBACK,
  SCOPE_TYPE_NAME_LOOKUP,
  deriveConfidenceLevel,
} from "@/lib/scope-suggestion-rules";
import {
  getLatestDiscoveryEngineRun,
  getLatestDiscoveryRun,
  normalizeDiscoveryResult,
  parseDiscoveryEngineRun,
  parseDiscoveryRun,
  refreshDiscoveryQuestionsAndTrades,
} from "@/lib/discovery-data";
import { extractQualityLevelFromNotes } from "@/lib/ai/discovery/quality-level-rules";
import { ensureQuickEstimateForProject } from "@/lib/quick-estimate-data";
import { syncQualityLevelFromDiscovery } from "@/lib/sync-discovery-quality-level";
import { projectStatusSchema } from "@/lib/validations/project";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type Supabase = SupabaseClient<Database>;

export type WorkAreaSelection = {
  suggestionId: string;
  included: boolean;
};

async function resolveScopeTypeId(
  supabase: Supabase,
  suggestedScopeType: string
) {
  const scopeTypeName = SCOPE_TYPE_NAME_LOOKUP[suggestedScopeType];
  if (!scopeTypeName) return null;

  const { data: scopeType } = await supabase
    .from("scope_types")
    .select("id, name")
    .ilike("name", scopeTypeName)
    .eq("is_active", true)
    .maybeSingle();

  return scopeType?.id ?? null;
}

async function acceptSuggestion(
  supabase: Supabase,
  organisationId: string,
  projectId: string,
  suggestion: Database["public"]["Tables"]["project_scope_suggestions"]["Row"]
) {
  const scopeTypeId = await resolveScopeTypeId(
    supabase,
    suggestion.suggested_scope_type
  );
  const isCustom =
    suggestion.suggested_scope_type ===
      CUSTOM_SCOPE_FALLBACK.suggestedScopeType || scopeTypeId === null;

  const { count } = await supabase
    .from("project_scopes")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId);

  const { data: scope, error: scopeError } = await supabase
    .from("project_scopes")
    .insert({
      project_id: projectId,
      organisation_id: organisationId,
      scope_type_id: scopeTypeId,
      name: suggestion.suggested_name,
      description: suggestion.suggested_description,
      location_area: suggestion.suggested_location_area,
      status: "draft",
      ai_status: "not_started",
      ai_confidence: suggestion.confidence,
      confidence_level: deriveConfidenceLevel(Number(suggestion.confidence)),
      is_custom: isCustom,
      sort_order: count ?? 0,
    })
    .select("id, name, scope_types(name)")
    .single();

  if (scopeError || !scope) {
    logSupabaseError("confirmWorkAreas.accept.insert", scopeError);
    return { error: scopeError?.message ?? "Could not create work area." };
  }

  await syncScopeQuestionsForScope(supabase, organisationId, projectId, {
    id: scope.id,
    name: scope.name,
    scope_types: scope.scope_types as { name: string } | null,
  });

  const { error: updateError } = await supabase
    .from("project_scope_suggestions")
    .update({ status: "converted" })
    .eq("id", suggestion.id)
    .eq("organisation_id", organisationId)
    .eq("status", "pending");

  if (updateError) {
    logSupabaseError("confirmWorkAreas.accept.update", updateError);
    return { error: updateError.message };
  }

  return { scopeId: scope.id };
}

export async function confirmWorkAreaSelections(
  supabase: Supabase,
  params: {
    organisationId: string;
    projectId: string;
    userId: string;
    selections: WorkAreaSelection[];
  }
): Promise<{
  error?: string;
  includedNames: string[];
  excludedNames: string[];
  needsEstimateRecalc?: boolean;
}> {
  if (params.selections.length === 0) {
    return { error: "No work areas selected.", includedNames: [], excludedNames: [] };
  }

  const includedNames: string[] = [];
  const excludedNames: string[] = [];

  for (const selection of params.selections) {
    const { data: suggestion, error } = await supabase
      .from("project_scope_suggestions")
      .select("*")
      .eq("id", selection.suggestionId)
      .eq("project_id", params.projectId)
      .eq("organisation_id", params.organisationId)
      .eq("status", "pending")
      .maybeSingle();

    if (error || !suggestion) {
      logSupabaseError("confirmWorkAreas.load", error);
      continue;
    }

    if (selection.included) {
      const result = await acceptSuggestion(
        supabase,
        params.organisationId,
        params.projectId,
        suggestion
      );
      if ("error" in result && result.error) {
        return { error: result.error, includedNames, excludedNames };
      }
      includedNames.push(suggestion.suggested_name);
    } else {
      const { error: rejectError } = await supabase
        .from("project_scope_suggestions")
        .update({ status: "rejected" })
        .eq("id", suggestion.id)
        .eq("organisation_id", params.organisationId)
        .eq("status", "pending");

      if (rejectError) {
        logSupabaseError("confirmWorkAreas.reject", rejectError);
        return { error: rejectError.message, includedNames, excludedNames };
      }
      excludedNames.push(suggestion.suggested_name);
    }
  }

  if (includedNames.length > 0) {
    await ensureQuestionsForProjectScopes(
      supabase,
      params.organisationId,
      params.projectId
    );

    const { data: scopes } = await supabase
      .from("project_scopes")
      .select("id, name, scope_types(name)")
      .eq("project_id", params.projectId)
      .eq("organisation_id", params.organisationId);

    if (scopes?.length) {
      const workAreas = scopes.map((s) => ({
        typeKey: resolveWorkAreaTypeKey(
          (s.scope_types as { name: string } | null)?.name,
          s.name
        ),
        name: s.name,
      }));
      await refreshDiscoveryQuestionsAndTrades(
        supabase,
        params.organisationId,
        params.projectId,
        workAreas
      );
    }

    const quickEstimate = await ensureQuickEstimateForProject(
      supabase,
      params.organisationId,
      params.projectId,
      params.userId
    );

    const [{ data: latestEngineRun }, { data: latestDiscoveryRun }, projectRow] =
      await Promise.all([
        getLatestDiscoveryEngineRun(
          supabase,
          params.organisationId,
          params.projectId
        ),
        getLatestDiscoveryRun(
          supabase,
          params.organisationId,
          params.projectId
        ),
        supabase
          .from("projects")
          .select("initial_notes, client_brief")
          .eq("id", params.projectId)
          .eq("organisation_id", params.organisationId)
          .maybeSingle(),
      ]);

    const discovery = normalizeDiscoveryResult(
      parseDiscoveryEngineRun(latestEngineRun ?? null) ??
        parseDiscoveryRun(latestDiscoveryRun ?? null)
    );

    if (quickEstimate?.id) {
      const notesQuality = extractQualityLevelFromNotes(
        projectRow.data?.initial_notes ??
          projectRow.data?.client_brief ??
          ""
      );
      const qualityFromDiscovery =
        discovery?.qualityLevel ??
        (notesQuality
          ? {
              value: notesQuality.value,
              confidence: notesQuality.confidence,
              reason: notesQuality.reason,
            }
          : undefined);

      if (qualityFromDiscovery) {
        await syncQualityLevelFromDiscovery(
          supabase,
          params.organisationId,
          quickEstimate.id,
          qualityFromDiscovery
        );
      }
    }

    await supabase
      .from("projects")
      .update({ status: projectStatusSchema.parse("scoping") })
      .eq("id", params.projectId)
      .eq("organisation_id", params.organisationId);
  }

  const userParts: string[] = [];
  if (includedNames.length > 0) {
    userParts.push(`Included: ${includedNames.join(", ")}`);
  }
  if (excludedNames.length > 0) {
    userParts.push(`Excluded for now: ${excludedNames.join(", ")}`);
  }

  await insertAssistantMessage(supabase, {
    organisationId: params.organisationId,
    projectId: params.projectId,
    userId: params.userId,
    role: "user",
    content: userParts.join(". ") || "Work areas confirmed.",
    metadata: {
      messageType: "answer",
      batchSize: params.selections.length,
      workAreaConfirmation: true,
      includedNames,
      excludedNames,
    },
  });

  const assistantText =
    includedNames.length > 0
      ? `Got it — I'll include ${includedNames.join(" and ")} in this estimate.${
          excludedNames.length > 0
            ? ` ${excludedNames.join(" and ")} excluded for now.`
            : ""
        }`
      : `Understood — none of those work areas will be included for now. Add more notes anytime to revisit.`;

  await insertAssistantMessage(supabase, {
    organisationId: params.organisationId,
    projectId: params.projectId,
    userId: params.userId,
    role: "assistant",
    content: assistantText,
    metadata: { messageType: "assistant_text" },
  });

  if (includedNames.length > 0) {
    await runAssistantAutopilot(supabase, {
      organisationId: params.organisationId,
      projectId: params.projectId,
      userId: params.userId,
      pendingSuggestionCount: 0,
      allowEstimateGeneration: false,
    });
  }

  return {
    includedNames,
    excludedNames,
    needsEstimateRecalc: false,
  };
}
