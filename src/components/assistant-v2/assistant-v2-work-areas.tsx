"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2 } from "lucide-react";
import { deleteProjectScope } from "@/actions/scopes";
import { AnswerChips } from "@/components/assistant-v2/answer-chips";
import { useAssistantChat } from "@/components/assistant-v2/assistant-chat-context";
import { buildMergedAnswersForScope } from "@/lib/assistant-v2/build-merged-answers";
import {
  buildScopeConfidenceFactors,
  computeScopeCompleteness,
} from "@/lib/assistant-v2/compute-information-completeness";
import { getKnownFactsForScope } from "@/lib/scopes/missing-facts";
import { resolveWorkAreaTypeKey } from "@/lib/project-assistant-questions";
import { normalizeQuestionKey } from "@/lib/question-keys";
import type { DiscoveryResult } from "@/lib/ai/discovery/types";
import type { ScopeQuestionWithAnswers } from "@/lib/project-assistant-data";
import type { ScopeFactDefinition } from "@/lib/scopes/types";
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

function formatFactDisplay(fact: ScopeFactDefinition, value: string): string {
  if (fact.type === "select" && fact.options) {
    const opt = fact.options.find((o) => o.value === value);
    if (opt?.label === "Yes") return "Yes";
    if (opt?.label === "No") return "No";
    return opt?.label ?? value;
  }
  if (fact.type === "number") {
    return `${value}${fact.unit ? ` ${fact.unit}` : ""}`;
  }
  return value;
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
  const { flushScopeBatch, optimisticAnswers } = useAssistantChat();
  const [deletePending, startDelete] = useTransition();
  const [editingKey, setEditingKey] = useState<string | null>(null);

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

  const mergedAnswers = useMemo(
    () => ({ ...answers, ...optimisticAnswers }),
    [answers, optimisticAnswers]
  );

  const knownFacts = getKnownFactsForScope(typeKey, mergedAnswers);
  const completeness = computeScopeCompleteness({
    workAreaTypeKey: typeKey,
    answers: mergedAnswers,
  });
  const factors = buildScopeConfidenceFactors(typeKey, mergedAnswers);

  const scopeQuestionMap = useMemo(() => {
    const map = new Map<string, ScopeQuestionWithAnswers>();
    for (const q of scopeQuestions.filter(
      (sq) => sq.project_scope_id === scope.id
    )) {
      const key = normalizeQuestionKey(q.question_key);
      if (key) map.set(key, q);
    }
    return map;
  }, [scopeQuestions, scope.id]);

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

  function handleFactEdit(fact: ScopeFactDefinition, answer: string, label: string) {
    const question = scopeQuestionMap.get(fact.key);
    if (!question) return;

    setEditingKey(null);
    flushScopeBatch([
      {
        questionId: question.id,
        questionKey: fact.key,
        answer,
        label: `${fact.label}: ${label}`,
      },
    ]);
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

      {knownFacts.length > 0 && (
        <div className="mt-3 space-y-2">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Facts
          </p>
          {knownFacts.map((fact) => {
            const value = mergedAnswers[fact.key] ?? "";
            const display = formatFactDisplay(fact, value);
            const isEditing = editingKey === fact.key;
            const question = scopeQuestionMap.get(fact.key);

            return (
              <div key={fact.key} className="text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">{fact.label}:</span>
                  <span className="font-medium">{display}</span>
                </div>
                {isEditing && fact.type === "select" && fact.options && question && (
                  <div className="mt-2">
                    <AnswerChips
                      options={fact.options}
                      value={value}
                      onSelect={(v) => {
                        const label =
                          fact.options!.find((o) => o.value === v)?.label ?? v;
                        handleFactEdit(fact, v, label);
                      }}
                    />
                  </div>
                )}
                {!isEditing && question && fact.type === "select" && fact.options && (
                  <button
                    type="button"
                    className="mt-0.5 text-xs text-primary hover:underline"
                    onClick={() => setEditingKey(fact.key)}
                  >
                    Edit
                  </button>
                )}
              </div>
            );
          })}
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
            Edit Scope
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
