"use server";

import { revalidatePath } from "next/cache";
import { requireOrganisation } from "@/lib/auth";
import { getProjectById } from "@/lib/projects-data";
import { getScopeBuilderInputById } from "@/lib/scope-builder-data";
import { createClient } from "@/lib/supabase/server";
import {
  isMissingSuggestionsTableError,
  logSupabaseError,
  userFacingSupabaseError,
} from "@/lib/supabase/log-error";
import {
  DEFAULT_SCOPE_BUILDER_INPUT_STATUS,
  scopeBuilderInputIdSchema,
  scopeBuilderInputSchema,
  scopeBuilderInputUpdateSchema,
  type ScopeBuilderActionState,
} from "@/lib/validations/scope-builder";

export async function saveScopeBuilderInput(
  projectId: string,
  _prevState: ScopeBuilderActionState,
  formData: FormData
): Promise<ScopeBuilderActionState> {
  const { user, profile, organisationId } = await requireOrganisation();

  if (!profile.organisation_id) {
    return { error: "Your account is not linked to an organisation yet." };
  }

  const raw = {
    inputType: formData.get("inputType"),
    content: formData.get("content"),
  };

  const parsed = scopeBuilderInputSchema.safeParse(raw);
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const supabase = await createClient();

  const { data: project, error: projectError } = await getProjectById(
    supabase,
    projectId,
    organisationId
  );

  if (projectError) {
    logSupabaseError("saveScopeBuilderInput.project", projectError);
  }

  if (projectError || !project) {
    return { error: "Project not found." };
  }

  const { error: insertError } = await supabase
    .from("project_scope_builder_inputs")
    .insert({
      organisation_id: organisationId,
      project_id: projectId,
      input_type: parsed.data.inputType,
      content: parsed.data.content.trim(),
      status: DEFAULT_SCOPE_BUILDER_INPUT_STATUS,
      created_by: user.id,
    });

  if (insertError) {
    logSupabaseError("saveScopeBuilderInput.insert", insertError);
    return {
      error: userFacingSupabaseError(
        insertError,
        insertError.message ?? "Could not save project notes."
      ),
    };
  }

  revalidatePath(`/projects/${projectId}`);
  return { success: true, message: "Project notes saved." };
}

export async function updateScopeBuilderInput(
  projectId: string,
  inputId: string,
  _prevState: ScopeBuilderActionState,
  formData: FormData
): Promise<ScopeBuilderActionState> {
  const { profile, organisationId } = await requireOrganisation();

  if (!profile.organisation_id) {
    return { error: "Your account is not linked to an organisation yet." };
  }

  const parsedId = scopeBuilderInputIdSchema.safeParse(inputId);
  if (!parsedId.success) {
    return { error: "Invalid note." };
  }

  const raw = {
    inputType: formData.get("inputType"),
    content: formData.get("content"),
  };

  const parsed = scopeBuilderInputUpdateSchema.safeParse(raw);
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const supabase = await createClient();

  const { data: existing, error: existingError } = await getScopeBuilderInputById(
    supabase,
    organisationId,
    projectId,
    parsedId.data
  );

  if (existingError) {
    logSupabaseError("updateScopeBuilderInput.lookup", existingError);
    return { error: "Could not find that note." };
  }

  if (!existing) {
    return { error: "Note not found." };
  }

  const { error: updateError } = await supabase
    .from("project_scope_builder_inputs")
    .update({
      input_type: parsed.data.inputType,
      content: parsed.data.content.trim(),
    })
    .eq("id", parsedId.data)
    .eq("organisation_id", organisationId)
    .eq("project_id", projectId);

  if (updateError) {
    logSupabaseError("updateScopeBuilderInput.update", updateError);
    return {
      error: userFacingSupabaseError(
        updateError,
        updateError.message ?? "Could not update project notes."
      ),
    };
  }

  revalidatePath(`/projects/${projectId}`);
  return { success: true, message: "Project notes updated." };
}

export async function deleteScopeBuilderInput(
  projectId: string,
  inputId: string
): Promise<ScopeBuilderActionState> {
  const { profile, organisationId } = await requireOrganisation();

  if (!profile.organisation_id) {
    return { error: "Your account is not linked to an organisation yet." };
  }

  const parsedId = scopeBuilderInputIdSchema.safeParse(inputId);
  if (!parsedId.success) {
    return { error: "Invalid note." };
  }

  const supabase = await createClient();

  const { data: existing, error: existingError } = await getScopeBuilderInputById(
    supabase,
    organisationId,
    projectId,
    parsedId.data
  );

  if (existingError) {
    logSupabaseError("deleteScopeBuilderInput.lookup", existingError);
    return { error: "Could not find that note." };
  }

  if (!existing) {
    return { error: "Note not found." };
  }

  const { error: rejectSuggestionsError } = await supabase
    .from("project_scope_suggestions")
    .update({ status: "rejected" })
    .eq("source_input_id", parsedId.data)
    .eq("organisation_id", organisationId)
    .eq("status", "pending");

  if (rejectSuggestionsError) {
    logSupabaseError(
      "deleteScopeBuilderInput.rejectSuggestions",
      rejectSuggestionsError
    );

    if (isMissingSuggestionsTableError(rejectSuggestionsError)) {
      // Notes can still be deleted if suggestions table is not migrated yet.
    } else {
      return {
        error: userFacingSupabaseError(
          rejectSuggestionsError,
          "Could not update related suggestions."
        ),
      };
    }
  }

  const { error: deleteError } = await supabase
    .from("project_scope_builder_inputs")
    .delete()
    .eq("id", parsedId.data)
    .eq("organisation_id", organisationId)
    .eq("project_id", projectId);

  if (deleteError) {
    logSupabaseError("deleteScopeBuilderInput.delete", deleteError);
    return {
      error: userFacingSupabaseError(
        deleteError,
        deleteError.message ?? "Could not delete project notes."
      ),
    };
  }

  revalidatePath(`/projects/${projectId}`);
  return { success: true, message: "Project notes deleted." };
}
