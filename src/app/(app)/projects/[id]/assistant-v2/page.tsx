import { notFound } from "next/navigation";
import { AssistantV2Shell } from "@/components/assistant-v2/assistant-v2-shell";
import { requireOrganisation } from "@/lib/auth";
import { loadProjectAssistantData } from "@/lib/assistant-v2/load-assistant-data";
import { createClient } from "@/lib/supabase/server";

interface AssistantV2PageProps {
  params: Promise<{ id: string }>;
}

export default async function AssistantV2Page({ params }: AssistantV2PageProps) {
  const { id } = await params;
  const { user, organisationId } = await requireOrganisation();
  const supabase = await createClient();

  const { data, error } = await loadProjectAssistantData(
    supabase,
    organisationId,
    id,
    user.id
  );

  if (error || !data) {
    notFound();
  }

  const scopeIds = data.confirmedScopes.map((scope) => scope.id);
  let rfqCount = 0;

  if (scopeIds.length > 0) {
    const { count } = await supabase
      .from("rfq_packages")
      .select("id", { count: "exact", head: true })
      .in("project_scope_id", scopeIds);
    rfqCount = count ?? 0;
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
      rfqCount={rfqCount}
    />
  );
}
