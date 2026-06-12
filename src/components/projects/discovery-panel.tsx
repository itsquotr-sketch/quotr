"use client";



import { useMemo, useState } from "react";

import { Check, ChevronDown, ChevronRight, X } from "lucide-react";

import {

  LikelyTradesEditor,

  type DisplayTrade,

} from "@/components/projects/likely-trades-editor";

import { ProjectAssistantWorkAreas } from "@/components/projects/project-assistant-work-areas";

import type { DiscoveryResult } from "@/lib/ai/discovery/types";

import { buildKnownFactsMapForWorkArea } from "@/lib/scopes/known-facts";

import {
  buildScopeMissingLabels,
  getKnownFactsForScope,
} from "@/lib/scopes/missing-facts";

import { getScopeByWorkAreaType } from "@/lib/scopes";

import { getAnswerValue } from "@/lib/question-keys";

import { resolveWorkAreaTypeKey } from "@/lib/project-assistant-questions";

import type { ScopeQuestionWithAnswers } from "@/lib/project-assistant-data";

import type {

  ProjectScope,

  ProjectScopeSuggestion,

  ProjectTrade,

} from "@/types/database";

import { cn } from "@/lib/utils";



interface DiscoveryPanelProps {

  projectId: string;

  discovery: DiscoveryResult | null;

  confirmedScopes: (ProjectScope & { scope_types: { name: string } | null })[];

  scopeQuestions: ScopeQuestionWithAnswers[];

  suggestions: ProjectScopeSuggestion[];

  projectTrades?: ProjectTrade[];

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

  projectTrades = [],

}: DiscoveryPanelProps) {

  const [showWorkAreas, setShowWorkAreas] = useState(false);



  const display = useMemo(() => {

    const workAreas = confirmedScopes.map((s) => s.name);

    const knownFacts: string[] = [];

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



      const answers = buildKnownFactsMapForWorkArea({

        scopeQuestions,

        scopeId: scope.id,

        workAreaTypeKey: typeKey,

        discovery,

      });



      workAreaAnswers.push({

        name: scope.name,

        workAreaTypeKey: typeKey,

        answers,

      });



      for (const fact of getKnownFactsForScope(typeKey, answers)) {

        const value = getAnswerValue(answers, fact.key) ?? "";

        const unit = fact.unit ? ` ${fact.unit}` : "";

        const label =

          fact.type === "select" && fact.options

            ? (fact.options.find((o) => o.value === value)?.label ?? value)

            : value;

        knownFacts.push(`${fact.label}: ${label}${unit}`);

      }

    }



    const missing = buildScopeMissingLabels(workAreaAnswers);



    const tradeMap = new Map<string, DisplayTrade>();



    if (discovery?.trades.length) {

      for (const trade of discovery.trades) {

        tradeMap.set(trade.name.toLowerCase(), {

          name: trade.name,

          source: "ai",

        });

      }

    }



    for (const scope of confirmedScopes) {

      const typeKey = resolveWorkAreaTypeKey(

        scope.scope_types?.name,

        scope.name

      );

      for (const name of getScopeByWorkAreaType(typeKey)?.likelyTrades ?? []) {

        if (!tradeMap.has(name.toLowerCase())) {

          tradeMap.set(name.toLowerCase(), { name, source: "template" });

        }

      }

    }



    for (const trade of projectTrades) {

      tradeMap.set(trade.trade_name.toLowerCase(), {

        id: trade.id,

        name: trade.trade_name,

        source: "user",

        note: trade.note,

      });

    }



    const trades = [...tradeMap.values()].sort((a, b) =>

      a.name.localeCompare(b.name)

    );



    return {

      workAreas,

      knownFacts: [...new Set(knownFacts)],

      missing: [...new Set(missing)],

      trades,

    };

  }, [confirmedScopes, scopeQuestions, discovery, projectTrades]);



  const pendingSuggestions = suggestions.filter((s) => s.status === "pending");



  if (

    !discovery &&

    display.workAreas.length === 0 &&

    pendingSuggestions.length === 0

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

      {pendingSuggestions.length > 0 && (

        <div className="space-y-2 border-b pb-3">

          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">

            Confirm work areas

          </h4>

          <ProjectAssistantWorkAreas

            projectId={projectId}

            suggestions={suggestions}

            confirmedScopes={confirmedScopes}

          />

        </div>

      )}



      <CheckList title="Work areas" items={display.workAreas} variant="ok" />

      <CheckList title="Known facts" items={display.knownFacts} variant="ok" />



      <div>

        <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">

          Likely trades

        </h4>

        <div className="mt-1">

          <LikelyTradesEditor

            projectId={projectId}

            trades={display.trades}

            confirmedScopes={confirmedScopes}

            userTrades={projectTrades}

          />

        </div>

      </div>



      <CheckList title="Missing" items={display.missing} variant="missing" />



      {pendingSuggestions.length === 0 && (

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

      )}

    </div>

  );

}

