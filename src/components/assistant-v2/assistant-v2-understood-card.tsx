"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AnswerChips } from "@/components/assistant-v2/answer-chips";
import { useAssistantChat } from "@/components/assistant-v2/assistant-chat-context";
import { formatKnownFactLabels } from "@/lib/assistant-v2/compute-information-completeness";
import { buildDiscoverySummaryConstraints } from "@/lib/project-constraints-load";
import {
  QUALITY_LEVEL_OPTIONS,
  labelForQualityLevel,
  normaliseQualityLevel,
} from "@/lib/constants/quality-level";
import type { DiscoveryResult } from "@/lib/ai/discovery/types";
import type { ProjectScope } from "@/types/database";

interface AssistantV2UnderstoodCardProps {
  confirmedScopes: (ProjectScope & { scope_types: { name: string } | null })[];
  discovery: DiscoveryResult | null;
  qualityLevel: string;
}

export function AssistantV2UnderstoodCard({
  confirmedScopes,
  discovery,
  qualityLevel,
}: AssistantV2UnderstoodCardProps) {
  const {
    workAreas,
    optimisticConstraintSlugs,
    optimisticQualityLevel,
    submitQualityLevel,
    editSiteConditions,
    flushInFlight,
  } = useAssistantChat();
  const [editPending, setEditPending] = useState(false);

  const primaryWorkArea = workAreas[0] ?? null;

  if (!primaryWorkArea || confirmedScopes.length === 0) return null;

  const facts = formatKnownFactLabels(
    primaryWorkArea.workAreaTypeKey,
    primaryWorkArea.answers
  );

  const savedConstraints = optimisticConstraintSlugs.map((slug) => {
    const fromDiscovery = discovery?.constraints?.find((c) => c.slug === slug);
    return {
      slug,
      label: fromDiscovery?.label ?? slug,
      source: "user" as const,
    };
  });

  const constraintLines = buildDiscoverySummaryConstraints(
    discovery?.constraints ?? [],
    savedConstraints,
    new Set(Object.keys(primaryWorkArea.answers))
  ).map((c) =>
    c.detail ? `${c.label} — ${c.detail}` : `${c.label} — included`
  );

  const activeQuality = normaliseQualityLevel(
    optimisticQualityLevel ?? qualityLevel
  );

  const qualityOptions = QUALITY_LEVEL_OPTIONS.filter(
    (o) => o.value !== "unknown"
  ).map((o) => ({ value: o.value, label: o.label.split(" / ")[0] }));

  return (
    <div className="max-w-[90%] rounded-2xl rounded-bl-md border bg-card px-4 py-3 text-sm shadow-sm">
      <p className="font-medium">Here&apos;s what I understood</p>
      <ul className="mt-2 space-y-1">
        {facts.map((fact) => (
          <li key={fact} className="flex items-start gap-1.5">
            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
            <span>{fact}</span>
          </li>
        ))}
        {constraintLines.map((line) => (
          <li key={line} className="flex items-start gap-1.5">
            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
            <span>{line}</span>
          </li>
        ))}
        <li className="flex flex-col gap-2 pt-1">
          <span className="flex items-start gap-1.5">
            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
            <span>Finish: {labelForQualityLevel(activeQuality)}</span>
          </span>
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
        </li>
      </ul>
      {confirmedScopes.length > 0 && (
        <Button
          type="button"
          variant="link"
          size="sm"
          className="mt-2 h-auto px-0 text-xs"
          disabled={flushInFlight || editPending}
          onClick={() => {
            setEditPending(true);
            void editSiteConditions().finally(() => setEditPending(false));
          }}
        >
          {editPending ? "Resetting site conditions…" : "Edit site conditions"}
        </Button>
      )}
    </div>
  );
}
