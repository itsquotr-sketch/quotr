import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Calculator,
  FileText,
  Mail,
  MapPin,
  Phone,
  Plus,
  Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProjectScopesList } from "@/components/projects/project-scopes-list";
import { StatusBadge } from "@/components/projects/status-badge";
import { PageHeader } from "@/components/shared/page-header";
import { SectionPlaceholder } from "@/components/shared/section-placeholder";
import {
  ENQUIRY_SOURCES,
  ENQUIRY_STATUSES,
  PROJECT_PRIORITIES,
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
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/utils";

interface ProjectDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function ProjectDetailPage({
  params,
}: ProjectDetailPageProps) {
  const { id } = await params;
  const { organisationId } = await requireOrganisation();
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

  const { data: scopes } = await supabase
    .from("project_scopes")
    .select("*, scope_types(name)")
    .eq("job_id", id)
    .order("sort_order", { ascending: true });

  const scopeIds = (scopes ?? []).map((scope) => scope.id);
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
      <PageHeader title={project.title} backHref="/projects" />

      <div className="mb-6 flex flex-wrap gap-2">
        <StatusBadge label={labelFor(PROJECT_STATUSES, project.status)} />
        <StatusBadge
          label={labelFor(ENQUIRY_STATUSES, project.enquiry_status)}
        />
        <StatusBadge label={labelFor(PROJECT_PRIORITIES, project.priority)} />
      </div>

      <section className="mb-6 rounded-xl border bg-card p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Project overview
        </h2>
        <dl className="mt-3 space-y-3">
          <div>
            <dt className="text-sm text-muted-foreground">Enquiry source</dt>
            <dd className="font-medium">
              {labelFor(ENQUIRY_SOURCES, project.enquiry_source)}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-muted-foreground">Enquiry status</dt>
            <dd className="font-medium">
              {labelFor(ENQUIRY_STATUSES, project.enquiry_status)}
            </dd>
          </div>
          {project.client_brief && (
            <div>
              <dt className="text-sm text-muted-foreground">Client brief</dt>
              <dd className="whitespace-pre-wrap text-sm">{project.client_brief}</dd>
            </div>
          )}
          {project.description && (
            <div>
              <dt className="text-sm text-muted-foreground">Initial notes</dt>
              <dd className="whitespace-pre-wrap text-sm">{project.description}</dd>
            </div>
          )}
          <div>
            <dt className="text-sm text-muted-foreground">Created</dt>
            <dd className="text-sm">{formatDateTime(project.created_at)}</dd>
          </div>
        </dl>
      </section>

      <section className="mb-6 rounded-xl border bg-card p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Client details
        </h2>
        <dl className="mt-3 space-y-3">
          <div>
            <dt className="text-sm text-muted-foreground">Client</dt>
            <dd className="font-medium">{clientName(project)}</dd>
          </div>
          {clientPhone(project) && (
            <div>
              <dt className="text-sm text-muted-foreground">Phone</dt>
              <dd>
                <a
                  href={`tel:${clientPhone(project)}`}
                  className="inline-flex items-center gap-2 font-medium text-primary hover:underline"
                >
                  <Phone className="h-4 w-4" />
                  {clientPhone(project)}
                </a>
              </dd>
            </div>
          )}
          {clientEmail(project) && (
            <div>
              <dt className="text-sm text-muted-foreground">Email</dt>
              <dd>
                <a
                  href={`mailto:${clientEmail(project)}`}
                  className="inline-flex items-center gap-2 font-medium text-primary hover:underline"
                >
                  <Mail className="h-4 w-4" />
                  {clientEmail(project)}
                </a>
              </dd>
            </div>
          )}
          <div>
            <dt className="text-sm text-muted-foreground">Site address</dt>
            <dd className="inline-flex items-start gap-2 font-medium">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              {project.site_address}
            </dd>
          </div>
        </dl>
      </section>

      <section className="mb-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Scopes of work
          </h2>
          <Button asChild size="sm">
            <Link href={`/projects/${id}/scopes/new`}>
              <Plus className="h-4 w-4" />
              Add scope
            </Link>
          </Button>
        </div>
        <ProjectScopesList projectId={id} scopes={scopes ?? []} />
      </section>

      <section className="mb-6">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Estimate
        </h2>
        <SectionPlaceholder
          title="Project estimate"
          description="Scope-specific estimate items will roll up into a combined project estimate."
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
              : "Send trade-specific RFQs by scope when ready."
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
                Quote builder coming soon — combine scope estimates into a client
                quote.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
