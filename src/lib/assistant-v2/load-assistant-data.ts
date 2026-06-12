import { getLatestDiscoveryEngineRun, getLatestDiscoveryRun, parseDiscoveryEngineRun, parseDiscoveryRun } from "@/lib/discovery-data";
import { getProjectDiscoveryMeta } from "@/lib/discovery-meta";
import { listScopeQuestionsForProject } from "@/lib/project-assistant-data";
import { loadSavedProjectConstraints } from "@/lib/project-constraints-load";
import { listScopeBuilderInputs, listScopeSuggestions } from "@/lib/scope-builder-data";
import { ensureQuestionsForProjectScopes } from "@/lib/scope-questions-seed";
import { ensureQuickEstimateForProject, getQuickEstimateForProject } from "@/lib/quick-estimate-data";
import { devLog } from "@/lib/dev-log";
import { getProjectById } from "@/lib/projects-data";
import type { DiscoveryResult } from "@/lib/ai/discovery/types";
import type { ProjectDiscoveryMeta } from "@/lib/discovery-meta";
import type { ScopeQuestionWithAnswers } from "@/lib/project-assistant-data";
import type {
  Project,
  ProjectScope,
  ProjectScopeBuilderInput,
  ProjectScopeSuggestion,
  QuickEstimate,
} from "@/types/database";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type Supabase = SupabaseClient<Database>;

export type ProjectAssistantData = {
  project: Project;
  inputs: ProjectScopeBuilderInput[];
  suggestions: ProjectScopeSuggestion[];
  confirmedScopes: (ProjectScope & { scope_types: { name: string } | null })[];
  scopeQuestions: ScopeQuestionWithAnswers[];
  quickEstimate: QuickEstimate | null;
  selectedConstraintSlugs: string[];
  followUpValues: Record<string, string | number>;
  discovery: DiscoveryResult | null;
  discoveryMeta: ProjectDiscoveryMeta;
};

export async function loadProjectAssistantData(
  supabase: Supabase,
  organisationId: string,
  projectId: string,
  userId: string
): Promise<{ data: ProjectAssistantData | null; error: string | null }> {
  const startedAt = Date.now();

  const { data: project, error: projectError } = await getProjectById(
    supabase,
    projectId,
    organisationId
  );

  if (projectError || !project) {
    return { data: null, error: "Project not found." };
  }

  const [, , { data: scopes }] = await Promise.all([
    ensureQuickEstimateForProject(supabase, organisationId, projectId, userId),
    ensureQuestionsForProjectScopes(supabase, organisationId, projectId),
    supabase
      .from("project_scopes")
      .select("*, scope_types(name)")
      .eq("project_id", projectId)
      .eq("organisation_id", organisationId)
      .order("sort_order", { ascending: true }),
  ]);

  const scopeIds = (scopes ?? []).map((scope) => scope.id);

  const [
    { data: scopeBuilderInputs },
    { data: scopeSuggestions },
    { data: quickEstimate },
    { data: latestEngineRun },
    { data: latestDiscoveryRun },
    discoveryMeta,
    { data: scopeQuestions },
  ] = await Promise.all([
    listScopeBuilderInputs(supabase, organisationId, projectId),
    listScopeSuggestions(supabase, organisationId, projectId),
    getQuickEstimateForProject(supabase, organisationId, projectId),
    getLatestDiscoveryEngineRun(supabase, organisationId, projectId),
    getLatestDiscoveryRun(supabase, organisationId, projectId),
    getProjectDiscoveryMeta(supabase, organisationId, projectId),
    listScopeQuestionsForProject(supabase, scopeIds),
  ]);

  const discovery =
    parseDiscoveryEngineRun(latestEngineRun ?? null) ??
    parseDiscoveryRun(latestDiscoveryRun ?? null);

  let selectedConstraintSlugs: string[] = [];
  let followUpValues: Record<string, string | number> = {};

  if (quickEstimate?.id) {
    const saved = await loadSavedProjectConstraints(
      supabase,
      organisationId,
      quickEstimate.id
    );
    selectedConstraintSlugs = saved.slugs;
    followUpValues = saved.followUpValues;
  }

  devLog("assistant.load.timing", {
    projectId,
    ms: Date.now() - startedAt,
    scopes: scopes?.length ?? 0,
    questions: scopeQuestions?.length ?? 0,
  });

  return {
    data: {
      project,
      inputs: scopeBuilderInputs ?? [],
      suggestions: scopeSuggestions ?? [],
      confirmedScopes: scopes ?? [],
      scopeQuestions: scopeQuestions ?? [],
      quickEstimate: quickEstimate ?? null,
      selectedConstraintSlugs,
      followUpValues,
      discovery,
      discoveryMeta,
    },
    error: null,
  };
}
