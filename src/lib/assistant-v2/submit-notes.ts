import { getProjectById } from "@/lib/projects-data";
import {
  logSupabaseError,
  userFacingSupabaseError,
} from "@/lib/supabase/log-error";
import {
  DEFAULT_SCOPE_BUILDER_INPUT_STATUS,
  scopeBuilderInputSchema,
} from "@/lib/validations/scope-builder";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type Supabase = SupabaseClient<Database>;

export type SubmitNotesResult =
  | { success: true }
  | { error: string; fieldErrors?: Record<string, string[]> };

export async function submitProjectNotes(
  supabase: Supabase,
  params: {
    organisationId: string;
    projectId: string;
    userId: string;
    content: string;
  }
): Promise<SubmitNotesResult> {
  const parsed = scopeBuilderInputSchema.safeParse({
    inputType: "typed_note",
    content: params.content,
  });

  if (!parsed.success) {
    return {
      error: "Invalid notes.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<
        string,
        string[]
      >,
    };
  }

  const { data: project, error: projectError } = await getProjectById(
    supabase,
    params.projectId,
    params.organisationId
  );

  if (projectError || !project) {
    return { error: "Project not found." };
  }

  const { error: insertError } = await supabase
    .from("project_scope_builder_inputs")
    .insert({
      organisation_id: params.organisationId,
      project_id: params.projectId,
      input_type: parsed.data.inputType,
      content: parsed.data.content.trim(),
      status: DEFAULT_SCOPE_BUILDER_INPUT_STATUS,
      created_by: params.userId,
    });

  if (insertError) {
    logSupabaseError("submitProjectNotes.insert", insertError);
    return {
      error: userFacingSupabaseError(
        insertError,
        "Could not save project notes."
      ),
    };
  }

  return { success: true };
}
