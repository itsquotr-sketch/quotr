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
import {
  evaluateScopeConfidence,
  confidenceStatusToTier,
} from "@/lib/assistant-v2/confidence/evaluate-confidence";
import { getFactConfirmationStatus } from "@/lib/assistant-v2/fact-confirmation-status";
import {
  getCriticalOrUsefulMissing,
  getOptionalMissing,
  getScopeMissingItems,
} from "@/lib/assistant-v2/missing/get-current-missing-items";
import { getMissingRequiredFactsForWorkArea } from "@/lib/assistant-v2/stages/required-fact-gating";
import { getCardKeyFactDefinitions } from "@/lib/assistant-v2/work-area-card-key-facts";
import {
  getWorkAreaDisplayInfo,
  isInternalWorksScope,
} from "@/lib/scopes/classification/display-work-area";
import { packageHasPricingLogic } from "@/lib/scopes/classification/work-package-pricing";
import { resolveWorkAreaTypeKey } from "@/lib/project-assistant-questions";
import { normalizeQuestionKey } from "@/lib/question-keys";
import type { DiscoveryResult } from "@/lib/ai/discovery/types";
import type { ScopeQuestionWithAnswers } from "@/lib/project-assistant-data";
import type { ScopeFactDefinition } from "@/lib/scopes/types";
import type { ProjectScope, ProjectScopePackage } from "@/types/database";
import { Button } from "@/components/ui/button";
import { useEstimateUpdate } from "@/components/projects/estimate-update-context";
import { labelForQualityLevel, normaliseQualityLevel } from "@/lib/constants/quality-level";
import { resolveEffectiveFinishLevel } from "@/lib/scopes/resolve-effective-finish";
import { TRUST_COPY } from "@/lib/assistant-v2/trust-messages";
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
  if (confirmedScopes.length === 0) {
    return (
      <section className="space-y-3 rounded-xl border border-dashed bg-muted/30 p-4">
        <h2 className="text-sm font-semibold">Work Areas</h2>
        <p className="text-sm text-muted-foreground">
          Tell Quotr what you&apos;re building in the chat to detect work areas
          and start your estimate.
        </p>
      </section>
    );
  }

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

function tierBadgeLabel(tier: string): string {
  return tier === "READY" ? "READY FOR DRAFT" : tier;
}

function tierBadgeClass(tier: string): string {
  switch (tier) {
    case "READY":
      return "bg-primary/10 text-primary";
    case "GOOD":
      return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400";
    case "FAIR":
      return "bg-amber-500/10 text-amber-700 dark:text-amber-400";
    default:
      return "bg-muted text-muted-foreground";
  }
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
  const { markUpdating, markSaved, setPendingAction, isActionPending } =
    useEstimateUpdate();
  const { flushScopeBatch, optimisticAnswers, syncByKinds, flushInFlight, optimisticQualityLevel } =
    useAssistantChat();
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

  const projectQuality = normaliseQualityLevel(optimisticQualityLevel ?? "unknown");

  const scopeConfidence = useMemo(
    () =>
      evaluateScopeConfidence(
        {
          scopeId: scope.id,
          scopeName: scope.name,
          workAreaTypeKey: typeKey,
          answers: mergedAnswers,
          included: scope.include_in_quick_estimate !== false,
        },
        {
          qualityLevel: projectQuality,
          siteConstraintsAssessed: false,
        }
      ),
    [scope.id, scope.name, typeKey, mergedAnswers, scope.include_in_quick_estimate, projectQuality]
  );

  const display = getWorkAreaDisplayInfo(scope, scopeConfidence.score);
  const isBroad = display.isBroadCategory || isInternalWorksScope(scope);
  const statusTier = confidenceStatusToTier(scopeConfidence.status);

  const keyFactDefs = getCardKeyFactDefinitions(typeKey);
  const requiredMissing = isBroad
    ? []
    : getMissingRequiredFactsForWorkArea(typeKey, mergedAnswers).map(
        (f) => f.label
      );

  const scopeMissingItems = isBroad
    ? []
    : getScopeMissingItems(typeKey, scope.id, scope.name, mergedAnswers);
  const usefulMissing = getCriticalOrUsefulMissing(scopeMissingItems)
    .filter((item) => item.importance === "useful")
    .map((item) => item.label.replace(/^[^:]+:\s*/, ""));
  const optionalMissing = getOptionalMissing(scopeMissingItems).map((item) =>
    item.label.replace(/^[^:]+:\s*/, "")
  );

  const confirmedPackages = packages.filter((p) => p.status === "confirmed");
  const suggestedPackages = packages.filter((p) => p.status === "suggested");
  const visiblePackages =
    confirmedPackages.length > 0 ? confirmedPackages : suggestedPackages;

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

  const summaryFacts = useMemo(() => {
    const rows: {
      fact: ScopeFactDefinition;
      value: string;
      status: "confirmed" | "assumed" | "unknown";
    }[] = [];

    for (const fact of keyFactDefs) {
      const raw = mergedAnswers[fact.key];
      const status = getFactConfirmationStatus(
        fact,
        mergedAnswers,
        scopeQuestions,
        scope.id,
        discovery,
        scope.name,
        scope.scope_types?.name ?? null
      );

      if (status === "unknown" && !raw) continue;
      if (fact.type === "select" && raw === "no") continue;

      const value = raw ? formatFactDisplay(fact, raw) : "";
      if (!value && status === "unknown") continue;

      rows.push({ fact, value, status });
      if (rows.length >= 5) break;
    }
    return rows;
  }, [
    keyFactDefs,
    mergedAnswers,
    scopeQuestions,
    scope.id,
    discovery,
    scope.name,
    scope.scope_types?.name,
  ]);

  const readinessLabel = requiredMissing.length
    ? "NEEDS BEFORE PRICING"
    : usefulMissing.length
      ? "WOULD IMPROVE ACCURACY"
      : "READY FOR DRAFT ESTIMATE";

  const readinessItems = requiredMissing.length
    ? requiredMissing.slice(0, 4).map((item) => ({
        text: item,
        kind: "required" as const,
      }))
    : usefulMissing.length
      ? usefulMissing.slice(0, 4).map((item) => ({
          text: item,
          kind: "useful" as const,
        }))
      : optionalMissing.slice(0, 3).map((item) => ({
          text: item,
          kind: "optional" as const,
        }));

  const effectiveFinish = resolveEffectiveFinishLevel({
    scopeTypeKey: typeKey,
    answers: mergedAnswers,
    projectQualityLevel: projectQuality,
  });
  const finishFact = keyFactDefs.find((f) => f.key.includes("finish_level"));
  const finishSource =
    finishFact &&
    getFactConfirmationStatus(
      finishFact,
      mergedAnswers,
      scopeQuestions,
      scope.id,
      discovery,
      scope.name,
      scope.scope_types?.name ?? null
    ) === "confirmed"
      ? "confirmed"
      : effectiveFinish !== "unknown"
        ? "global"
        : null;

  function handleIncludeInEstimate() {
    if (includePending || deletePending || flushInFlight) return;

    startInclude(async () => {
      setPendingAction("adding_work_area");
      markUpdating();
      await toggleWorkAreaInQuickEstimate(projectId, scope.id, true);
      await syncByKinds(["scopes", "estimate"]);
      markSaved();
    });
  }

  function handleDelete() {
    if (includePending || deletePending || flushInFlight) return;

    if (
      !window.confirm(
        `Remove "${display.displayName}" from this project? This will update your estimate.`
      )
    ) {
      return;
    }

    startDelete(async () => {
      setPendingAction("removing_work_area");
      markUpdating();
      await deleteProjectScope(projectId, scope.id);
      await syncByKinds(["scopes", "estimate"]);
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

  const actionsDisabled =
    flushInFlight ||
    includePending ||
    deletePending ||
    isActionPending("saving_answer");

  return (
    <article
      className={cn(
        "rounded-xl border bg-card p-4 shadow-sm",
        isBroad && "border-dashed"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-medium">{display.displayName}</h3>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                tierBadgeClass(statusTier)
              )}
            >
              {tierBadgeLabel(statusTier)}
            </span>
          </div>
          {display.showConfidence && display.confidencePercent != null && (
            <p className="mt-0.5 text-[10px] text-muted-foreground">
              {display.confidencePercent}% confidence
            </p>
          )}
          {finishSource && effectiveFinish !== "unknown" && (
            <p className="mt-0.5 text-[10px] text-muted-foreground">
              Finish: {labelForQualityLevel(effectiveFinish)} · {finishSource}
            </p>
          )}
          {scope.include_in_quick_estimate === false && !isBroad && (
            <p className="mt-0.5 text-[10px] font-medium text-muted-foreground">
              Excluded from estimate
            </p>
          )}
        </div>
        {isBroad && visiblePackages.length > 0 && (
          <span
            className={cn(
              "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium",
              anyIncludedInEstimate
                ? "bg-primary/10 text-primary"
                : "bg-muted text-muted-foreground"
            )}
          >
            {anyIncludedInEstimate
              ? "Included in estimate"
              : TRUST_COPY.notIncludedYet}
          </span>
        )}
      </div>

      {isBroad && visiblePackages.length > 0 && (
        <div className="mt-3 space-y-1">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Selected packages
          </p>
          <ul className="space-y-0.5 text-sm text-muted-foreground">
            {visiblePackages.map((pkg) => (
              <li key={pkg.id}>• {pkg.label}</li>
            ))}
          </ul>
          {anyNeedsPricing && (
            <p className="text-xs text-muted-foreground">
              Needs pricing before estimate can include this.
            </p>
          )}
        </div>
      )}

      {!isBroad && summaryFacts.length > 0 && (
        <div className="mt-3 space-y-1.5">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Summary
          </p>
          {summaryFacts.map(({ fact, value, status }) => {
            const isEditing = editingKey === fact.key;
            const question = scopeQuestionMap.get(fact.key);

            return (
              <div key={fact.key} className="text-sm">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-muted-foreground">{fact.label}</span>
                  <span
                    className={cn(
                      "text-right text-sm",
                      status === "assumed" && "text-muted-foreground",
                      status === "confirmed" && "font-medium text-foreground"
                    )}
                  >
                    {value || "—"}
                    {status === "confirmed" && (
                      <span className="ml-1 text-[10px] font-normal text-muted-foreground">
                        · confirmed
                      </span>
                    )}
                    {status === "assumed" && (
                      <span className="ml-1 text-[10px] font-normal text-muted-foreground">
                        · assumed
                      </span>
                    )}
                  </span>
                </div>
                {isEditing && fact.type === "select" && fact.options && question && (
                  <div className="mt-2">
                    <AnswerChips
                      options={fact.options}
                      value={mergedAnswers[fact.key] ?? ""}
                      disabled={actionsDisabled}
                      onSelect={(v) => {
                        const label =
                          fact.options!.find((o) => o.value === v)?.label ?? v;
                        handleFactEdit(fact, v, label);
                      }}
                    />
                  </div>
                )}
                {!isEditing &&
                  question &&
                  fact.type === "select" &&
                  fact.options && (
                    <button
                      type="button"
                      className="mt-0.5 text-xs text-primary hover:underline disabled:opacity-50"
                      disabled={actionsDisabled}
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

      {!isBroad && (
        <div className="mt-3">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            {readinessLabel}
          </p>
          {readinessItems.length > 0 ? (
            <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
              {readinessItems.map((item) => (
                <li key={`${item.kind}-${item.text}`}>
                  •{" "}
                  {item.kind === "optional"
                    ? `Optional detail — ${item.text}`
                    : item.kind === "useful"
                      ? `Would improve accuracy — ${item.text}`
                      : `Needed before pricing — ${item.text}`}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground">
              Enough detail for a draft estimate.
            </p>
          )}
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
            disabled={actionsDisabled}
            onClick={handleIncludeInEstimate}
          >
            {includePending ? TRUST_COPY.addingWorkArea : "Include in estimate"}
          </Button>
        )}
        {!isBroad && (
          <>
            <Button asChild variant="outline" size="sm" className="h-8 text-xs">
              <Link href={`/projects/${projectId}/scopes/${scope.id}/edit`}>
                <Pencil className="mr-1 h-3 w-3" />
                Edit scope
              </Link>
            </Button>
            {readinessLabel !== "READY FOR DRAFT ESTIMATE" && (
              <AddMoreDetailButton
                projectId={projectId}
                scopeId={scope.id}
                label="Improve estimate"
                variant="outline"
                className="h-8 text-xs"
              />
            )}
          </>
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 text-xs text-destructive hover:text-destructive"
          disabled={actionsDisabled}
          onClick={handleDelete}
        >
          <Trash2 className="mr-1 h-3 w-3" />
          {deletePending ? TRUST_COPY.removingWorkArea : "Remove"}
        </Button>
        {!isBroad && (
          <Button asChild variant="ghost" size="sm" className="h-8 text-xs">
            <Link href={`/projects/${projectId}/scopes/${scope.id}`}>
              View details
            </Link>
          </Button>
        )}
      </div>
    </article>
  );
}
