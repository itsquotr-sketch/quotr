import { SettingsNavLinks } from "@/components/layout/settings-nav-links";
import { SignOutButton } from "@/components/app-shell/sign-out-button";
import { PageHeader } from "@/components/shared/page-header";
import {
  BUSINESS_TYPES,
  COMPANY_SIZES,
} from "@/lib/constants/onboarding";
import { labelFor } from "@/lib/constants/projects";
import { requireOrganisation } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function SettingsPage() {
  const { profile } = await requireOrganisation();
  const supabase = await createClient();

  const { data: organisation } = await supabase
    .from("organisations")
    .select("*")
    .eq("id", profile.organisation_id!)
    .single();

  const displayName =
    profile.full_name ||
    [profile.first_name, profile.last_name].filter(Boolean).join(" ") ||
    "—";

  return (
    <div>
      <PageHeader
        title="Settings"
        description="Manage your account and business."
      />

      <div className="mb-6 rounded-xl border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          You
        </h2>
        <dl className="space-y-3">
          <div>
            <dt className="text-sm text-muted-foreground">Name</dt>
            <dd className="font-medium">{displayName}</dd>
          </div>
          {profile.job_title && (
            <div>
              <dt className="text-sm text-muted-foreground">Job title</dt>
              <dd className="font-medium">{profile.job_title}</dd>
            </div>
          )}
          {profile.phone && (
            <div>
              <dt className="text-sm text-muted-foreground">Phone</dt>
              <dd className="font-medium">{profile.phone}</dd>
            </div>
          )}
        </dl>
      </div>

      <div className="mb-8 rounded-xl border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Company
        </h2>
        <dl className="space-y-3">
          <div>
            <dt className="text-sm text-muted-foreground">Trading name</dt>
            <dd className="font-medium">
              {organisation?.trading_name ?? organisation?.name ?? "—"}
            </dd>
          </div>
          {organisation?.legal_name && (
            <div>
              <dt className="text-sm text-muted-foreground">Legal name</dt>
              <dd className="font-medium">{organisation.legal_name}</dd>
            </div>
          )}
          {organisation?.business_type && (
            <div>
              <dt className="text-sm text-muted-foreground">Business type</dt>
              <dd className="font-medium">
                {labelFor(BUSINESS_TYPES, organisation.business_type)}
              </dd>
            </div>
          )}
          {organisation?.primary_trade && (
            <div>
              <dt className="text-sm text-muted-foreground">Primary trade</dt>
              <dd className="font-medium">{organisation.primary_trade}</dd>
            </div>
          )}
          {organisation?.company_size && (
            <div>
              <dt className="text-sm text-muted-foreground">Company size</dt>
              <dd className="font-medium">
                {labelFor(COMPANY_SIZES, organisation.company_size)}
              </dd>
            </div>
          )}
          {(organisation?.city || organisation?.region) && (
            <div>
              <dt className="text-sm text-muted-foreground">Location</dt>
              <dd className="font-medium">
                {[organisation.city, organisation.region]
                  .filter(Boolean)
                  .join(", ")}
              </dd>
            </div>
          )}
        </dl>
      </div>

      <div className="md:hidden">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          More
        </h2>
        <SettingsNavLinks />
      </div>

      <div className="mt-8">
        <SignOutButton />
      </div>
    </div>
  );
}
