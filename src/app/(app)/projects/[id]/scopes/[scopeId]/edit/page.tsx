import { notFound } from "next/navigation";
import { EditScopeForm } from "@/components/projects/edit-scope-form";
import { PageHeader } from "@/components/shared/page-header";
import { PageContainer } from "@/components/layout/page-container";
import { requireOrganisation } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

interface EditScopePageProps {
  params: Promise<{ id: string; scopeId: string }>;
}

export default async function EditScopePage({ params }: EditScopePageProps) {
  const { id, scopeId } = await params;
  const { organisationId } = await requireOrganisation();
  const supabase = await createClient();

  const { data: scope, error } = await supabase
    .from("project_scopes")
    .select("*")
    .eq("id", scopeId)
    .eq("project_id", id)
    .eq("organisation_id", organisationId)
    .single();

  if (error || !scope) {
    notFound();
  }

  const { data: scopeTypes } = await supabase
    .from("scope_types")
    .select("*")
    .or(`organisation_id.is.null,organisation_id.eq.${organisationId}`)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  return (
    <PageContainer variant="form">
      <PageHeader
        title="Edit scope"
        description="Update scope details, type, and status."
        backHref={`/projects/${id}/scopes/${scopeId}`}
      />
      <EditScopeForm
        projectId={id}
        scope={scope}
        scopeTypes={scopeTypes ?? []}
      />
    </PageContainer>
  );
}
