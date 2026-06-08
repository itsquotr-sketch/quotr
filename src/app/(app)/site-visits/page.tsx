import Link from "next/link";
import { MapPin, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { requireOrganisation } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";

export default async function SiteVisitsPage() {
  await requireOrganisation();
  const supabase = await createClient();

  const { data: visits, error } = await supabase
    .from("site_visits")
    .select("id, title, client_name, site_address, job_type, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    return (
      <div>
        <PageHeader title="Site visits" />
        <p className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Could not load site visits. Please try again.
        </p>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Site visits"
        description="Capture what you see on site."
        action={
          <Button asChild size="sm">
            <Link href="/site-visits/new">
              <Plus className="h-4 w-4" />
              New
            </Link>
          </Button>
        }
      />

      {!visits || visits.length === 0 ? (
        <EmptyState
          icon={MapPin}
          title="No site visits yet"
          description="Capture your first site visit with photos, notes and measurements while you're on the job."
          actionLabel="New Site Visit"
          actionHref="/site-visits/new"
        />
      ) : (
        <div className="space-y-3">
          {visits.map((visit) => (
            <Link
              key={visit.id}
              href={`/site-visits/${visit.id}`}
              className="block rounded-xl border bg-card p-4 transition-colors hover:bg-accent"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{visit.title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {visit.client_name}
                  </p>
                  <p className="mt-0.5 truncate text-sm text-muted-foreground">
                    {visit.site_address}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-secondary px-2.5 py-1 text-xs font-medium">
                  {visit.job_type}
                </span>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                {formatDate(visit.created_at)}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
