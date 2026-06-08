import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Job } from "@/types/database";

/** Supabase table name — UI label is "Project". */
export const PROJECTS_TABLE = "jobs" as const;

export type ProjectClient = {
  name: string;
  phone: string | null;
  email: string | null;
};

export type ProjectWithClient = {
  clients: ProjectClient | null;
};

export type ProjectListRow = {
  id: string;
  title: string;
  site_address: string;
  enquiry_source: string;
  enquiry_status: string;
  status: string;
  priority: string;
  client_brief: string | null;
  description: string | null;
  created_at: string;
  clients: ProjectClient | null;
  project_scopes: { count: number }[];
};

export type ProjectDetailRow = Job & {
  clients: ProjectClient | null;
};

export function clientName(project: ProjectWithClient): string {
  return project.clients?.name?.trim() || "—";
}

export function clientPhone(project: ProjectWithClient): string | null {
  return project.clients?.phone ?? null;
}

export function clientEmail(project: ProjectWithClient): string | null {
  return project.clients?.email ?? null;
}

export function scopeCount(project: ProjectListRow): number {
  return project.project_scopes?.[0]?.count ?? 0;
}

const PROJECT_LIST_SELECT = `
  id,
  title,
  site_address,
  enquiry_source,
  enquiry_status,
  status,
  priority,
  client_brief,
  description,
  created_at,
  clients ( name, phone, email ),
  project_scopes ( count )
`;

const PROJECT_DETAIL_SELECT = `
  *,
  clients ( name, phone, email )
`;

export async function listProjects(
  supabase: SupabaseClient<Database>,
  organisationId: string
) {
  return supabase
    .from(PROJECTS_TABLE)
    .select(PROJECT_LIST_SELECT)
    .eq("organisation_id", organisationId)
    .order("created_at", { ascending: false });
}

export async function getProjectById(
  supabase: SupabaseClient<Database>,
  projectId: string,
  organisationId: string
) {
  return supabase
    .from(PROJECTS_TABLE)
    .select(PROJECT_DETAIL_SELECT)
    .eq("id", projectId)
    .eq("organisation_id", organisationId)
    .single();
}

export function combineScopeDescription(
  description?: string | null,
  notes?: string | null
): string | null {
  const parts = [description?.trim(), notes?.trim()].filter(Boolean);
  return parts.length > 0 ? parts.join("\n\n") : null;
}
