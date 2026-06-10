import { ScopeBuilderForm } from "@/components/projects/scope-builder-form";
import { ScopeBuilderNotesList } from "@/components/projects/scope-builder-notes-list";
import { ScopeBuilderSuggestForm } from "@/components/projects/scope-builder-suggest-form";
import { ScopeBuilderSuggestionsList } from "@/components/projects/scope-builder-suggestions-list";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SCOPE_BUILDER_MISSING_QUESTION_EXAMPLES } from "@/lib/constants/scope-builder";
import type {
  ProjectScopeBuilderInput,
  ProjectScopeSuggestion,
} from "@/types/database";

interface ScopeBuilderSectionProps {
  projectId: string;
  inputs: ProjectScopeBuilderInput[];
  suggestions: ProjectScopeSuggestion[];
}

function ScopeBuilderQuestionsPlaceholder() {
  return (
    <div className="rounded-xl border border-dashed bg-muted/20 p-4">
      <p className="font-medium">Coming next: Missing questions</p>
      <p className="mt-1 text-xs text-muted-foreground">
        Example placeholders only — not generated from your notes yet
      </p>
      <ul className="mt-3 space-y-1.5 text-sm text-muted-foreground">
        {SCOPE_BUILDER_MISSING_QUESTION_EXAMPLES.map((example) => (
          <li key={example} className="flex items-start gap-2">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/50" />
            {example}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ScopeBuilderSection({
  projectId,
  inputs,
  suggestions,
}: ScopeBuilderSectionProps) {
  return (
    <section className="mb-6">
      <Card className="rounded-xl">
        <CardHeader>
          <CardTitle className="normal-case tracking-normal text-xl font-semibold">
            Scope Builder
          </CardTitle>
          <CardDescription>
            Tell Quotr what you know about this project. Later, Quotr will use
            this to suggest scopes, ask missing questions and prepare estimate
            items.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-8">
          <ScopeBuilderForm projectId={projectId} />

          <div className="space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Saved project notes
            </h3>
            <ScopeBuilderNotesList projectId={projectId} inputs={inputs} />
          </div>

          <ScopeBuilderSuggestForm
            projectId={projectId}
            hasNotes={inputs.length > 0}
          />

          <div className="space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Suggested scopes
            </h3>
            <ScopeBuilderSuggestionsList
              projectId={projectId}
              suggestions={suggestions}
            />
          </div>

          <ScopeBuilderQuestionsPlaceholder />
        </CardContent>
      </Card>
    </section>
  );
}
