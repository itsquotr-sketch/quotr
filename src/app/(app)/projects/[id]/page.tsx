import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Calculator,
  FileText,
  Pencil,
  Plus,
  Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProjectAssistantSection } from "@/components/projects/project-assistant-section";
import { ProjectDetailsCard } from "@/components/projects/project-details-card";
import { ProjectScopesList } from "@/components/projects/project-scopes-list";
import { StatusBadge } from "@/components/projects/status-badge";
import { PageHeader } from "@/components/shared/page-header";
import { SectionPlaceholder } from "@/components/shared/section-placeholder";
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
import { createClient } from "@/lib/supabase/server";

interface ProjectDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function ProjectDetailPage({
  params,
}: ProjectDetailPageProps) {
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
      console.error("[ProjectDetailPage] Failed to load project:", error);
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
  ] = await Promise.all([
    listScopeBuilderInputs(supabase, organisationId, id),
    listScopeSuggestions(supabase, organisationId, id),
    getQuickEstimateForProject(supabase, organisationId, id),
    getLatestDiscoveryEngineRun(supabase, organisationId, id),
    getLatestDiscoveryRun(supabase, organisationId, id),
    getProjectDiscoveryMeta(supabase, organisationId, id),
    listScopeQuestionsForProject(supabase, scopeIds),
  ]);

  if (scopeBuilderError) {
    console.error(
      "[ProjectDetailPage] Failed to load scope builder inputs:",
      scopeBuilderError
    );
  }

  if (scopeSuggestionsError) {
    console.error(
      "[ProjectDetailPage] Failed to load scope suggestions:",
      scopeSuggestionsError
    );
  }

  if (quickEstimateError) {
    console.error(
      "[ProjectDetailPage] Failed to load quick estimate:",
      quickEstimateError
    );
  }

  const discovery =
    parseDiscoveryEngineRun(latestEngineRun ?? null) ??
    parseDiscoveryRun(latestDiscoveryRun ?? null);

  if (scopeQuestionsError) {
    console.error(
      "[ProjectDetailPage] Failed to load scope questions:",
      scopeQuestionsError
    );
  }

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
    if (saved.error) {
      console.error(
        "[ProjectDetailPage] Failed to load saved constraints:",
        saved.error
      );
    }
  }

  let rfqCount = 0;

  if (scopeIds.length > 0) {
    const { count } = await supabase
      .from("rfq_packages")
      .select("id", { count: "exact", head: true })
      .in("project_scope_id", scopeIds);
    rfqCount = count ?? 0;
  }

  return (
    <div>
      <PageHeader
        title={project.title}
        backHref="/projects"
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

      <section className="mb-6">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Detailed estimate
        </h2>
        <SectionPlaceholder
          title="Detailed estimate"
          description="Line-item build-up for quoting comes after the client confirms they are interested."
          icon={Calculator}
        />
      </section>

      <section className="mb-6">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          RFQs
        </h2>
        <SectionPlaceholder
          title="Subcontractor RFQs"
          description={
            rfqCount
              ? `${rfqCount} RFQ package(s) will appear here.`
              : "Send trade-specific RFQs when you are ready to quote."
          }
          icon={Send}
        />
      </section>

      <section className="mb-6">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Quote
        </h2>
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center gap-3">
            <FileText className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="font-medium">Client quote</p>
              <p className="text-sm text-muted-foreground">
                Quote builder coming soon — roll up your detailed estimate into
                a client-facing quote.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
