import { redirect } from "next/navigation";
import { OnboardingForm } from "@/components/onboarding/onboarding-form";
import { AppLogo } from "@/components/app-shell/bottom-nav";
import { getProfile, requireAuth } from "@/lib/auth";

export default async function OnboardingPage() {
  await requireAuth();
  const profile = await getProfile();

  if (profile?.organisation_id) {
    redirect("/dashboard");
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="px-6 py-8">
        <AppLogo />
      </header>
      <main className="mx-auto w-full max-w-md flex-1 px-6 pb-8">
        <h1 className="text-2xl font-bold tracking-tight">Set up your business</h1>
        <p className="mt-2 text-muted-foreground">
          Tell us your business name. You can change this later in settings.
        </p>
        <div className="mt-8">
          <OnboardingForm />
        </div>
      </main>
    </div>
  );
}
