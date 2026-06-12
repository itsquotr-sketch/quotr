"use client";

import Link from "next/link";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2 } from "lucide-react";
import { deleteProjectScope } from "@/actions/scopes";
import { buildMergedAnswersForScope } from "@/lib/assistant-v2/build-merged-answers";
import {
  buildScopeConfidenceFactors,
  computeScopeCompleteness,
  formatKnownFactLabels,
} from "@/lib/assistant-v2/compute-information-completeness";
import { resolveWorkAreaTypeKey } from "@/lib/project-assistant-questions";
import type { DiscoveryResult } from "@/lib/ai/discovery/types";
import type { ScopeQuestionWithAnswers } from "@/lib/project-assistant-data";
import type { ProjectScope } from "@/types/database";
import { Button } from "@/components/ui/button";
import { useEstimateUpdate } from "@/components/projects/estimate-update-context";

interface AssistantV2WorkAreasProps {
  projectId: string;
  confirmedScopes: (ProjectScope & { scope_types: { name: string } | null })[];
  scopeQuestions: ScopeQuestionWithAnswers[];
  discovery: DiscoveryResult | null;
}

export function AssistantV2WorkAreas({
  projectId,
  confirmedScopes,
  scopeQuestions,
  discovery,
}: AssistantV2WorkAreasProps) {
  if (confirmedScopes.length === 0) return null;

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold">Detected Work Areas</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {confirmedScopes.map((scope) => (
          <WorkAreaCard
            key={scope.id}
            projectId={projectId}
            scope={scope}
            scopeQuestions={scopeQuestions}
            discovery={discovery}
          />
        ))}
      </div>
    </section>
  );
}

function WorkAreaCard({
  projectId,
  scope,
  scopeQuestions,
  discovery,
}: {
  projectId: string;
  scope: ProjectScope & { scope_types: { name: string } | null };
  scopeQuestions: ScopeQuestionWithAnswers[];
  discovery: DiscoveryResult | null;
}) {
  const router = useRouter();
  const { markUpdating, markSaved } = useEstimateUpdate();
  const [deletePending, startDelete] = useTransition();

  const typeKey = resolveWorkAreaTypeKey(
    scope.scope_types?.name,
    scope.name
  );
  const answers = buildMergedAnswersForScope(
    scope.id,
    scope.name,
    scope.scope_types?.name ?? null,
    scopeQuestions,
    discovery
  );
  const completeness = computeScopeCompleteness({
    workAreaTypeKey: typeKey,
    answers,
  });
  const facts = formatKnownFactLabels(typeKey, answers);
  const factors = buildScopeConfidenceFactors(typeKey, answers);

  function handleDelete() {
    if (
      !window.confirm(
        `Remove "${scope.name}" from this project? This will update your estimate.`
      )
    ) {
      return;
    }

    startDelete(async () => {
      markUpdating();
      await deleteProjectScope(projectId, scope.id);
      router.refresh();
      markSaved();
    });
  }

  return (
    <article className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-medium">{scope.name}</h3>
          <p className="text-xs text-muted-foreground">
            Confidence {completeness.percent}%
          </p>
        </div>
      </div>

      {facts.length > 0 && (
        <div className="mt-3">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Facts Found
          </p>
          <ul className="mt-1 space-y-0.5">
            {facts.map((fact) => (
              <li key={fact} className="text-sm">
                {fact}
              </li>
            ))}
          </ul>
        </div>
      )}

      {factors.filter((f) => !f.met).length > 0 && (
        <p className="mt-2 text-xs text-muted-foreground">
          Missing:{" "}
          {factors
            .filter((f) => !f.met)
            .slice(0, 2)
            .map((f) => f.label.replace(/ unknown$/, ""))
            .join(", ")}
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <Button asChild variant="outline" size="sm" className="h-8 text-xs">
          <Link href={`/projects/${projectId}/scopes/${scope.id}/edit`}>
            <Pencil className="mr-1 h-3 w-3" />
            Edit
          </Link>
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 text-xs text-destructive hover:text-destructive"
          disabled={deletePending}
          onClick={handleDelete}
        >
          <Trash2 className="mr-1 h-3 w-3" />
          Delete
        </Button>
        <Button asChild variant="ghost" size="sm" className="h-8 text-xs">
          <Link href={`/projects/${projectId}/scopes/${scope.id}`}>
            View Details
          </Link>
        </Button>
      </div>
    </article>
  );
}
