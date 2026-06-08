import { redirect } from "next/navigation";
import { BottomNav } from "@/components/app-shell/bottom-nav";
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

  return (
    <div className="min-h-dvh pb-20">
      <main className="mx-auto max-w-lg px-4 py-6">{children}</main>
      <BottomNav />
    </div>
  );
}
