"use client";

import { useRouter } from "next/navigation";
import {
  useActionState,
  useEffect,
  useState,
  useTransition,
} from "react";
import { CheckCircle2 } from "lucide-react";
import {
  continueToAssistantConstraints,
  ensureAssistantQuestions,
  saveScopeQuestionAnswers,
} from "@/actions/project-assistant";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ScopeQuestionWithAnswers } from "@/lib/project-assistant-data";
import {
  resolveQuestionDef,
  resolveWorkAreaTypeKey,
} from "@/lib/project-assistant-questions";
import { isTemplateRequiredQuestion } from "@/lib/scope-templates";
import type { ProjectAssistantActionState } from "@/actions/project-assistant";
import {
  isDiscoverySource,
  parseScopeAnswer,
  readAnswerValue,
} from "@/lib/scope-answer-format";
import { cn } from "@/lib/utils";

interface ScopeGroup {
  scopeId: string;
  scopeName: string;
  scopeTypeName: string | null;
  questions: ScopeQuestionWithAnswers[];
}

interface ProjectAssistantQuestionsFormProps {
  projectId: string;
  scopeGroups: ScopeGroup[];
  onStepComplete: (step: number) => void;
}

export function ProjectAssistantQuestionsForm({
  projectId,
  scopeGroups,
  onStepComplete,
}: ProjectAssistantQuestionsFormProps) {
  const router = useRouter();
  const boundAction = saveScopeQuestionAnswers.bind(null, projectId);
  const [state, formAction, pending] = useActionState(
    boundAction,
    {} as ProjectAssistantActionState
  );
  const [skipPending, startSkip] = useTransition();
  const [ensuring, startEnsure] = useTransition();
  const [ensureError, setEnsureError] = useState<string | null>(null);

  useEffect(() => {
    startEnsure(async () => {
      setEnsureError(null);
      const result = await ensureAssistantQuestions(projectId);
      if (result.error) {
        setEnsureError(result.error);
        return;
      }
      router.refresh();
    });
  }, [projectId, router]);

  useEffect(() => {
    if (state.success) {
      router.refresh();
    }
  }, [state.success, router]);

  function handleSkip() {
    startSkip(async () => {
      const result = await continueToAssistantConstraints(projectId);
      if (result.nextStep) {
        onStepComplete(result.nextStep);
      }
      router.refresh();
    });
  }

  if (scopeGroups.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Confirm at least one work area above to unlock questions.
      </p>
    );
  }

  if (ensureError) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4">
        <p className="text-sm text-destructive">{ensureError}</p>
      </div>
    );
  }

  if (ensuring && scopeGroups.every((g) => g.questions.length === 0)) {
    return (
      <p className="text-sm text-muted-foreground">
        Preparing questions for your confirmed work areas…
      </p>
    );
  }

  if (scopeGroups.every((g) => g.questions.length === 0)) {
    return (
      <p className="text-sm text-muted-foreground">
        Questions are being prepared for your confirmed work areas. Refresh the
        page if they do not appear shortly.
      </p>
    );
  }

  const totalQuestions = scopeGroups.reduce(
    (sum, g) => sum + g.questions.length,
    0
  );
  const answeredCount = scopeGroups.reduce(
    (sum, g) =>
      sum +
      g.questions.filter((q) => {
        const row = q.scope_answers?.[0];
        return Boolean(readAnswerValue(row?.answer, row?.source).trim());
      }).length,
    0
  );

  return (
    <form action={formAction} className="space-y-6">
      <p className="text-sm text-muted-foreground">
        {answeredCount} of {totalQuestions} questions answered
      </p>

      {scopeGroups.map((group) => {
        if (group.questions.length === 0) return null;
        const typeKey = resolveWorkAreaTypeKey(
          group.scopeTypeName,
          group.scopeName
        );
        const sortedQuestions = [...group.questions].sort((a, b) => {
          const aRow = a.scope_answers?.[0];
          const bRow = b.scope_answers?.[0];
          const aAnswered = Boolean(
            readAnswerValue(aRow?.answer, aRow?.source).trim()
          );
          const bAnswered = Boolean(
            readAnswerValue(bRow?.answer, bRow?.source).trim()
          );
          const aRequired = isTemplateRequiredQuestion(
            typeKey,
            a.question_key
          );
          const bRequired = isTemplateRequiredQuestion(
            typeKey,
            b.question_key
          );

          if (aRequired && !aAnswered && !(bRequired && !bAnswered)) return -1;
          if (bRequired && !bAnswered && !(aRequired && !aAnswered)) return 1;
          if (!aAnswered && bAnswered) return -1;
          if (aAnswered && !bAnswered) return 1;
          return 0;
        });

        return (
          <div key={group.scopeId} className="space-y-4 rounded-xl border p-4">
            <h4 className="font-medium">{group.scopeName}</h4>
            <div className="space-y-4">
              {sortedQuestions.map((q) => (
                <QuestionField
                  key={q.id}
                  question={q}
                  workAreaTypeKey={typeKey}
                />
              ))}
            </div>
          </div>
        );
      })}

      {state.message && (
        <p className="text-sm text-primary">{state.message}</p>
      )}
      {state.error && (
        <p className="text-sm text-destructive">{state.error}</p>
      )}

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          type="submit"
          disabled={pending || skipPending}
          className="w-full sm:w-auto"
        >
          {pending ? "Saving…" : "Save Answers"}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={pending || skipPending}
          className="w-full sm:w-auto"
          onClick={handleSkip}
        >
          {skipPending ? "Continuing…" : "Continue to constraints"}
        </Button>
      </div>
    </form>
  );
}

function parseSelectOptions(
  question: ScopeQuestionWithAnswers,
  def: ReturnType<typeof resolveQuestionDef>
): { value: string; label: string }[] {
  if (question.options && Array.isArray(question.options)) {
    return (question.options as { value: string; label: string }[]).filter(
      (o) => o.value && o.label
    );
  }
  return def?.options ?? [];
}

function QuestionField({
  question,
  workAreaTypeKey,
}: {
  question: ScopeQuestionWithAnswers;
  workAreaTypeKey: string;
}) {
  const answerRow = question.scope_answers?.[0];
  const existing = readAnswerValue(answerRow?.answer, answerRow?.source);
  const isAnswered = Boolean(existing.trim());
  const parsed = parseScopeAnswer(answerRow?.answer, answerRow?.source);
  const fromDiscovery = parsed ? isDiscoverySource(parsed.source) : false;
  const def = resolveQuestionDef(question, workAreaTypeKey);
  const inputType =
    question.question_type ?? def?.inputType ?? "text";
  const unit = question.unit ?? def?.unit;
  const selectOptions = parseSelectOptions(question, def);
  const isRequired = isTemplateRequiredQuestion(
    workAreaTypeKey,
    question.question_key
  );

  return (
    <div
      className={cn(
        "space-y-2 rounded-lg p-3",
        isAnswered ? "bg-primary/5 ring-1 ring-primary/20" : "bg-muted/30"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-1">
          <Label htmlFor={`answer_${question.id}`} className="text-sm font-medium">
            {question.question}
          </Label>
          {isRequired && !isAnswered && (
            <span className="inline-flex rounded bg-amber-500/15 px-1.5 py-0.5 text-xs font-medium text-amber-900 dark:text-amber-100">
              Required
            </span>
          )}
        </div>
        {isAnswered && (
          <span className="inline-flex shrink-0 items-center gap-1 text-xs text-primary">
            <CheckCircle2 className="h-3.5 w-3.5" />
            {fromDiscovery ? "From notes" : "Answered"}
          </span>
        )}
      </div>

      {inputType === "select" && selectOptions.length > 0 ? (
        <SelectField
          questionId={question.id}
          defaultValue={existing}
          options={selectOptions}
        />
      ) : inputType === "number" ? (
        <div className="flex items-center gap-2">
          <Input
            id={`answer_${question.id}`}
            name={`answer_${question.id}`}
            type="number"
            min={0}
            step="any"
            defaultValue={existing}
            placeholder={def?.placeholder}
            className="text-base"
          />
          {unit && (
            <span className="text-sm text-muted-foreground">{unit}</span>
          )}
        </div>
      ) : (
        <Input
          id={`answer_${question.id}`}
          name={`answer_${question.id}`}
          type="text"
          defaultValue={existing}
          placeholder={def?.placeholder}
          className="text-base"
        />
      )}
    </div>
  );
}

function SelectField({
  questionId,
  defaultValue,
  options,
}: {
  questionId: string;
  defaultValue: string;
  options: { value: string; label: string }[];
}) {
  const [value, setValue] = useState(defaultValue || "");

  return (
    <>
      <input type="hidden" name={`answer_${questionId}`} value={value} />
      <Select value={value} onValueChange={setValue}>
        <SelectTrigger id={`answer_${questionId}`} className="text-base">
          <SelectValue placeholder="Choose an option" />
        </SelectTrigger>
        <SelectContent>
          {options.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </>
  );
}
