import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Calculator,
  FileText,
  ImageIcon,
  Pencil,
  Send,
} from "lucide-react";
import { DeleteScopeFileButton } from "@/components/projects/delete-scope-file-button";
import { StatusBadge } from "@/components/projects/status-badge";
import { PageHeader } from "@/components/shared/page-header";
import { SectionPlaceholder } from "@/components/shared/section-placeholder";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { AI_STATUSES, SCOPE_STATUSES, labelFor } from "@/lib/constants/projects";
import { requireOrganisation } from "@/lib/auth";
import { getSignedStorageUrl } from "@/lib/storage";
import { createClient } from "@/lib/supabase/server";

interface ScopeDetailPageProps {
  params: Promise<{ id: string; scopeId: string }>;
}

export default async function ScopeDetailPage({ params }: ScopeDetailPageProps) {
  const { id, scopeId } = await params;
  const { organisationId } = await requireOrganisation();
  const supabase = await createClient();

  const { data: scope, error } = await supabase
    .from("project_scopes")
    .select(
      `
      *,
      scope_types(name),
      scope_measurements(*),
      scope_photos(*),
      scope_documents(*)
    `
    )
    .eq("id", scopeId)
    .eq("project_id", id)
    .eq("organisation_id", organisationId)
    .single();

  if (error || !scope) {
    if (error) {
      console.error("[ScopeDetailPage] Failed to load scope:", error);
    }
    notFound();
  }

  const photoUrls = await Promise.all(
    (scope.scope_photos ?? []).map(async (photo) => {
      const result = await getSignedStorageUrl(
        "scope-photos",
        photo.storage_path
      );
      return {
        ...photo,
        url: result.ok ? result.url : null,
      };
    })
  );

  const documentUrls = await Promise.all(
    (scope.scope_documents ?? []).map(async (doc) => {
      const result = await getSignedStorageUrl(
        "scope-documents",
        doc.storage_path
      );
      return {
        ...doc,
        url: result.ok ? result.url : null,
      };
    })
  );

  const measurements = [...(scope.scope_measurements ?? [])].sort(
    (a, b) => a.sort_order - b.sort_order
  );

  const isCustom = !scope.scope_type_id;

  return (
    <div>
      <PageHeader
        title={scope.name}
        backHref={`/projects/${id}`}
        action={
          <Button asChild variant="outline" size="sm">
            <Link href={`/projects/${id}/scopes/${scopeId}/edit`}>
              <Pencil className="h-4 w-4" />
              Edit
            </Link>
          </Button>
        }
      />

      <div className="mb-6 flex flex-wrap gap-2">
        <StatusBadge label={labelFor(SCOPE_STATUSES, scope.status)} />
        <StatusBadge label={`AI: ${labelFor(AI_STATUSES, scope.ai_status)}`} />
      </div>

      <section className="mb-6 rounded-xl border bg-card p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Scope overview
        </h2>
        <dl className="mt-3 space-y-3">
          <div>
            <dt className="text-sm text-muted-foreground">Scope type</dt>
            <dd className="font-medium">
              {scope.scope_types?.name ?? (isCustom ? "Custom" : "—")}
            </dd>
          </div>
          {scope.location_area && (
            <div>
              <dt className="text-sm text-muted-foreground">Location / area</dt>
              <dd className="font-medium">{scope.location_area}</dd>
            </div>
          )}
          {scope.description && (
            <div>
              <dt className="text-sm text-muted-foreground">Description</dt>
              <dd className="whitespace-pre-wrap text-sm">{scope.description}</dd>
            </div>
          )}
          {scope.notes && (
            <div>
              <dt className="text-sm text-muted-foreground">Notes</dt>
              <dd className="whitespace-pre-wrap text-sm">{scope.notes}</dd>
            </div>
          )}
        </dl>
      </section>

      {measurements.length > 0 && (
        <section className="mb-6 rounded-xl border bg-card p-4">
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

      <section className="mb-6 rounded-xl border bg-card p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Photos
        </h2>
        {photoUrls.length > 0 ? (
          <div className="mt-3 grid grid-cols-2 gap-2">
            {photoUrls.map((photo) =>
              photo.url ? (
                <div
                  key={photo.id}
                  className="relative aspect-square overflow-hidden rounded-lg border bg-muted"
                >
                  <Image
                    src={photo.url}
                    alt={photo.file_name}
                    fill
                    className="object-cover"
                    sizes="(max-width: 768px) 50vw, 25vw"
                  />
                  <DeleteScopeFileButton
                    projectId={id}
                    scopeId={scopeId}
                    fileId={photo.id}
                    fileName={photo.file_name}
                    type="photo"
                  />
                </div>
              ) : (
                <div
                  key={photo.id}
                  className="relative flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border bg-muted p-2 text-center"
                >
                  <ImageIcon className="h-8 w-8 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">
                    Photo unavailable
                  </span>
                  <DeleteScopeFileButton
                    projectId={id}
                    scopeId={scopeId}
                    fileId={photo.id}
                    fileName={photo.file_name}
                    type="photo"
                  />
                </div>
              )
            )}
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">No photos yet.</p>
        )}
      </section>

      <section className="mb-6 rounded-xl border bg-card p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Documents
        </h2>
        {documentUrls.length > 0 ? (
          <ul className="mt-3 space-y-2">
            {documentUrls.map((doc) => (
              <li
                key={doc.id}
                className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2"
              >
                {doc.url ? (
                  <a
                    href={doc.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex min-w-0 flex-1 items-center gap-2 text-sm font-medium text-primary hover:underline"
                  >
                    <FileText className="h-4 w-4 shrink-0" />
                    <span className="truncate">{doc.file_name}</span>
                  </a>
                ) : (
                  <span className="flex min-w-0 flex-1 items-center gap-2 text-sm text-muted-foreground">
                    <FileText className="h-4 w-4 shrink-0" />
                    <span className="truncate">{doc.file_name}</span>
                    <span className="shrink-0 text-xs">(unavailable)</span>
                  </span>
                )}
                <DeleteScopeFileButton
                  projectId={id}
                  scopeId={scopeId}
                  fileId={doc.id}
                  fileName={doc.file_name}
                  type="document"
                  variant="inline"
                />
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">No documents yet.</p>
        )}
      </section>

      <section className="mb-6 rounded-xl border bg-card p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Scope Assistant
        </h2>
        <p className="mt-3 text-sm text-muted-foreground">
          Write what you know about this scope. Quotr will use this to suggest
          the work required, ask missing questions and prepare estimate items.
        </p>
        <Textarea
          className="mt-4"
          placeholder="AI scope assistant coming next."
          disabled
          rows={4}
        />
      </section>

      <section className="mb-6">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Estimate items
        </h2>
        <SectionPlaceholder
          title="Scope estimate items"
          description="Line items for this scope will feed into the combined project estimate."
          icon={Calculator}
        />
      </section>

      <section className="mb-6">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Trade packages
        </h2>
        <SectionPlaceholder
          title="Trade packages"
          description="Send scope-specific RFQs to subcontractors by trade."
          icon={Send}
        />
      </section>

      <Link
        href={`/projects/${id}`}
        className="block text-center text-sm text-primary hover:underline"
      >
        Back to project
      </Link>
    </div>
  );
}
