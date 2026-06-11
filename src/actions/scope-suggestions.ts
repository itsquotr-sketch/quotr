"use server";

import { revalidateProjectAssistant } from "@/lib/assistant-v2/revalidate";
import { requireOrganisation } from "@/lib/auth";
import { getProjectById } from "@/lib/projects-data";
import {
  getLatestScopeBuilderInput,
  listActiveScopeSuggestionTypes,
} from "@/lib/scope-builder-data";
import {
  CUSTOM_SCOPE_FALLBACK,
  SCOPE_TYPE_NAME_LOOKUP,
  deriveConfidenceLevel,
  generateScopeSuggestionsFromNotes,
} from "@/lib/scope-suggestion-rules";
import { createClient } from "@/lib/supabase/server";
import {
  logSupabaseError,
  userFacingSupabaseError,
} from "@/lib/supabase/log-error";
import {
  scopeSuggestionIdSchema,
  acceptScopeSuggestionSchema,
  type ScopeSuggestionActionState,
} from "@/lib/validations/scope-suggestion";
import { projectStatusSchema } from "@/lib/validations/project";
import { refreshDiscoveryQuestionsAndTrades } from "@/lib/discovery-data";
import { resolveWorkAreaTypeKey } from "@/lib/project-assistant-questions";
import { syncScopeQuestionsForScope } from "@/lib/scope-questions-seed";

async function refreshProjectDiscovery(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organisationId: string,
  projectId: string
) {
  const { data: scopes } = await supabase
    .from("project_scopes")
    .select("id, name, scope_types(name)")
    .eq("project_id", projectId)
    .eq("organisation_id", organisationId);

  if (!scopes?.length) return;

  const workAreas = scopes.map((s) => ({
    typeKey: resolveWorkAreaTypeKey(
      (s.scope_types as { name: string } | null)?.name,
      s.name
    ),
    name: s.name,
  }));

  await refreshDiscoveryQuestionsAndTrades(
    supabase,
    organisationId,
    projectId,
    workAreas
  );
}

async function verifySuggestion(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organisationId: string,
  projectId: string,
  suggestionId: string
) {
  const parsedId = scopeSuggestionIdSchema.safeParse(suggestionId);
  if (!parsedId.success) {
    return { error: "Invalid suggestion." as const, suggestion: null };
  }

  const { data: suggestion, error } = await supabase
    .from("project_scope_suggestions")
    .select("*")
    .eq("id", parsedId.data)
    .eq("project_id", projectId)
    .eq("organisation_id", organisationId)
    .single();

  if (error) {
    logSupabaseError("verifySuggestion", error);
    return { error: "Suggestion not found." as const, suggestion: null };
  }

  if (!suggestion) {
    return { error: "Suggestion not found." as const, suggestion: null };
  }

  return { error: null, suggestion };
}

async function resolveScopeTypeId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  suggestedScopeType: string
) {
  const scopeTypeName = SCOPE_TYPE_NAME_LOOKUP[suggestedScopeType];
  if (!scopeTypeName) {
    return null;
  }

  const { data: scopeType } = await supabase
    .from("scope_types")
    .select("id, name")
    .ilike("name", scopeTypeName)
    .eq("is_active", true)
    .maybeSingle();

  return scopeType?.id ?? null;
}

async function createScopeFromSuggestion(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organisationId: string,
  projectId: string,
  suggestion: {
    id: string;
    suggested_scope_type: string;
    suggested_name: string;
    suggested_description: string | null;
    suggested_location_area: string | null;
    confidence: number | null;
  },
  overrides?: {
    name?: string;
    description?: string | null;
    locationArea?: string | null;
  }
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

  const confidenceLevel = deriveConfidenceLevel(
    Number(suggestion.confidence)
  );

  const { data: scope, error: scopeError } = await supabase
    .from("project_scopes")
    .insert({
      project_id: projectId,
      organisation_id: organisationId,
      scope_type_id: scopeTypeId,
      name: overrides?.name ?? suggestion.suggested_name,
      description: overrides?.description ?? suggestion.suggested_description,
      location_area:
        overrides?.locationArea ?? suggestion.suggested_location_area,
      status: "draft",
      ai_status: "not_started",
      ai_confidence: suggestion.confidence,
      confidence_level: confidenceLevel,
      is_custom: isCustom,
      sort_order: count ?? 0,
    })
    .select("id, name, scope_types(name)")
    .single();

  if (scopeError || !scope) {
    logSupabaseError("createScopeFromSuggestion.insert", scopeError);
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
    logSupabaseError("createScopeFromSuggestion.update", updateError);
    return { error: updateError.message ?? "Could not update suggestion." };
  }

  await supabase
    .from("projects")
    .update({ status: projectStatusSchema.parse("scoping") })
    .eq("id", projectId)
    .eq("organisation_id", organisationId);

  await refreshProjectDiscovery(supabase, organisationId, projectId);

  return { scopeId: scope.id };
}

export async function suggestScopesFromNotes(
  projectId: string
): Promise<ScopeSuggestionActionState> {
  const { user, profile, organisationId } = await requireOrganisation();

  if (!profile.organisation_id) {
    console.error("[suggestScopesFromNotes] Missing profile.organisation_id", {
      userId: user.id,
    });
    return { error: "Your account is not linked to an organisation yet." };
  }

  const supabase = await createClient();

  const { data: project, error: projectError } = await getProjectById(
    supabase,
    projectId,
    organisationId
  );

  if (projectError) {
    logSupabaseError("suggestScopesFromNotes.project", projectError);
  }

  if (projectError || !project) {
    return { error: "Project not found." };
  }

  const { data: latestInput, error: inputError } =
    await getLatestScopeBuilderInput(supabase, organisationId, projectId);

  if (inputError) {
    logSupabaseError("suggestScopesFromNotes.input", inputError);
    return {
      error: userFacingSupabaseError(
        inputError,
        "Could not read project notes."
      ),
    };
  }

  if (!latestInput) {
    return {
      error: "Add and save project notes before analysing the project.",
    };
  }

  const generated = generateScopeSuggestionsFromNotes(latestInput.content);
  if (generated.length === 0) {
    return { error: "Add more detail to your project notes first." };
  }

  const { data: existingSuggestions, error: existingError } =
    await listActiveScopeSuggestionTypes(supabase, organisationId, projectId);

  if (existingError) {
    logSupabaseError("suggestScopesFromNotes.existing", existingError);
    return {
      error: userFacingSupabaseError(
        existingError,
        "Could not check existing suggestions."
      ),
    };
  }

  const existingTypes = new Set(
    (existingSuggestions ?? []).map((item) => item.suggested_scope_type)
  );

  const toInsert = generated.filter(
    (item) => !existingTypes.has(item.suggestedScopeType)
  );

  if (toInsert.length === 0) {
    return {
      success: true,
      message: "Draft work areas are already up to date for your latest notes.",
    };
  }

  const rows = toInsert.map((item) => ({
    organisation_id: organisationId,
    project_id: projectId,
    source_input_id: latestInput.id,
    suggested_scope_type: item.suggestedScopeType,
    suggested_name: item.suggestedName,
    suggested_description: item.suggestedDescription,
    suggested_location_area: item.suggestedLocationArea,
    confidence: item.confidence,
    status: "pending",
    created_by: user.id,
  }));

  const { error: insertError } = await supabase
    .from("project_scope_suggestions")
    .insert(rows);

  if (insertError) {
    logSupabaseError("suggestScopesFromNotes.insert", insertError);
    return {
      error: userFacingSupabaseError(
        insertError,
        insertError.message ?? "Could not save suggestions."
      ),
    };
  }

  revalidateProjectAssistant(projectId);
  return { success: true };
}

export async function acceptScopeSuggestion(
  projectId: string,
  suggestionId: string
): Promise<ScopeSuggestionActionState> {
  const { organisationId } = await requireOrganisation();
  const supabase = await createClient();

  const { error: verifyError, suggestion } = await verifySuggestion(
    supabase,
    organisationId,
    projectId,
    suggestionId
  );

  if (verifyError || !suggestion) {
    return { error: verifyError ?? "Suggestion not found." };
  }

  if (suggestion.status !== "pending") {
    return { error: "This suggestion has already been reviewed." };
  }

  const result = await createScopeFromSuggestion(
    supabase,
    organisationId,
    projectId,
    suggestion
  );

  if ("error" in result && result.error) {
    return { error: result.error };
  }

  const { generateAssistantQuickEstimate } = await import(
    "@/actions/project-assistant"
  );
  await generateAssistantQuickEstimate(projectId, { silent: true });

  revalidateProjectAssistant(projectId);
  return { success: true, message: "Work area confirmed." };
}

export async function acceptScopeSuggestionWithEdits(
  projectId: string,
  suggestionId: string,
  _prevState: ScopeSuggestionActionState,
  formData: FormData
): Promise<ScopeSuggestionActionState> {
  const { organisationId } = await requireOrganisation();
  const supabase = await createClient();

  const { error: verifyError, suggestion } = await verifySuggestion(
    supabase,
    organisationId,
    projectId,
    suggestionId
  );

  if (verifyError || !suggestion) {
    return { error: verifyError ?? "Suggestion not found." };
  }

  if (suggestion.status !== "pending") {
    return { error: "This suggestion has already been reviewed." };
  }

  const parsed = acceptScopeSuggestionSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") || undefined,
    locationArea: formData.get("locationArea") || undefined,
  });

  if (!parsed.success) {
    return {
      fieldErrors: parsed.error.flatten().fieldErrors as Record<
        string,
        string[]
      >,
    };
  }

  const result = await createScopeFromSuggestion(
    supabase,
    organisationId,
    projectId,
    suggestion,
    {
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      locationArea: parsed.data.locationArea ?? null,
    }
  );

  if ("error" in result && result.error) {
    return { error: result.error };
  }

  const { generateAssistantQuickEstimate } = await import(
    "@/actions/project-assistant"
  );
  await generateAssistantQuickEstimate(projectId, { silent: true });

  revalidateProjectAssistant(projectId);
  return { success: true, message: "Work area confirmed." };
}

export async function rejectScopeSuggestion(
  projectId: string,
  suggestionId: string
): Promise<ScopeSuggestionActionState> {
  const { organisationId } = await requireOrganisation();
  const supabase = await createClient();

  const { error: verifyError, suggestion } = await verifySuggestion(
    supabase,
    organisationId,
    projectId,
    suggestionId
  );

  if (verifyError || !suggestion) {
    return { error: verifyError ?? "Suggestion not found." };
  }

  if (suggestion.status !== "pending") {
    return { error: "This suggestion has already been reviewed." };
  }

  const { error: updateError } = await supabase
    .from("project_scope_suggestions")
    .update({ status: "rejected" })
    .eq("id", suggestion.id)
    .eq("organisation_id", organisationId)
    .eq("status", "pending");

  if (updateError) {
    logSupabaseError("rejectScopeSuggestion", updateError);
    return { error: updateError.message ?? "Could not reject suggestion." };
  }

  revalidateProjectAssistant(projectId);
  return { success: true };
}
