import { Sparkles } from "lucide-react";
import { ProjectAssistantWizard } from "@/components/projects/project-assistant-wizard";
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
    <section className="mb-8" id="project-assistant">
      <Card className="rounded-xl border-primary/20 shadow-sm">
        <CardHeader className="border-b bg-muted/30 pb-6">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
              <Sparkles className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="normal-case tracking-normal text-2xl font-semibold">
                Project Assistant
              </CardTitle>
              <CardDescription className="mt-1 text-base">
                Write your notes once, confirm the work areas, answer a few
                questions, select what makes the job harder — and get a quick
                estimate.
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="pt-8">
          <ProjectAssistantWizard {...props} />
        </CardContent>
      </Card>
    </section>
  );
}
