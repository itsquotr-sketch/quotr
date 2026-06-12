"use client";

import type { ReactNode } from "react";
import { EstimateQualityCard } from "@/components/projects/estimate-quality-card";
import type { DiscoveryResult } from "@/lib/ai/discovery/types";
import type { DiscoverySummaryConstraint } from "@/lib/project-constraints-load";
import type { EstimateQualityFactor } from "@/lib/cost-engine/estimate-quality";
import type { QuickEstimateConfidenceLevel } from "@/lib/constants/quick-estimate";
import { cn } from "@/lib/utils";

interface DiscoverySummaryProps {
  discovery: DiscoveryResult | null;
  confirmedWorkAreaNames?: string[];
  savedConstraints?: DiscoverySummaryConstraint[];
  estimateDrivers?: string[];
  qualityLevel?: QuickEstimateConfidenceLevel | null;
  qualityFactors?: EstimateQualityFactor[];
  missingItems?: string[];
  className?: string;
}

function NoteBlock({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div>
      <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h4>
      <div className="mt-1 text-sm leading-snug">{children}</div>
    </div>
  );
}

function InlineList({ items }: { items: string[] }) {
  if (items.length === 0) {
    return <span className="text-muted-foreground">—</span>;
  }
  return <span>{items.join(" · ")}</span>;
}

export function DiscoverySummary({
  discovery,
  confirmedWorkAreaNames = [],
  savedConstraints = [],
  estimateDrivers,
  qualityLevel,
  qualityFactors = [],
  missingItems = [],
  className,
}: DiscoverySummaryProps) {
  const summaryConstraints: DiscoverySummaryConstraint[] =
    savedConstraints.length > 0
      ? savedConstraints
      : (discovery?.constraints.map((constraint) => ({
          slug: constraint.slug,
          label: constraint.label,
          source: "notes" as const,
        })) ?? []);

  const driverLabels =
    estimateDrivers ??
    summaryConstraints.map((c) =>
      c.detail ? `${c.label}: ${c.detail}` : c.label
    );

  const workAreaNames =
    confirmedWorkAreaNames.length > 0
      ? confirmedWorkAreaNames
      : (discovery?.workAreas.map((w) => w.name) ?? []);

  const keyFacts = (discovery?.facts ?? []).map((fact) => {
    const unit = fact.unit ? ` ${fact.unit}` : "";
    return `${fact.value}${unit}`;
  });

  const uniqueTrades = discovery
    ? [...new Set(discovery.trades.map((t) => t.name))].sort()
    : [];

  if (
    !discovery &&
    summaryConstraints.length === 0 &&
    workAreaNames.length === 0 &&
    !qualityLevel
  ) {
    return (
      <div
        className={cn(
          "rounded-lg border border-dashed bg-muted/10 p-3 text-xs text-muted-foreground",
          className
        )}
      >
        Run <span className="font-medium text-foreground">Analyse Project</span>{" "}
        on your notes to see what Quotr found.
      </div>
    );
  }

  return (
    <div className={cn("space-y-3 rounded-lg border bg-card p-3", className)}>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        What Quotr found
      </h3>

      <div className="space-y-3 border-b pb-3">
        <NoteBlock title="Work areas">
          <InlineList items={workAreaNames} />
        </NoteBlock>

        <NoteBlock title="Key facts">
          <InlineList items={keyFacts} />
        </NoteBlock>

        <NoteBlock title="Trades">
          <InlineList items={uniqueTrades} />
        </NoteBlock>
      </div>

      <NoteBlock title="Estimate drivers">
        <InlineList items={driverLabels} />
      </NoteBlock>

      {qualityLevel && qualityFactors.length > 0 && (
        <EstimateQualityCard
          level={qualityLevel}
          factors={qualityFactors}
          compact
          className="border-0 bg-muted/20 p-2"
        />
      )}

      {missingItems.length > 0 && (
        <div>
          <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Missing
          </h4>
          <p className="mt-1 text-xs leading-snug text-muted-foreground">
            {missingItems.slice(0, 4).join(" · ")}
          </p>
        </div>
      )}
    </div>
  );
}

/** @deprecated Use DiscoverySummary */
export const ProjectAssistantDiscoverySummary = DiscoverySummary;
