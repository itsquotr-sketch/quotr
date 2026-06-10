import { notFound } from "next/navigation";
import { EditProjectForm } from "@/components/projects/edit-project-form";
import { PageHeader } from "@/components/shared/page-header";
import { PageContainer } from "@/components/layout/page-container";
import { requireOrganisation } from "@/lib/auth";
import {
  clientEmail,
  clientName,
  clientPhone,
  getProjectById,
} from "@/lib/projects-data";
import { createClient } from "@/lib/supabase/server";

interface EditProjectPageProps {
  params: Promise<{ id: string }>;
}

export default async function EditProjectPage({ params }: EditProjectPageProps) {
  const { id } = await params;
  const { organisationId } = await requireOrganisation();
  const supabase = await createClient();

  const { data: project, error } = await getProjectById(
    supabase,
    id,
    organisationId
  );

  if (error || !project) {
    notFound();
  }

  return (
    <PageContainer variant="form">
      <PageHeader
        title="Edit project"
        description="Update project details, client information, and status."
        backHref={`/projects/${id}`}
      />
      <EditProjectForm
        project={project}
        clientName={clientName(project)}
        clientPhone={clientPhone(project)}
        clientEmail={clientEmail(project)}
      />
    </PageContainer>
  );
}
