import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/projects/status-badge";
import { AI_STATUSES, SCOPE_STATUSES, labelFor } from "@/lib/constants/projects";
import type { ProjectScope } from "@/types/database";

interface ProjectScopesListProps {
  projectId: string;
  scopes: (ProjectScope & { scope_types: { name: string } | null })[];
}

export function ProjectScopesList({ projectId, scopes }: ProjectScopesListProps) {
  if (scopes.length === 0) {
    return (
      <div className="rounded-xl border border-dashed px-4 py-8 text-center">
        <p className="text-sm text-muted-foreground">
          No scopes of work yet. Add scopes like bathroom, kitchen or deck to
          capture details for each area.
        </p>
        <Button asChild className="mt-4" size="sm">
          <Link href={`/projects/${projectId}/scopes/new`}>Add scope</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {scopes.map((scope) => (
        <div key={scope.id} className="rounded-xl border bg-card p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{scope.name}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {scope.scope_types?.name ??
                  (scope.scope_type_id ? "Scope" : "Custom")}
                {scope.location_area ? ` · ${scope.location_area}` : ""}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <StatusBadge label={labelFor(SCOPE_STATUSES, scope.status)} />
                <StatusBadge
                  label={`AI: ${labelFor(AI_STATUSES, scope.ai_status)}`}
                />
              </div>
            </div>
          </div>
          <Button asChild variant="outline" size="sm" className="mt-4 w-full">
            <Link href={`/projects/${projectId}/scopes/${scope.id}`}>
              Open scope
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      ))}
    </div>
  );
}
