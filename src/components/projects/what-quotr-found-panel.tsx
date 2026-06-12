"use client";

import { DiscoveryPanel } from "@/components/projects/discovery-panel";
import { useScrollTarget } from "@/components/projects/assistant-flow-context";
import type { DiscoveryResult } from "@/lib/ai/discovery/types";
import type { ScopeQuestionWithAnswers } from "@/lib/project-assistant-data";
import type {
  ProjectScope,
  ProjectScopeSuggestion,
  ProjectTrade,
} from "@/types/database";

interface WhatQuotrFoundPanelProps {
  projectId: string;
  discovery: DiscoveryResult | null;
  confirmedScopes: (ProjectScope & { scope_types: { name: string } | null })[];
  scopeQuestions: ScopeQuestionWithAnswers[];
  suggestions: ProjectScopeSuggestion[];
  projectTrades?: ProjectTrade[];
}

export function WhatQuotrFoundPanel(props: WhatQuotrFoundPanelProps) {
  const scrollRef = useScrollTarget("found");

  return (
    <div ref={scrollRef}>
      <DiscoveryPanel {...props} />
    </div>
  );
}
