import { Sparkles } from "lucide-react";
import { ProjectAssistantWorkspace } from "@/components/projects/project-assistant-workspace";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { DiscoveryResult } from "@/lib/discovery";
import type { ProjectDiscoveryMeta } from "@/lib/discovery-meta";
import type { ScopeQuestionWithAnswers } from "@/lib/project-assistant-data";
import type {
  ProjectScope,
  ProjectScopeBuilderInput,
  ProjectScopeSuggestion,
  QuickEstimate,
} from "@/types/database";

interface ProjectAssistantSectionProps {
  projectId: string;
  inputs: ProjectScopeBuilderInput[];
  suggestions: ProjectScopeSuggestion[];
  confirmedScopes: (ProjectScope & { scope_types: { name: string } | null })[];
  scopeQuestions: ScopeQuestionWithAnswers[];
  quickEstimate: QuickEstimate | null;
  selectedConstraintSlugs: string[];
  followUpValues: Record<string, string | number | undefined>;
  discovery: DiscoveryResult | null;
  discoveryMeta: ProjectDiscoveryMeta;
}

export function ProjectAssistantSection(props: ProjectAssistantSectionProps) {
  return (
    <section className="mb-6" id="project-assistant">
      <Card className="rounded-xl border-primary/20 shadow-sm">
        <CardHeader className="border-b bg-muted/30 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <Sparkles className="h-4 w-4 text-primary" />
            </div>
            <div>
              <CardTitle className="normal-case tracking-normal text-lg font-semibold">
                Project Assistant
              </CardTitle>
              <CardDescription className="text-sm">
                Scope the job naturally — your estimate updates as you go.
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-3 sm:p-4">
          <ProjectAssistantWorkspace {...props} />
        </CardContent>
      </Card>
    </section>
  );
}
