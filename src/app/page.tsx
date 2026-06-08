import { redirect } from "next/navigation";
import { getProfile, getSession } from "@/lib/auth";

export default async function HomePage() {
  const user = await getSession();

  if (!user) {
    redirect("/login");
  }

  const profile = await getProfile();
  if (!profile?.organisation_id) {
    redirect("/onboarding");
  }

  redirect("/dashboard");
}
