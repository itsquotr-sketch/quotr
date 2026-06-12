import { redirect } from "next/navigation";

interface AssistantV2RedirectProps {
  params: Promise<{ id: string }>;
}

/** Assistant V2 is now the default project page — redirect old URL. */
export default async function AssistantV2RedirectPage({
  params,
}: AssistantV2RedirectProps) {
  const { id } = await params;
  redirect(`/projects/${id}`);
}
