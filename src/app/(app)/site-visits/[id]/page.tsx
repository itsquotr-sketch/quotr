import { notFound } from "next/navigation";
import { ImageIcon, Phone } from "lucide-react";
import { getSiteVisitPhotoUrl } from "@/actions/site-visits";
import { PageHeader } from "@/components/shared/page-header";
import { requireOrganisation } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/utils";

interface SiteVisitDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function SiteVisitDetailPage({
  params,
}: SiteVisitDetailPageProps) {
  const { id } = await params;
  const { organisationId } = await requireOrganisation();
  const supabase = await createClient();

  const { data: visit, error } = await supabase
    .from("site_visits")
    .select(
      `
      *,
      site_visit_measurements (*),
      site_visit_photos (*)
    `
    )
    .eq("id", id)
    .eq("organisation_id", organisationId)
    .single();

  if (error || !visit) {
    notFound();
  }

  const photoUrls = await Promise.all(
    (visit.site_visit_photos ?? []).map(async (photo) => ({
      ...photo,
      url: await getSiteVisitPhotoUrl(photo.storage_path),
    }))
  );

  const measurements = [...(visit.site_visit_measurements ?? [])].sort(
    (a, b) => a.sort_order - b.sort_order
  );

  return (
    <div>
      <PageHeader title={visit.title} backHref="/site-visits" />

      <div className="space-y-6">
        <section className="rounded-xl border bg-card p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Client & site
          </h2>
          <dl className="mt-3 space-y-3">
            <div>
              <dt className="text-sm text-muted-foreground">Client</dt>
              <dd className="font-medium">{visit.client_name}</dd>
            </div>
            {visit.client_phone && (
              <div>
                <dt className="text-sm text-muted-foreground">Phone</dt>
                <dd>
                  <a
                    href={`tel:${visit.client_phone}`}
                    className="inline-flex items-center gap-2 font-medium text-primary hover:underline"
                  >
                    <Phone className="h-4 w-4" />
                    {visit.client_phone}
                  </a>
                </dd>
              </div>
            )}
            <div>
              <dt className="text-sm text-muted-foreground">Address</dt>
              <dd className="font-medium">{visit.site_address}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">Job type</dt>
              <dd>
                <span className="inline-flex rounded-full bg-secondary px-2.5 py-1 text-sm font-medium">
                  {visit.job_type}
                </span>
              </dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">Captured</dt>
              <dd className="text-sm">{formatDateTime(visit.created_at)}</dd>
            </div>
          </dl>
        </section>

        {visit.notes && (
          <section className="rounded-xl border bg-card p-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Notes
            </h2>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed">
              {visit.notes}
            </p>
          </section>
        )}

        {measurements.length > 0 && (
          <section className="rounded-xl border bg-card p-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Measurements
            </h2>
            <dl className="mt-3 divide-y">
              {measurements.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center justify-between py-3 first:pt-0 last:pb-0"
                >
                  <dt className="text-sm text-muted-foreground">{m.label}</dt>
                  <dd className="font-medium">
                    {m.value}
                    {m.unit ? ` ${m.unit}` : ""}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        )}

        <section className="rounded-xl border bg-card p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Photos
          </h2>
          {photoUrls.length > 0 ? (
            <div className="mt-3 grid grid-cols-2 gap-2">
              {photoUrls.map((photo) =>
                photo.url ? (
                  <div
                    key={photo.id}
                    className="aspect-square overflow-hidden rounded-lg border bg-muted"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={photo.url}
                      alt={photo.file_name}
                      className="h-full w-full object-cover"
                    />
                  </div>
                ) : (
                  <div
                    key={photo.id}
                    className="flex aspect-square items-center justify-center rounded-lg border bg-muted"
                  >
                    <ImageIcon className="h-8 w-8 text-muted-foreground" />
                  </div>
                )
              )}
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">No photos captured.</p>
          )}
        </section>
      </div>
    </div>
  );
}
