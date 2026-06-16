"use client";

import { useMemo, useState } from "react";
import { Check, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AnswerChips } from "@/components/assistant-v2/answer-chips";
import { useAssistantChat } from "@/components/assistant-v2/assistant-chat-context";
import type { ProjectCompletenessResult } from "@/lib/assistant-v2/completeness/evaluate-project-completeness";
import { formatKnownFactsForScope } from "@/lib/assistant-v2/completeness/evaluate-project-completeness";
import type { WorkAreaCompletenessInput } from "@/lib/assistant-v2/compute-information-completeness";
import { buildDiscoverySummaryConstraints } from "@/lib/project-constraints-load";
import {
  QUALITY_LEVEL_OPTIONS,
  labelForQualityLevel,
  normaliseQualityLevel,
} from "@/lib/constants/quality-level";
import { getScopeByWorkAreaType } from "@/lib/scopes";
import {
  getMissingOptionalHighImpact,
  getMissingRequiredFacts,
} from "@/lib/scopes/missing-facts";
import type { DiscoveryResult } from "@/lib/ai/discovery/types";
import type { ProjectScope } from "@/types/database";
import { cn } from "@/lib/utils";

interface AssistantV2UnderstoodCardProps {
  confirmedScopes: (ProjectScope & { scope_types: { name: string } | null })[];
  discovery: DiscoveryResult | null;
  qualityLevel: string;
  projectCompleteness: ProjectCompletenessResult;
  overallUnderstandingScore?: number;
  compact?: boolean;
}

function WorkAreaSummary({
  area,
  workAreaInput,
  qualityLevel,
}: {
  area: ProjectCompletenessResult["workAreas"][number];
  workAreaInput: WorkAreaCompletenessInput | undefined;
  qualityLevel: string;
}) {
  if (!workAreaInput || workAreaInput.included === false) return null;

  const projectQuality = normaliseQualityLevel(qualityLevel);

  const knownFacts = formatKnownFactsForScope(
    workAreaInput.workAreaTypeKey,
    workAreaInput.answers
  );

  const missingCritical = getMissingRequiredFacts(
    workAreaInput.workAreaTypeKey,
    workAreaInput.answers,
    { projectQualityLevel: projectQuality }
  ).map((f) => f.label);

  const missingUseful = getMissingOptionalHighImpact(
    workAreaInput.workAreaTypeKey,
    workAreaInput.answers
  ).map((f) => f.label);

  const missing = [...missingCritical, ...missingUseful];

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {area.label}
      </p>
      {knownFacts.map((fact) => (
        <div key={`${area.scopeId}-${fact.label}`} className="flex items-start gap-1.5">
          <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
          <span>
            {fact.label}: {fact.display}
          </span>
        </div>
      ))}
      {missing.length > 0 && (
        <div className="pt-0.5">
          <p className="text-xs text-muted-foreground">Would improve accuracy:</p>
          <ul className="mt-0.5 space-y-0.5">
            {missing.slice(0, 4).map((item) => (
              <li key={`${area.scopeId}-missing-${item}`} className="text-xs">
                • {item}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function AssistantV2UnderstoodCard({
  confirmedScopes,
  discovery,
  qualityLevel,
  projectCompleteness,
  overallUnderstandingScore,
  compact = false,
}: AssistantV2UnderstoodCardProps) {
  const {
    workAreas,
    optimisticConstraintSlugs,
    effectiveDeclinedConstraintSlugs,
    optimisticQualityLevel,
    submitQualityLevel,
    editSiteConditions,
    flushInFlight,
  } = useAssistantChat();
  const [expanded, setExpanded] = useState(!compact);
  const [editPending, setEditPending] = useState(false);

  const includedAreas = projectCompleteness.workAreas.filter((area) => {
    const input = workAreas.find((w) => w.scopeId === area.scopeId);
    return input?.included !== false;
  });

  const assumptions = useMemo(() => {
    const items: string[] = [];
    const activeQuality = normaliseQualityLevel(
      optimisticQualityLevel ?? qualityLevel
    );

    if (activeQuality !== "unknown") {
      items.push(
        `${labelForQualityLevel(activeQuality)} finish assumed unless changed`
      );
    }

    for (const area of includedAreas) {
      const input = workAreas.find((w) => w.scopeId === area.scopeId);
      if (!input) continue;
      const scope = getScopeByWorkAreaType(input.workAreaTypeKey);
      if (scope) {
        items.push(
          `${area.label} scoped using ${scope.name.toLowerCase()} template`
        );
      }
    }

    return [...new Set(items)].slice(0, 4);
  }, [
    includedAreas,
    workAreas,
    optimisticQualityLevel,
    qualityLevel,
  ]);

  if (includedAreas.length === 0 || confirmedScopes.length === 0) return null;

  const savedConstraints = optimisticConstraintSlugs.map((slug) => {
    const fromDiscovery = discovery?.constraints?.find((c) => c.slug === slug);
    return {
      slug,
      label: fromDiscovery?.label ?? slug,
      source: "user" as const,
    };
  });

  const allAnswerKeys = new Set<string>();
  for (const area of workAreas) {
    Object.keys(area.answers).forEach((k) => allAnswerKeys.add(k));
  }

  const constraintLines = buildDiscoverySummaryConstraints(
    discovery?.constraints ?? [],
    savedConstraints,
    allAnswerKeys
  );

  const skippedConstraints = discovery?.constraints?.filter(
    (c) =>
      effectiveDeclinedConstraintSlugs.includes(c.slug) &&
      !optimisticConstraintSlugs.includes(c.slug)
  );

  const activeQuality = normaliseQualityLevel(
    optimisticQualityLevel ?? qualityLevel
  );

  const qualityOptions = QUALITY_LEVEL_OPTIONS.filter(
    (o) => o.value !== "unknown"
  ).map((o) => ({ value: o.value, label: o.label.split(" / ")[0] }));

  const understandingPercent =
    overallUnderstandingScore ?? projectCompleteness.overallCompleteness;

  const isCollapsed = compact && !expanded;

  return (
    <div
      className={cn(
        "max-w-[90%] rounded-2xl rounded-bl-md border bg-card text-sm shadow-sm",
        isCollapsed ? "px-3 py-2" : "px-4 py-3"
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="font-medium">
          {compact ? "Current understanding" : "Here\u2019s what I understood"}
        </p>
        {compact && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>
        )}
      </div>

      {isCollapsed ? (
        <p className="mt-1 text-xs text-muted-foreground">
          {includedAreas.map((a) => a.label).join(" · ")} —{" "}
          {understandingPercent}% complete
        </p>
      ) : (
        <div className="mt-3 space-y-4">
          {includedAreas.map((area) => (
            <WorkAreaSummary
              key={area.scopeId}
              area={area}
              workAreaInput={workAreas.find((w) => w.scopeId === area.scopeId)}
              qualityLevel={qualityLevel}
            />
          ))}

          {(constraintLines.length > 0 || (skippedConstraints?.length ?? 0) > 0) && (
            <div className="space-y-1.5 border-t pt-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Site conditions
              </p>
              {constraintLines.map((c) => (
                <div key={c.slug} className="flex items-start gap-1.5">
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                  <span>
                    {c.detail ? `${c.label} — ${c.detail}` : c.label}
                  </span>
                </div>
              ))}
              {skippedConstraints && skippedConstraints.length > 0 && (
                <div className="pt-0.5">
                  <p className="text-xs text-muted-foreground">Skipped:</p>
                  {skippedConstraints.map((c) => (
                    <p key={c.slug} className="text-xs">
                      • {c.label}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}

          {assumptions.length > 0 && (
            <div className="space-y-1 border-t pt-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Assumptions
              </p>
              {assumptions.map((item) => (
                <p key={item} className="text-xs text-muted-foreground">
                  • {item}
                </p>
              ))}
            </div>
          )}

          <div className="space-y-2 border-t pt-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Finish level
            </p>
            <AnswerChips
              options={qualityOptions}
              value={activeQuality === "unknown" ? "" : activeQuality}
              onSelect={(value) => {
                const option = QUALITY_LEVEL_OPTIONS.find(
                  (o) => o.value === value
                );
                submitQualityLevel(value, option?.label ?? value);
              }}
            />
          </div>

          <Button
            type="button"
            variant="link"
            size="sm"
            className="h-auto px-0 text-xs"
            disabled={flushInFlight || editPending}
            onClick={() => {
              setEditPending(true);
              void editSiteConditions().finally(() => setEditPending(false));
            }}
          >
            {editPending ? "Resetting site conditions…" : "Edit site conditions"}
          </Button>
        </div>
      )}
    </div>
  );
}
