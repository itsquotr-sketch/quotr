import {
  getLatestDiscoveryEngineRun,
  getLatestDiscoveryRun,
  normalizeDiscoveryResult,
  parseDiscoveryEngineRun,
  parseDiscoveryRun,
} from "@/lib/discovery-data";
import { getProjectDiscoveryMeta } from "@/lib/discovery-meta";
import { listScopeQuestionsForProject } from "@/lib/project-assistant-data";
import {
  loadSavedProjectConstraints,
  mergeDeclinedConstraintSlugs,
} from "@/lib/project-constraints-load";
import { listScopeBuilderInputs, listScopeSuggestions } from "@/lib/scope-builder-data";
import { ensureQuestionsForProjectScopes } from "@/lib/scope-questions-seed";
import { ensureQuickEstimateForProject } from "@/lib/quick-estimate-data";
import {
  extractDeclinedConstraintSlugs,
  extractAnsweredConstraintSlugs,
  listAssistantMessages,
  type AssistantMessageRow,
} from "@/lib/assistant-v2/assistant-messages-data";
import { listScopePackagesForProject } from "@/lib/assistant-v2/confirm-internal-works";
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
  ProjectScopePackage,
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
  chatMessages: AssistantMessageRow[];
  declinedConstraintSlugs: string[];
  scopePackages: ProjectScopePackage[];
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

  const [quickEstimate, , { data: scopes }] = await Promise.all([
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
    { data: latestEngineRun },
    { data: latestDiscoveryRun },
    discoveryMeta,
    { data: scopeQuestions },
    { data: chatMessages },
    savedConstraints,
    scopePackages,
  ] = await Promise.all([
    listScopeBuilderInputs(supabase, organisationId, projectId),
    listScopeSuggestions(supabase, organisationId, projectId),
    getLatestDiscoveryEngineRun(supabase, organisationId, projectId),
    getLatestDiscoveryRun(supabase, organisationId, projectId),
    getProjectDiscoveryMeta(supabase, organisationId, projectId),
    listScopeQuestionsForProject(supabase, scopeIds),
    listAssistantMessages(supabase, organisationId, projectId),
    loadSavedProjectConstraints(
      supabase,
      organisationId,
      projectId,
      quickEstimate?.id
    ),
    listScopePackagesForProject(supabase, organisationId, projectId),
  ]);

  const discovery = normalizeDiscoveryResult(
    parseDiscoveryEngineRun(latestEngineRun ?? null) ??
      parseDiscoveryRun(latestDiscoveryRun ?? null)
  );

  const selectedConstraintSlugs = savedConstraints.slugs;
  const followUpValues = savedConstraints.followUpValues;
  const answeredFromMessages = extractAnsweredConstraintSlugs(
    chatMessages ?? []
  );
  const declinedConstraintSlugs = mergeDeclinedConstraintSlugs(
    savedConstraints.declinedSlugs,
    extractDeclinedConstraintSlugs(chatMessages ?? [])
  );
  const mergedSelectedSlugs = [
    ...new Set([
      ...selectedConstraintSlugs,
      ...[...answeredFromMessages].filter(
        (slug) => !declinedConstraintSlugs.includes(slug)
      ),
    ]),
  ];

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
      selectedConstraintSlugs: mergedSelectedSlugs,
      followUpValues,
      discovery,
      discoveryMeta,
      chatMessages: chatMessages ?? [],
      declinedConstraintSlugs,
      scopePackages: scopePackages ?? [],
    },
    error: null,
  };
}
