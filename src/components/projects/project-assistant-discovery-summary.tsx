"use client";

import type { ReactNode } from "react";
import type { DiscoveryResult } from "@/lib/discovery";
import type { DiscoverySummaryConstraint } from "@/lib/project-constraints-load";
import type { ProjectDiscoveryMeta } from "@/lib/discovery-meta";
import { cn } from "@/lib/utils";

interface ProjectAssistantDiscoverySummaryProps {
  discovery: DiscoveryResult | null;
  discoveryMeta?: ProjectDiscoveryMeta;
  confirmedWorkAreaNames?: string[];
  savedConstraints?: DiscoverySummaryConstraint[];
  className?: string;
}

function Section({
  title,
  children,
  emptyMessage,
  hasItems,
}: {
  title: string;
  children: ReactNode;
  emptyMessage: string;
  hasItems: boolean;
}) {
  return (
    <div className="rounded-xl border bg-muted/20 p-4">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h4>
      {hasItems ? (
        <div className="mt-3">{children}</div>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">{emptyMessage}</p>
      )}
    </div>
  );
}

export function ProjectAssistantDiscoverySummary({
  discovery,
  discoveryMeta,
  confirmedWorkAreaNames = [],
  savedConstraints = [],
  className,
}: ProjectAssistantDiscoverySummaryProps) {
  const summaryConstraints: DiscoverySummaryConstraint[] =
    savedConstraints.length > 0
      ? savedConstraints
      : (discovery?.constraints.map((constraint) => ({
          slug: constraint.slug,
          label: constraint.label,
          source: "notes" as const,
        })) ?? []);

  if (!discovery && summaryConstraints.length === 0) {
    return (
      <div
        className={cn(
          "rounded-xl border border-dashed bg-muted/10 p-4 text-sm text-muted-foreground",
          className
        )}
      >
        Run <span className="font-medium text-foreground">Analyse Project</span>{" "}
        on your notes to see what Quotr discovered — work areas, facts,
        constraints, questions, and trades.
      </div>
    );
  }

  const workAreaNames =
    confirmedWorkAreaNames.length > 0
      ? confirmedWorkAreaNames
      : (discovery?.workAreas.map((w) => w.name) ?? []);

  const uniqueTrades = discovery
    ? [...new Set(discovery.trades.map((t) => t.name))].sort()
    : [];

  return (
    <div className={cn("space-y-4", className)}>
      <div>
        <h3 className="text-sm font-semibold">Discovery summary</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Information Quotr found in your notes — review and confirm before
          generating a quick estimate.
        </p>
        {discoveryMeta?.analysedAt && (
          <p className="mt-2 text-xs text-muted-foreground">
            Provider:{" "}
            <span className="font-medium text-foreground">
              {discoveryMeta.providerLabel}
            </span>
            {discoveryMeta.confidence != null && (
              <>
                {" "}
                · Confidence:{" "}
                <span className="font-medium text-foreground">
                  {Math.round(discoveryMeta.confidence * 100)}%
                </span>
              </>
            )}
          </p>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Section
          title="Work areas"
          hasItems={workAreaNames.length > 0}
          emptyMessage="No work areas identified yet."
        >
          <ul className="space-y-1 text-sm">
            {workAreaNames.map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
        </Section>

        <Section
          title="Scope facts"
          hasItems={(discovery?.facts.length ?? 0) > 0}
          emptyMessage="No measurements or scope facts found in notes yet."
        >
          <ul className="space-y-2 text-sm">
            {(discovery?.facts ?? []).map((fact) => (
              <li key={`${fact.key}-${fact.value}`}>
                <span className="text-muted-foreground">{fact.label}: </span>
                <span className="font-medium">{fact.value}</span>
              </li>
            ))}
          </ul>
        </Section>

        <Section
          title="Constraints"
          hasItems={summaryConstraints.length > 0}
          emptyMessage="No constraints selected yet."
        >
          <ul className="space-y-1 text-sm">
            {summaryConstraints.map((constraint) => (
              <li key={constraint.slug}>
                {constraint.detail
                  ? `${constraint.label}: ${constraint.detail}`
                  : constraint.label}
              </li>
            ))}
          </ul>
        </Section>

        <Section
          title="Likely trades"
          hasItems={uniqueTrades.length > 0}
          emptyMessage="Confirm work areas to see likely trades."
        >
          <ul className="space-y-1 text-sm">
            {uniqueTrades.map((trade) => (
              <li key={trade}>{trade}</li>
            ))}
          </ul>
        </Section>
      </div>

      {discovery?.qualityLevel &&
        discovery.qualityLevel.value !== "unknown" && (
          <div className="rounded-xl border bg-muted/20 p-4">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Finish level detected
            </h4>
            <p className="mt-2 text-sm">
              <span className="font-medium">
                {discovery.qualityLevel.value === "budget"
                  ? "Budget / basic"
                  : discovery.qualityLevel.value === "standard"
                    ? "Standard / mid-range"
                    : "Premium / high-end"}
              </span>
              {discovery.qualityLevel.reason
                ? ` — ${discovery.qualityLevel.reason}`
                : ""}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Confirm or override in Budget, finish and constraints.
            </p>
          </div>
        )}

      <div className="grid gap-4 md:grid-cols-2">
        <Section
          title="Risks"
          hasItems={(discovery?.risks?.length ?? 0) > 0}
          emptyMessage="No specific risks flagged."
        >
          <ul className="space-y-2 text-sm">
            {(discovery?.risks ?? []).map((risk) => (
              <li key={risk.title}>
                <span className="font-medium">{risk.title}</span>
                <p className="text-muted-foreground">{risk.description}</p>
              </li>
            ))}
          </ul>
        </Section>

        <Section
          title="Assumptions"
          hasItems={(discovery?.assumptions?.length ?? 0) > 0}
          emptyMessage="No assumptions recorded."
        >
          <ul className="space-y-1 text-sm">
            {(discovery?.assumptions ?? []).map((assumption) => (
              <li key={assumption}>{assumption}</li>
            ))}
          </ul>
        </Section>
      </div>
    </div>
  );
}
