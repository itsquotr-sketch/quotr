import Link from "next/link";
import { Briefcase, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProjectsList } from "@/components/projects/projects-list";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { PageHeader } from "@/components/shared/page-header";
import { requireOrganisation } from "@/lib/auth";
import { listProjects } from "@/lib/projects-data";
import { createClient } from "@/lib/supabase/server";

export default async function ProjectsPage() {
  const { organisationId } = await requireOrganisation();
  const supabase = await createClient();

  const { data: projects, error } = await listProjects(
    supabase,
    organisationId
  );

  if (error) {
    console.error("[ProjectsPage] Failed to load projects:", {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
      organisationId,
    });

    const devDetail =
      process.env.NODE_ENV === "development"
        ? `${error.message}${error.code ? ` (${error.code})` : ""}`
        : "Something went wrong fetching your projects. Check your connection and try again.";

    return (
      <div>
        <PageHeader title="Projects" />
        <ErrorState title="Could not load projects" message={devDetail} />
        <div className="mt-4 text-center">
          <Button asChild variant="outline">
            <Link href="/projects">Try again</Link>
          </Button>
        </div>
      </div>
    );
  }

  const projectRows = projects ?? [];

  return (
    <div>
      <PageHeader
        title="Projects"
        description="Turn enquiries into scoped work and quotes."
        action={
          <Button asChild className="hidden md:inline-flex">
            <Link href="/projects/new">
              <Plus className="h-4 w-4" />
              New Project
            </Link>
          </Button>
        }
      />

      <Button asChild size="lg" className="mb-6 w-full md:hidden">
        <Link href="/projects/new">
          <Plus className="h-5 w-5" />
          New Project
        </Link>
      </Button>

      {projectRows.length === 0 ? (
        <EmptyState
          icon={Briefcase}
          title="No projects yet"
          description="Start a project when an enquiry comes in — by phone, email, site visit or plans."
          actionLabel="New Project"
          actionHref="/projects/new"
        />
      ) : (
        <ProjectsList projects={projectRows} />
      )}
    </div>
  );
}
