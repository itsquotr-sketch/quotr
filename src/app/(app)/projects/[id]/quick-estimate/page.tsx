import { redirect } from "next/navigation";

interface QuickEstimatePageProps {
  params: Promise<{ id: string }>;
}

/** Quick estimate is driven by Project Assistant — this route redirects to review on the project page. */
export default async function QuickEstimatePage({
  params,
}: QuickEstimatePageProps) {
  const { id: projectId } = await params;
  redirect(`/projects/${projectId}`);
}
