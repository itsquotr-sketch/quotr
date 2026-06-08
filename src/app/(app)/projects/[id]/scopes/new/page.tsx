import { notFound } from "next/navigation";
import { AddScopeForm } from "@/components/projects/add-scope-form";
import { PageHeader } from "@/components/shared/page-header";
import { requireOrganisation } from "@/lib/auth";
import { getProjectById } from "@/lib/projects-data";
import { createClient } from "@/lib/supabase/server";

interface NewScopePageProps {
  params: Promise<{ id: string }>;
}

export default async function NewScopePage({ params }: NewScopePageProps) {
  const { id } = await params;
  const { organisationId } = await requireOrganisation();
  const supabase = await createClient();

  const { data: project } = await getProjectById(supabase, id, organisationId);

  if (!project) {
    notFound();
  }

  const { data: scopeTypes } = await supabase
    .from("scope_types")
    .select("*")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  return (
    <div>
      <PageHeader
        title="Add scope of work"
        description={`Add a scope to ${project.title}`}
        backHref={`/projects/${id}`}
      />
      <AddScopeForm projectId={id} scopeTypes={scopeTypes ?? []} />
    </div>
  );
}
