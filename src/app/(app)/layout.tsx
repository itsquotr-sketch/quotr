import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { getProfile, requireAuth } from "@/lib/auth";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAuth();
  const profile = await getProfile();

  if (!profile?.organisation_id) {
    redirect("/onboarding");
  }

  return <AppShell>{children}</AppShell>;
}
