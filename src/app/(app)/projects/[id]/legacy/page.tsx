import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProjectAssistantSection } from "@/components/projects/project-assistant-section";
import { ProjectDetailsCard } from "@/components/projects/project-details-card";
import { ProjectScopesList } from "@/components/projects/project-scopes-list";
import { StatusBadge } from "@/components/projects/status-badge";
import { PageHeader } from "@/components/shared/page-header";
import { ProjectNextStepsStrip } from "@/components/projects/project-next-steps-strip";
import {
  ENQUIRY_STATUSES,
  PROJECT_STATUSES,
  labelFor,
} from "@/lib/constants/projects";
import { requireOrganisation } from "@/lib/auth";
import {
  clientEmail,
  clientName,
  clientPhone,
  getProjectById,
} from "@/lib/projects-data";
import {
  getLatestDiscoveryEngineRun,
  getLatestDiscoveryRun,
  normalizeDiscoveryResult,
  parseDiscoveryEngineRun,
  parseDiscoveryRun,
} from "@/lib/discovery-data";
import { getProjectDiscoveryMeta } from "@/lib/discovery-meta";
import { ensureQuestionsForProjectScopes } from "@/lib/scope-questions-seed";
import { ensureQuickEstimateForProject } from "@/lib/quick-estimate-data";
import { loadSavedProjectConstraints } from "@/lib/project-constraints-load";
import { listScopeQuestionsForProject } from "@/lib/project-assistant-data";
import { listScopeBuilderInputs, listScopeSuggestions } from "@/lib/scope-builder-data";
import { getQuickEstimateForProject } from "@/lib/quick-estimate-data";
import { listProjectTrades } from "@/lib/project-trades-data";
import { createClient } from "@/lib/supabase/server";

interface LegacyProjectPageProps {
  params: Promise<{ id: string }>;
}

export default async function LegacyProjectPage({
  params,
}: LegacyProjectPageProps) {
  const { id } = await params;
  const { user, organisationId } = await requireOrganisation();
  const supabase = await createClient();

  const { data: project, error } = await getProjectById(
    supabase,
    id,
    organisationId
  );

  if (error || !project) {
    if (error) {
      console.error("[LegacyProjectPage] Failed to load project:", error);
    }
    notFound();
  }

  const [, , { data: scopes }] = await Promise.all([
    ensureQuickEstimateForProject(supabase, organisationId, id, user.id),
    ensureQuestionsForProjectScopes(supabase, organisationId, id),
    supabase
      .from("project_scopes")
      .select("*, scope_types(name)")
      .eq("project_id", id)
      .order("sort_order", { ascending: true }),
  ]);

  const scopeIds = (scopes ?? []).map((scope) => scope.id);

  const [
    { data: scopeBuilderInputs, error: scopeBuilderError },
    { data: scopeSuggestions, error: scopeSuggestionsError },
    { data: quickEstimate, error: quickEstimateError },
    { data: latestEngineRun },
    { data: latestDiscoveryRun },
    discoveryMeta,
    { data: scopeQuestions, error: scopeQuestionsError },
    { data: projectTrades },
  ] = await Promise.all([
    listScopeBuilderInputs(supabase, organisationId, id),
    listScopeSuggestions(supabase, organisationId, id),
    getQuickEstimateForProject(supabase, organisationId, id),
    getLatestDiscoveryEngineRun(supabase, organisationId, id),
    getLatestDiscoveryRun(supabase, organisationId, id),
    getProjectDiscoveryMeta(supabase, organisationId, id),
    listScopeQuestionsForProject(supabase, scopeIds),
    listProjectTrades(supabase, organisationId, id),
  ]);

  if (scopeBuilderError) {
    console.error(
      "[LegacyProjectPage] Failed to load scope builder inputs:",
      scopeBuilderError
    );
  }

  if (scopeSuggestionsError) {
    console.error(
      "[LegacyProjectPage] Failed to load scope suggestions:",
      scopeSuggestionsError
    );
  }

  if (quickEstimateError) {
    console.error(
      "[LegacyProjectPage] Failed to load quick estimate:",
      quickEstimateError
    );
  }

  const discovery = normalizeDiscoveryResult(
    parseDiscoveryEngineRun(latestEngineRun ?? null) ??
      parseDiscoveryRun(latestDiscoveryRun ?? null)
  );

  if (scopeQuestionsError) {
    console.error(
      "[LegacyProjectPage] Failed to load scope questions:",
      scopeQuestionsError
    );
  }

  let selectedConstraintSlugs: string[] = [];
  let followUpValues: Record<string, string | number> = {};

  if (quickEstimate?.id) {
    const saved = await loadSavedProjectConstraints(
      supabase,
      organisationId,
      id,
      quickEstimate.id
    );
    selectedConstraintSlugs = saved.slugs;
    followUpValues = saved.followUpValues;
    if (saved.error) {
      console.error(
        "[LegacyProjectPage] Failed to load saved constraints:",
        saved.error
      );
    }
  }

  const hasDraftEstimate =
    quickEstimate?.estimated_cost_low != null &&
    quickEstimate?.estimated_cost_high != null;

  return (
    <div>
      <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm">
        <p className="font-medium text-foreground">Legacy project view</p>
        <p className="mt-1 text-muted-foreground">
          This is the previous project assistant. For everyday use, open the{" "}
          <Link
            href={`/projects/${id}`}
            className="font-medium text-primary hover:underline"
          >
            current project page
          </Link>
          .
        </p>
      </div>

      <PageHeader
        title={project.title}
        backHref={`/projects/${id}`}
        action={
          <Button asChild variant="outline" size="sm">
            <Link href={`/projects/${id}/edit`}>
              <Pencil className="h-4 w-4" />
              Edit
            </Link>
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <StatusBadge label={labelFor(PROJECT_STATUSES, project.status)} />
        <StatusBadge
          label={labelFor(ENQUIRY_STATUSES, project.enquiry_status)}
        />
      </div>

      <ProjectDetailsCard
        project={project}
        clientName={clientName(project)}
        clientPhone={clientPhone(project)}
        clientEmail={clientEmail(project)}
      />

      <ProjectAssistantSection
        projectId={id}
        inputs={scopeBuilderInputs ?? []}
        suggestions={scopeSuggestions ?? []}
        confirmedScopes={scopes ?? []}
        scopeQuestions={scopeQuestions ?? []}
        quickEstimate={quickEstimate ?? null}
        selectedConstraintSlugs={selectedConstraintSlugs}
        followUpValues={followUpValues}
        discovery={discovery}
        discoveryMeta={discoveryMeta}
        projectTrades={projectTrades ?? []}
        isLegacy
      />

      <section className="mb-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Confirmed work areas
          </h2>
          <Button asChild size="sm" variant="outline">
            <Link href={`/projects/${id}/scopes/new`}>
              <Plus className="h-4 w-4" />
              Add work area
            </Link>
          </Button>
        </div>
        <ProjectScopesList projectId={id} scopes={scopes ?? []} />
      </section>

      {hasDraftEstimate && <ProjectNextStepsStrip />}
    </div>
  );
}
