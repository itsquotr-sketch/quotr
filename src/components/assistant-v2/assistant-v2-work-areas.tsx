"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { deleteProjectScope } from "@/actions/scopes";
import { toggleWorkAreaInQuickEstimate } from "@/actions/work-areas";
import { AnswerChips } from "@/components/assistant-v2/answer-chips";
import { AddMoreDetailButton } from "@/components/assistant-v2/assistant-refinement-trigger";
import { useAssistantChat } from "@/components/assistant-v2/assistant-chat-context";
import { buildMergedAnswersForScope } from "@/lib/assistant-v2/build-merged-answers";
import { computeScopeCompleteness } from "@/lib/assistant-v2/compute-information-completeness";
import {
  getCriticalOrUsefulMissing,
  getOptionalMissing,
  getScopeMissingItems,
} from "@/lib/assistant-v2/missing/get-current-missing-items";
import {
  getWorkAreaDisplayInfo,
  isInternalWorksScope,
} from "@/lib/scopes/classification/display-work-area";
import { packageHasPricingLogic } from "@/lib/scopes/classification/work-package-pricing";
import { getKnownFactsForScope } from "@/lib/scopes/missing-facts";
import { resolveWorkAreaTypeKey } from "@/lib/project-assistant-questions";
import { normalizeQuestionKey } from "@/lib/question-keys";
import type { DiscoveryResult } from "@/lib/ai/discovery/types";
import type { ScopeQuestionWithAnswers } from "@/lib/project-assistant-data";
import type { ScopeFactDefinition } from "@/lib/scopes/types";
import type { ProjectScope, ProjectScopePackage } from "@/types/database";
import { Button } from "@/components/ui/button";
import { useEstimateUpdate } from "@/components/projects/estimate-update-context";
import { cn } from "@/lib/utils";

interface AssistantV2WorkAreasProps {
  projectId: string;
  confirmedScopes: (ProjectScope & { scope_types: { name: string } | null })[];
  scopeQuestions: ScopeQuestionWithAnswers[];
  discovery: DiscoveryResult | null;
  scopePackages?: ProjectScopePackage[];
}

export function AssistantV2WorkAreas({
  projectId,
  confirmedScopes,
  scopeQuestions,
  discovery,
  scopePackages = [],
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
            packages={scopePackages.filter(
              (p) => p.project_scope_id === scope.id && p.status !== "rejected"
            )}
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
  packages,
}: {
  projectId: string;
  scope: ProjectScope & { scope_types: { name: string } | null };
  scopeQuestions: ScopeQuestionWithAnswers[];
  discovery: DiscoveryResult | null;
  packages: ProjectScopePackage[];
}) {
  const { markUpdating, markSaved } = useEstimateUpdate();
  const { flushScopeBatch, optimisticAnswers, syncAssistant } = useAssistantChat();
  const [deletePending, startDelete] = useTransition();
  const [includePending, startInclude] = useTransition();
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

  const completeness = computeScopeCompleteness({
    workAreaTypeKey: typeKey,
    answers: mergedAnswers,
  });
  const display = getWorkAreaDisplayInfo(scope, completeness.percent);
  const isBroad = display.isBroadCategory || isInternalWorksScope(scope);

  const knownFacts = isBroad
    ? []
    : getKnownFactsForScope(typeKey, mergedAnswers);

  const scopeMissingItems = isBroad
    ? []
    : getScopeMissingItems(typeKey, scope.id, scope.name, mergedAnswers);
  const criticalMissing = getCriticalOrUsefulMissing(scopeMissingItems);
  const optionalMissing = getOptionalMissing(scopeMissingItems);

  const confirmedPackages = packages.filter((p) => p.status === "confirmed");
  const suggestedPackages = packages.filter((p) => p.status === "suggested");
  const visiblePackages = confirmedPackages.length > 0 ? confirmedPackages : suggestedPackages;

  const anyIncludedInEstimate = visiblePackages.some(
    (p) => p.include_in_quick_estimate
  );
  const anyNeedsPricing = visiblePackages.some(
    (p) => !p.include_in_quick_estimate && !packageHasPricingLogic(p.package_key)
  );

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

  function handleIncludeInEstimate() {
    startInclude(async () => {
      markUpdating();
      await toggleWorkAreaInQuickEstimate(projectId, scope.id, true);
      await syncAssistant();
      markSaved();
    });
  }

  function handleDelete() {
    if (
      !window.confirm(
        `Remove "${display.displayName}" from this project? This will update your estimate.`
      )
    ) {
      return;
    }

    startDelete(async () => {
      markUpdating();
      await deleteProjectScope(projectId, scope.id);
      await syncAssistant();
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

  function scrollToClarification() {
    document
      .getElementById("internal-works-clarification")
      ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  return (
    <article
      className={cn(
        "rounded-xl border bg-card p-4 shadow-sm",
        isBroad && "border-dashed"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-medium">{display.displayName}</h3>
          {display.statusLabel && (
            <p className="text-xs text-amber-700 dark:text-amber-400">
              {display.statusLabel}
            </p>
          )}
          {display.showConfidence && display.confidencePercent != null && (
            <p className="text-xs text-muted-foreground">
              Confidence {display.confidencePercent}%
            </p>
          )}
          {display.showConfidence &&
            display.confidencePercent != null &&
            display.confidencePercent < 80 &&
            !isBroad &&
            (criticalMissing.length > 0 || optionalMissing.length > 0) && (
              <div className="mt-1 space-y-1">
                <AddMoreDetailButton
                  projectId={projectId}
                  scopeId={scope.id}
                  label="Improve confidence"
                  variant="ghost"
                  className="h-7 px-0 text-primary hover:bg-transparent"
                />
                <div className="text-xs text-muted-foreground">
                  <p className="font-medium">Still missing:</p>
                  <ul className="mt-0.5 space-y-0.5">
                    {[...criticalMissing, ...optionalMissing]
                      .slice(0, 3)
                      .map((item) => (
                        <li key={item.factKey}>
                          •{" "}
                          {item.label
                            .replace(/^[^:]+:\s*/, "")
                            .replace(/ not confirmed$/, "")}
                        </li>
                      ))}
                  </ul>
                  <p className="mt-1">
                    {criticalMissing.length + optionalMissing.length} item
                    {criticalMissing.length + optionalMissing.length === 1
                      ? ""
                      : "s"}{" "}
                    remaining
                    {criticalMissing.length === 0 && optionalMissing.length > 0
                      ? " — critical items complete"
                      : ""}
                  </p>
                </div>
              </div>
            )}
        </div>
        {isBroad && visiblePackages.length > 0 && (
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[10px] font-medium",
              anyIncludedInEstimate
                ? "bg-primary/10 text-primary"
                : "bg-muted text-muted-foreground"
            )}
          >
            {anyIncludedInEstimate
              ? "Included in estimate"
              : "Not included in estimate yet"}
          </span>
        )}
      </div>

      {isBroad && visiblePackages.length > 0 && (
        <div className="mt-3 space-y-1">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Selected packages
          </p>
          <ul className="space-y-0.5 text-sm">
            {visiblePackages.map((pkg) => (
              <li key={pkg.id} className="text-muted-foreground">
                • {pkg.label}
              </li>
            ))}
          </ul>
          {anyNeedsPricing && (
            <p className="text-xs text-muted-foreground">
              Needs pricing before estimate can include this.
            </p>
          )}
        </div>
      )}

      {knownFacts.length > 0 && (
        <div className="mt-3 space-y-2">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Facts
          </p>
          {knownFacts.map((fact) => {
            const value = mergedAnswers[fact.key] ?? "";
            const displayValue = formatFactDisplay(fact, value);
            const isEditing = editingKey === fact.key;
            const question = scopeQuestionMap.get(fact.key);

            return (
              <div key={fact.key} className="text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">{fact.label}:</span>
                  <span className="font-medium">{displayValue}</span>
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

      {criticalMissing.length > 0 && (
        <div className="mt-2">
          <p className="text-xs font-medium text-muted-foreground">Missing:</p>
          <ul className="mt-0.5 space-y-0.5 text-xs text-muted-foreground">
            {criticalMissing.slice(0, 3).map((item) => (
              <li key={item.factKey}>• {item.label.replace(/^[^:]+:\s*/, "")}</li>
            ))}
          </ul>
        </div>
      )}

      {optionalMissing.length > 0 && (
        <div className="mt-2">
          <p className="text-xs font-medium text-muted-foreground">
            Optional details:
          </p>
          <ul className="mt-0.5 space-y-0.5 text-xs text-muted-foreground">
            {optionalMissing.slice(0, 3).map((item) => (
              <li key={item.factKey}>• {item.label.replace(/^[^:]+:\s*/, "")}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {isBroad && display.needsClarification && (
          <Button
            type="button"
            variant="default"
            size="sm"
            className="h-8 text-xs"
            onClick={scrollToClarification}
          >
            Clarify
          </Button>
        )}
        {!isBroad && scope.include_in_quick_estimate === false && (
          <Button
            type="button"
            variant="default"
            size="sm"
            className="h-8 text-xs"
            disabled={includePending}
            onClick={handleIncludeInEstimate}
          >
            Include in estimate
          </Button>
        )}
        {!isBroad && (
          <Button asChild variant="outline" size="sm" className="h-8 text-xs">
            <Link href={`/projects/${projectId}/scopes/${scope.id}/edit`}>
              <Pencil className="mr-1 h-3 w-3" />
              Edit Scope
            </Link>
          </Button>
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 text-xs text-destructive hover:text-destructive"
          disabled={deletePending}
          onClick={handleDelete}
        >
          <Trash2 className="mr-1 h-3 w-3" />
          Remove
        </Button>
        {!isBroad && (
          <Button asChild variant="ghost" size="sm" className="h-8 text-xs">
            <Link href={`/projects/${projectId}/scopes/${scope.id}`}>
              View Details
            </Link>
          </Button>
        )}
      </div>
    </article>
  );
}
