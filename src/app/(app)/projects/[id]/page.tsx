import { notFound } from "next/navigation";
import { AssistantV2Shell } from "@/components/assistant-v2/assistant-v2-shell";
import { requireOrganisation } from "@/lib/auth";
import { loadProjectAssistantData } from "@/lib/assistant-v2/load-assistant-data";
import {
  clientEmail,
  clientName,
  clientPhone,
  getProjectById,
} from "@/lib/projects-data";
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

  const [{ data, error }, { data: projectWithClient }] = await Promise.all([
    loadProjectAssistantData(supabase, organisationId, id, user.id),
    getProjectById(supabase, id, organisationId),
  ]);

  if (error || !data || !projectWithClient) {
    notFound();
  }

  return (
    <AssistantV2Shell
      project={data.project}
      projectId={id}
      inputs={data.inputs}
      suggestions={data.suggestions}
      confirmedScopes={data.confirmedScopes}
      scopeQuestions={data.scopeQuestions}
      quickEstimate={data.quickEstimate}
      selectedConstraintSlugs={data.selectedConstraintSlugs}
      discovery={data.discovery}
      chatMessages={data.chatMessages}
      declinedConstraintSlugs={data.declinedConstraintSlugs}
      clientName={clientName(projectWithClient)}
      clientPhone={clientPhone(projectWithClient)}
      clientEmail={clientEmail(projectWithClient)}
    />
  );
}
