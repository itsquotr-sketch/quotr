import {
  extractAnsweredConstraintSlugs,
  extractDeclinedConstraintSlugs,
  listAssistantMessages,
  type AssistantMessageRow,
} from "@/lib/assistant-v2/assistant-messages-data";
import { listScopePackagesForProject } from "@/lib/assistant-v2/confirm-internal-works";
import {
  loadSavedProjectConstraints,
  mergeDeclinedConstraintSlugs,
} from "@/lib/project-constraints-load";
import { listScopeQuestionsForProject } from "@/lib/project-assistant-data";
import { ensureQuickEstimateForProject } from "@/lib/quick-estimate-data";
import type { ScopeQuestionWithAnswers } from "@/lib/project-assistant-data";
import type {
  ProjectScope,
  ProjectScopePackage,
  QuickEstimate,
} from "@/types/database";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type Supabase = SupabaseClient<Database>;

async function loadProjectScopes(
  supabase: Supabase,
  organisationId: string,
  projectId: string
): Promise<(ProjectScope & { scope_types: { name: string } | null })[]> {
  const { data } = await supabase
    .from("project_scopes")
    .select("*, scope_types(name)")
    .eq("project_id", projectId)
    .eq("organisation_id", organisationId)
    .order("sort_order", { ascending: true });
  return data ?? [];
}

export async function loadAssistantEstimate(
  supabase: Supabase,
  organisationId: string,
  projectId: string,
  userId: string
): Promise<QuickEstimate | null> {
  return ensureQuickEstimateForProject(
    supabase,
    organisationId,
    projectId,
    userId
  );
}

export async function loadAssistantMessages(
  supabase: Supabase,
  organisationId: string,
  projectId: string
): Promise<AssistantMessageRow[]> {
  const { data } = await listAssistantMessages(
    supabase,
    organisationId,
    projectId
  );
  return data ?? [];
}

export async function loadAssistantScopes(
  supabase: Supabase,
  organisationId: string,
  projectId: string
): Promise<{
  confirmedScopes: (ProjectScope & { scope_types: { name: string } | null })[];
  scopePackages: ProjectScopePackage[];
}> {
  const [confirmedScopes, scopePackages] = await Promise.all([
    loadProjectScopes(supabase, organisationId, projectId),
    listScopePackagesForProject(supabase, organisationId, projectId),
  ]);
  return { confirmedScopes, scopePackages };
}

export async function loadAssistantScopeQuestions(
  supabase: Supabase,
  organisationId: string,
  projectId: string
): Promise<ScopeQuestionWithAnswers[]> {
  const scopes = await loadProjectScopes(supabase, organisationId, projectId);
  const scopeIds = scopes.map((s) => s.id);
  const { data } = await listScopeQuestionsForProject(supabase, scopeIds);
  return data ?? [];
}

export async function loadAssistantConstraints(
  supabase: Supabase,
  organisationId: string,
  projectId: string,
  quickEstimateId?: string | null
): Promise<{
  selectedConstraintSlugs: string[];
  declinedConstraintSlugs: string[];
}> {
  const savedConstraints = await loadSavedProjectConstraints(
    supabase,
    organisationId,
    projectId,
    quickEstimateId
  );

  const { data: chatMessages } = await listAssistantMessages(
    supabase,
    organisationId,
    projectId
  );

  const answeredFromMessages = extractAnsweredConstraintSlugs(
    chatMessages ?? []
  );
  const declinedConstraintSlugs = mergeDeclinedConstraintSlugs(
    savedConstraints.declinedSlugs,
    extractDeclinedConstraintSlugs(chatMessages ?? [])
  );
  const mergedSelectedSlugs = [
    ...new Set([
      ...savedConstraints.slugs,
      ...[...answeredFromMessages].filter(
        (slug) => !declinedConstraintSlugs.includes(slug)
      ),
    ]),
  ];

  return {
    selectedConstraintSlugs: mergedSelectedSlugs,
    declinedConstraintSlugs,
  };
}
