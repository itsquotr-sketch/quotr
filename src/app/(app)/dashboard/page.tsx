import Link from "next/link";
import { MapPin, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/page-header";
import { requireOrganisation } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";

export default async function DashboardPage() {
  const { profile } = await requireOrganisation();
  const supabase = await createClient();

  const { data: recentVisits } = await supabase
    .from("site_visits")
    .select("id, title, client_name, site_address, created_at")
    .order("created_at", { ascending: false })
    .limit(3);

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Capture site visits and build quotes from the field."
      />

      <Button asChild size="lg" className="mb-6 w-full">
        <Link href="/site-visits/new">
          <Plus className="h-5 w-5" />
          New Site Visit
        </Link>
      </Button>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent site visits</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {recentVisits && recentVisits.length > 0 ? (
            recentVisits.map((visit) => (
              <Link
                key={visit.id}
                href={`/site-visits/${visit.id}`}
                className="flex items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-accent"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                  <MapPin className="h-5 w-5 text-muted-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{visit.title}</p>
                  <p className="truncate text-sm text-muted-foreground">
                    {visit.client_name} · {visit.site_address}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatDate(visit.created_at)}
                  </p>
                </div>
              </Link>
            ))
          ) : (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No site visits yet. Tap &ldquo;New Site Visit&rdquo; to capture your first one.
            </p>
          )}
        </CardContent>
      </Card>

      {profile.full_name && (
        <p className="mt-6 text-center text-sm text-muted-foreground">
          Signed in as {profile.full_name}
        </p>
      )}
    </div>
  );
}
