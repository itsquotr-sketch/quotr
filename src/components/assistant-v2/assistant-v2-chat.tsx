"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Check } from "lucide-react";
import { acceptScopeSuggestion } from "@/actions/scope-suggestions";
import { AssistantV2QuestionCard } from "@/components/assistant-v2/assistant-v2-question-card";
import { useEstimateUpdate } from "@/components/projects/estimate-update-context";
import { buildMergedAnswersForScope } from "@/lib/assistant-v2/build-merged-answers";
import {
  buildAssistantMessages,
  contextualQuestionText,
} from "@/lib/assistant-v2/build-assistant-messages";
import {
  formatKnownFactLabels,
  type WorkAreaCompletenessInput,
} from "@/lib/assistant-v2/compute-information-completeness";
import type { PricingQuestion } from "@/lib/assistant-v2/get-next-pricing-question";
import type { DiscoveryResult } from "@/lib/discovery";
import { resolveWorkAreaTypeKey } from "@/lib/project-assistant-questions";
import type { ScopeQuestionWithAnswers } from "@/lib/project-assistant-data";
import type {
  ProjectScope,
  ProjectScopeBuilderInput,
  ProjectScopeSuggestion,
} from "@/types/database";
import { cn } from "@/lib/utils";

function UserBubble({ children }: { children: ReactNode }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-sm text-primary-foreground">
        {children}
      </div>
    </div>
  );
}

function AssistantBubble({ children }: { children: ReactNode }) {
  return (
    <div className="flex justify-start">
      <div className="max-w-[90%] rounded-2xl rounded-bl-md border bg-card px-4 py-3 text-sm shadow-sm">
        {children}
      </div>
    </div>
  );
}

interface AssistantV2ChatProps {
  projectId: string;
  inputs: ProjectScopeBuilderInput[];
  confirmedScopes: (ProjectScope & { scope_types: { name: string } | null })[];
  suggestions: ProjectScopeSuggestion[];
  scopeQuestions: ScopeQuestionWithAnswers[];
  discovery: DiscoveryResult | null;
  nextQuestion: PricingQuestion | null;
  workAreas: WorkAreaCompletenessInput[];
  completenessPercent: number;
}

export function AssistantV2Chat({
  projectId,
  inputs,
  confirmedScopes,
  suggestions,
  scopeQuestions,
  discovery,
  nextQuestion,
  workAreas,
  completenessPercent,
}: AssistantV2ChatProps) {
  const router = useRouter();
  const { markUpdating, markSaved } = useEstimateUpdate();
  const [acceptPending, startAccept] = useTransition();

  const messages = buildAssistantMessages({
    inputs,
    confirmedScopes,
    suggestions,
    discovery,
    nextQuestion,
    workAreas,
    completenessPercent,
  });

  function acceptSuggestion(suggestionId: string) {
    startAccept(async () => {
      markUpdating();
      await acceptScopeSuggestion(projectId, suggestionId);
      router.refresh();
      markSaved();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {messages.map((message, index) => {
        switch (message.type) {
          case "greeting":
            return (
              <AssistantBubble key="greeting">
                <p className="font-medium">Hi — tell me about the job.</p>
                <p className="mt-1 text-muted-foreground">
                  Paste notes from a call, upload details, or describe the work.
                  I&apos;ll find the scope, ask only what matters, and build a
                  draft estimate.
                </p>
              </AssistantBubble>
            );

          case "user_note":
            return (
              <UserBubble key={`note-${index}`}>{message.content}</UserBubble>
            );

          case "discovery_summary":
            return (
              <AssistantBubble key="discovery">
                <p className="font-medium">
                  I found a {message.workAreaName.toLowerCase()} project.
                </p>
                {message.facts.length > 0 && (
                  <>
                    <p className="mt-2 text-muted-foreground">
                      Current information:
                    </p>
                    <ul className="mt-1 space-y-1">
                      {message.facts.map((fact) => (
                        <li key={fact} className="flex items-start gap-1.5">
                          <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                          <span>{fact}</span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                {nextQuestion && (
                  <p className="mt-3 text-muted-foreground">
                    To improve the estimate I need one more thing:
                  </p>
                )}
              </AssistantBubble>
            );

          case "confirm_work_areas":
            return (
              <AssistantBubble key="confirm">
                <p className="font-medium">Confirm work areas</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Tap to confirm what applies
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {message.suggestions.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      disabled={acceptPending}
                      onClick={() => acceptSuggestion(s.id)}
                      className={cn(
                        "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-muted",
                        acceptPending && "opacity-60"
                      )}
                    >
                      {s.name}
                    </button>
                  ))}
                </div>
              </AssistantBubble>
            );

          case "question":
            return (
              <QuestionTurn
                key={`q-${message.question.questionId}`}
                projectId={projectId}
                question={message.question}
                workAreas={workAreas}
                completenessPercent={message.completenessPercent}
              />
            );

          case "ready":
            return (
              <AssistantBubble key="ready">
                <p className="font-medium">Ready to estimate</p>
                <p className="mt-1 text-muted-foreground">
                  I have enough to price this job at {message.completenessPercent}%
                  confidence. Check the live estimate — add more notes anytime to
                  refine.
                </p>
              </AssistantBubble>
            );

          default:
            return null;
        }
      })}
    </div>
  );
}

function QuestionTurn({
  projectId,
  question,
  workAreas,
  completenessPercent,
}: {
  projectId: string;
  question: PricingQuestion;
  workAreas: WorkAreaCompletenessInput[];
  completenessPercent: number;
}) {
  const areaInput = workAreas.find(
    (a) => a.workAreaTypeKey === question.workAreaTypeKey
  );
  const knownFacts = areaInput
    ? formatKnownFactLabels(question.workAreaTypeKey, areaInput.answers)
    : [];

  return (
    <div className="flex flex-col gap-2">
      {knownFacts.length > 0 && (
        <AssistantBubble>
          <p className="font-medium">
            I found a {question.scopeName.toLowerCase()} project.
          </p>
          <p className="mt-2 text-muted-foreground">Current information:</p>
          <ul className="mt-1 space-y-1">
            {knownFacts.map((fact) => (
              <li key={fact} className="flex items-start gap-1.5">
                <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                <span>{fact}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-muted-foreground">
            To improve the estimate I need one more thing:
          </p>
          <p className="mt-1 font-medium">{contextualQuestionText(question)}</p>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Confidence {completenessPercent}%
          </p>
        </AssistantBubble>
      )}

      <div className="flex justify-start">
        <AssistantV2QuestionCard
          projectId={projectId}
          question={question}
          showHeader={knownFacts.length === 0}
        />
      </div>
    </div>
  );
}
