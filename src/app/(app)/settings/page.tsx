import { SettingsNavLinks } from "@/components/app-shell/bottom-nav";
import { SignOutButton } from "@/components/app-shell/sign-out-button";
import { PageHeader } from "@/components/shared/page-header";
import { requireOrganisation } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function SettingsPage() {
  const { profile } = await requireOrganisation();
  const supabase = await createClient();

  const { data: organisation } = await supabase
    .from("organisations")
    .select("name")
    .eq("id", profile.organisation_id!)
    .single();

  return (
    <div>
      <PageHeader
        title="Settings"
        description="Manage your account and business."
      />

      <div className="mb-8 rounded-xl border bg-card p-4">
        <dl className="space-y-3">
          <div>
            <dt className="text-sm text-muted-foreground">Name</dt>
            <dd className="font-medium">{profile.full_name ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted-foreground">Business</dt>
            <dd className="font-medium">{organisation?.name ?? "—"}</dd>
          </div>
        </dl>
      </div>

      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        More
      </h2>
      <SettingsNavLinks />

      <div className="mt-8">
        <SignOutButton />
      </div>
    </div>
  );
}
