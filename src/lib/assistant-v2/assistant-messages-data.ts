import { logSupabaseError } from "@/lib/supabase/log-error";
import type { Json } from "@/types/database";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type Supabase = SupabaseClient<Database>;

export type AssistantMessageRow =
  Database["public"]["Tables"]["assistant_messages"]["Row"];

export async function listAssistantMessages(
  supabase: Supabase,
  organisationId: string,
  projectId: string
): Promise<{ data: AssistantMessageRow[]; error: string | null }> {
  const { data, error } = await supabase
    .from("assistant_messages")
    .select("*")
    .eq("organisation_id", organisationId)
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });

  if (error) {
    logSupabaseError("listAssistantMessages", error);
    return { data: [], error: "Could not load chat history." };
  }

  return { data: data ?? [], error: null };
}

export async function insertAssistantMessage(
  supabase: Supabase,
  params: {
    organisationId: string;
    projectId: string;
    userId: string;
    role: "user" | "assistant" | "system";
    content: string;
    metadata?: Record<string, unknown>;
  }
): Promise<{ data: AssistantMessageRow | null; error: string | null }> {
  const { data, error } = await supabase
    .from("assistant_messages")
    .insert({
      organisation_id: params.organisationId,
      project_id: params.projectId,
      role: params.role,
      content: params.content.trim(),
      metadata: (params.metadata ?? {}) as Json,
      created_by: params.userId,
    })
    .select("*")
    .single();

  if (error) {
    logSupabaseError("insertAssistantMessage", error);
    return { data: null, error: "Could not save message." };
  }

  return { data, error: null };
}

export async function updateAssistantMessageMetadata(
  supabase: Supabase,
  params: {
    organisationId: string;
    projectId: string;
    messageId: string;
    patch: Record<string, unknown>;
  }
): Promise<{ error: string | null }> {
  const { data: existing, error: fetchError } = await supabase
    .from("assistant_messages")
    .select("metadata")
    .eq("id", params.messageId)
    .eq("organisation_id", params.organisationId)
    .eq("project_id", params.projectId)
    .maybeSingle();

  if (fetchError || !existing) {
    logSupabaseError("updateAssistantMessageMetadata.fetch", fetchError);
    return { error: "Could not update message." };
  }

  const current = (existing.metadata as Record<string, unknown> | null) ?? {};
  const merged = { ...current, ...params.patch };

  const { error } = await supabase
    .from("assistant_messages")
    .update({ metadata: merged as Json })
    .eq("id", params.messageId)
    .eq("organisation_id", params.organisationId)
    .eq("project_id", params.projectId);

  if (error) {
    logSupabaseError("updateAssistantMessageMetadata", error);
    return { error: "Could not update message." };
  }

  return { error: null };
}

export async function deleteAssistantMessagesForProject(
  supabase: Supabase,
  organisationId: string,
  projectId: string
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from("assistant_messages")
    .delete()
    .eq("organisation_id", organisationId)
    .eq("project_id", projectId);

  if (error) {
    logSupabaseError("deleteAssistantMessagesForProject", error);
    return { error: "Could not clear chat history." };
  }

  return { error: null };
}

export function extractDeclinedConstraintSlugs(
  messages: AssistantMessageRow[]
): Set<string> {
  const declined = new Set<string>();
  for (const message of messages) {
    const meta = message.metadata as Record<string, unknown> | null;
    if (meta?.messageType !== "constraint_declined") continue;

    if (meta.constraintSlug) {
      declined.add(String(meta.constraintSlug));
    }

    if (Array.isArray(meta.constraintSlugs)) {
      for (const slug of meta.constraintSlugs) {
        declined.add(String(slug));
      }
    }
  }
  return declined;
}

export function extractAnsweredConstraintSlugs(
  messages: AssistantMessageRow[]
): Set<string> {
  const answered = new Set<string>();
  for (const message of messages) {
    const meta = message.metadata as Record<string, unknown> | null;
    if (!meta) continue;

    if (meta.messageType === "constraint_answer") {
      if (meta.constraintSlug) answered.add(String(meta.constraintSlug));
      if (Array.isArray(meta.constraintSlugs)) {
        for (const slug of meta.constraintSlugs) {
          answered.add(String(slug));
        }
      }
    }

    if (meta.messageType === "constraint_declined") {
      if (meta.constraintSlug) answered.add(String(meta.constraintSlug));
      if (Array.isArray(meta.constraintSlugs)) {
        for (const slug of meta.constraintSlugs) {
          answered.add(String(slug));
        }
      }
    }
  }
  return answered;
}
