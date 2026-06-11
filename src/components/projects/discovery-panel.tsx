"use client";

import { useMemo, useState } from "react";
import { Check, ChevronDown, ChevronRight, X } from "lucide-react";
import { ProjectAssistantWorkAreas } from "@/components/projects/project-assistant-work-areas";
import type { DiscoveryResult } from "@/lib/discovery";
import {
  buildScopeMissingLabels,
  getKnownFactsForScope,
} from "@/lib/scopes/missing-facts";
import { getScopeByWorkAreaType } from "@/lib/scopes";
import {
  resolveWorkAreaTypeKey,
} from "@/lib/project-assistant-questions";
import { getAnswerValue } from "@/lib/question-keys";
import type { ScopeQuestionWithAnswers } from "@/lib/project-assistant-data";
import type {
  ProjectScope,
  ProjectScopeSuggestion,
} from "@/types/database";
import { cn } from "@/lib/utils";

interface DiscoveryPanelProps {
  projectId: string;
  discovery: DiscoveryResult | null;
  confirmedScopes: (ProjectScope & { scope_types: { name: string } | null })[];
  scopeQuestions: ScopeQuestionWithAnswers[];
  suggestions: ProjectScopeSuggestion[];
}

function CheckList({
  title,
  items,
  variant,
}: {
  title: string;
  items: string[];
  variant: "ok" | "missing";
}) {
  if (items.length === 0) return null;
  const Icon = variant === "ok" ? Check : X;

  return (
    <div>
      <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h4>
      <ul className="mt-1 space-y-0.5">
        {items.map((item) => (
          <li
            key={item}
            className={cn(
              "flex items-start gap-1.5 text-sm leading-snug",
              variant === "missing" && "text-muted-foreground"
            )}
          >
            <Icon
              className={cn(
                "mt-0.5 h-3.5 w-3.5 shrink-0",
                variant === "ok" ? "text-primary" : "text-muted-foreground"
              )}
              aria-hidden
            />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function DiscoveryPanel({
  projectId,
  discovery,
  confirmedScopes,
  scopeQuestions,
  suggestions,
}: DiscoveryPanelProps) {
  const [showWorkAreas, setShowWorkAreas] = useState(false);

  const display = useMemo(() => {
    const workAreas = confirmedScopes.map((s) => s.name);
    const knownFacts: string[] = [];
    const missing: string[] = [];
    const workAreaAnswers: {
      name: string;
      workAreaTypeKey: string;
      answers: Record<string, string>;
    }[] = [];

    for (const scope of confirmedScopes) {
      const typeKey = resolveWorkAreaTypeKey(
        scope.scope_types?.name,
        scope.name
      );
      const answers: Record<string, string> = {};
      for (const q of scopeQuestions.filter(
        (sq) => sq.project_scope_id === scope.id
      )) {
        const row = q.scope_answers?.[0];
        const val =
          row?.answer && typeof row.answer === "object"
            ? String((row.answer as { value?: string }).value ?? "")
            : String(row?.answer ?? "");
        if (q.question_key && val) answers[q.question_key] = val;
      }

      if (discovery?.facts.length) {
        for (const fact of discovery.facts) {
          if (
            fact.workAreaTypeKey &&
            fact.workAreaTypeKey !== typeKey
          ) {
            continue;
          }
          const existing = getAnswerValue(answers, fact.key);
          if (!existing && fact.value) {
            answers[fact.key] = String(fact.value);
          }
        }
      }

      workAreaAnswers.push({
        name: scope.name,
        workAreaTypeKey: typeKey,
        answers,
      });

      for (const fact of getKnownFactsForScope(typeKey, answers)) {
        const value = getAnswerValue(answers, fact.key);
        const unit = fact.unit ? ` ${fact.unit}` : "";
        const label =
          fact.type === "select" && fact.options
            ? (fact.options.find((o) => o.value === value)?.label ?? value)
            : value;
        knownFacts.push(`${fact.label}: ${label}${unit}`);
      }
    }

    missing.push(...buildScopeMissingLabels(workAreaAnswers));

    const tradesFromDiscovery = discovery
      ? [...new Set(discovery.trades.map((t) => t.name))].sort()
      : [];

    const tradesFromScopes = [
      ...new Set(
        confirmedScopes.flatMap((s) => {
          const typeKey = resolveWorkAreaTypeKey(
            s.scope_types?.name,
            s.name
          );
          return getScopeByWorkAreaType(typeKey)?.likelyTrades ?? [];
        })
      ),
    ].sort();

    const trades =
      tradesFromDiscovery.length > 0 ? tradesFromDiscovery : tradesFromScopes;

    return {
      workAreas,
      knownFacts: [...new Set(knownFacts)],
      missing: [...new Set(missing)],
      trades,
    };
  }, [confirmedScopes, scopeQuestions, discovery]);

  if (
    !discovery &&
    display.workAreas.length === 0
  ) {
    return (
      <div className="rounded-lg border border-dashed bg-muted/10 p-3 text-xs text-muted-foreground">
        Run <span className="font-medium text-foreground">Analyse Project</span>{" "}
        on your notes to see what Quotr found.
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border bg-card p-3">
      <CheckList title="Work areas" items={display.workAreas} variant="ok" />
      <CheckList title="Known facts" items={display.knownFacts} variant="ok" />
      <CheckList title="Likely trades" items={display.trades} variant="ok" />
      <CheckList title="Missing" items={display.missing} variant="missing" />

      <div className="border-t pt-2">
        <button
          type="button"
          onClick={() => setShowWorkAreas((v) => !v)}
          className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          {showWorkAreas ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
          Manage work areas
        </button>
        {showWorkAreas && (
          <div className="mt-2">
            <ProjectAssistantWorkAreas
              projectId={projectId}
              suggestions={suggestions}
              confirmedScopes={confirmedScopes}
            />
          </div>
        )}
      </div>
    </div>
  );
}
