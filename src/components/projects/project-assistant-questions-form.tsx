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
import type { ScopeQuestionWithAnswers } from "@/lib/project-assistant-data";
import {
  resolveQuestionDef,
  resolveWorkAreaTypeKey,
} from "@/lib/project-assistant-questions";
import {
  isTemplateAffectsEstimateQuestion,
  isTemplateRequiredQuestion,
} from "@/lib/scope-templates";
import type { ProjectAssistantActionState } from "@/actions/project-assistant";
import {
  isDiscoverySource,
  parseScopeAnswer,
} from "@/lib/scope-answer-format";
import { answerValueToString, isAnswered } from "@/lib/scope-answer-state";
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

  const allQuestions = scopeGroups.flatMap((g) =>
    g.questions.map((q) => ({
      question: q,
      scopeName: g.scopeName,
      typeKey: resolveWorkAreaTypeKey(g.scopeTypeName, g.scopeName),
    }))
  );

  const missingQuestions = allQuestions.filter(({ question, typeKey }) => {
    const row = question.scope_answers?.[0];
    const def = resolveQuestionDef(question, typeKey);
    const inputType = question.question_type ?? def?.inputType ?? "text";
    const options = parseSelectOptions(question, def);
    const answered = isAnswered(row?.answer, row?.source, {
      inputType: inputType as "text" | "number" | "select" | "boolean",
      requiresPositiveNumber: inputType === "number",
      allowedValues:
        inputType === "select" && options.length > 0
          ? options.map((o) => o.value)
          : undefined,
    });
    if (answered) return false;
    const required = isTemplateRequiredQuestion(typeKey, question.question_key);
    const affects = isTemplateAffectsEstimateQuestion(
      typeKey,
      question.question_key
    );
    return required || affects;
  });

  const answeredQuestions = allQuestions.filter(({ question, typeKey }) => {
    const row = question.scope_answers?.[0];
    const def = resolveQuestionDef(question, typeKey);
    const inputType = question.question_type ?? def?.inputType ?? "text";
    const options = parseSelectOptions(question, def);
    return isAnswered(row?.answer, row?.source, {
      inputType: inputType as "text" | "number" | "select" | "boolean",
      requiresPositiveNumber: inputType === "number",
      allowedValues:
        inputType === "select" && options.length > 0
          ? options.map((o) => o.value)
          : undefined,
    });
  });

  return (
    <form action={formAction} className="space-y-8">
      {missingQuestions.length > 0 ? (
        <section className="space-y-4">
          <div>
            <h4 className="text-sm font-semibold">Missing information</h4>
            <p className="mt-1 text-sm text-muted-foreground">
              These answers help tighten your draft quick estimate.
            </p>
          </div>
          {scopeGroups.map((group) => {
            const typeKey = resolveWorkAreaTypeKey(
              group.scopeTypeName,
              group.scopeName
            );
            const groupMissing = group.questions.filter((q) =>
              missingQuestions.some((m) => m.question.id === q.id)
            );
            if (groupMissing.length === 0) return null;

            return (
              <div
                key={group.scopeId}
                className="space-y-4 rounded-xl border p-4"
              >
                <h5 className="font-medium">{group.scopeName}</h5>
                <div className="space-y-4">
                  {groupMissing.map((q) => (
                    <QuestionField
                      key={q.id}
                      question={q}
                      workAreaTypeKey={typeKey}
                      variant="missing"
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </section>
      ) : (
        <p className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-primary">
          All key information provided — your estimate can use the measurements
          you have given.
        </p>
      )}

      {answeredQuestions.length > 0 && (
        <section className="space-y-4">
          <div>
            <h4 className="text-sm font-semibold">Information used</h4>
            <p className="mt-1 text-sm text-muted-foreground">
              Already captured from your notes or answers.
            </p>
          </div>
          <ul className="space-y-2">
            {answeredQuestions.map(({ question, scopeName, typeKey }) => {
              const row = question.scope_answers?.[0];
              const value =
                answerValueToString(row?.answer, row?.source) ?? "";
              const parsed = parseScopeAnswer(row?.answer, row?.source);
              const fromDiscovery = parsed
                ? isDiscoverySource(parsed.source)
                : false;
              const def = resolveQuestionDef(question, typeKey);
              const selectOptions = parseSelectOptions(question, def);
              const displayValue =
                selectOptions.find((o) => o.value === value)?.label ?? value;

              return (
                <li
                  key={question.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/30 px-3 py-2 text-sm"
                >
                  <span className="text-muted-foreground">
                    {scopeName}: {question.question}
                  </span>
                  <span className="inline-flex items-center gap-1 font-medium">
                    {displayValue}
                    {fromDiscovery && (
                      <span className="text-xs font-normal text-primary">
                        (from notes)
                      </span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

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
          {pending ? "Saving…" : "Save answers"}
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
  variant,
}: {
  question: ScopeQuestionWithAnswers;
  workAreaTypeKey: string;
  variant: "missing" | "answered";
}) {
  const answerRow = question.scope_answers?.[0];
  const def = resolveQuestionDef(question, workAreaTypeKey);
  const inputType = question.question_type ?? def?.inputType ?? "text";
  const unit = question.unit ?? def?.unit;
  const selectOptions = parseSelectOptions(question, def);
  const existing =
    answerValueToString(answerRow?.answer, answerRow?.source) ?? "";
  const questionAnswered = isAnswered(answerRow?.answer, answerRow?.source, {
    inputType: inputType as "text" | "number" | "select" | "boolean",
    requiresPositiveNumber: inputType === "number",
    allowedValues:
      inputType === "select" && selectOptions.length > 0
        ? selectOptions.map((o) => o.value)
        : undefined,
  });
  const parsed = parseScopeAnswer(answerRow?.answer, answerRow?.source);
  const fromDiscovery = parsed ? isDiscoverySource(parsed.source) : false;
  const isRequired = isTemplateRequiredQuestion(
    workAreaTypeKey,
    question.question_key
  );

  return (
    <div
      className={cn(
        "space-y-3 rounded-lg p-3",
        variant === "missing" ? "bg-muted/30" : "bg-primary/5 ring-1 ring-primary/20"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-1">
          <Label htmlFor={`answer_${question.id}`} className="text-sm font-medium">
            {question.question}
          </Label>
          {isRequired && variant === "missing" && (
            <span className="inline-flex rounded bg-amber-500/15 px-1.5 py-0.5 text-xs font-medium text-amber-900 dark:text-amber-100">
              Required
            </span>
          )}
        </div>
        {questionAnswered && (
          <span className="inline-flex shrink-0 items-center gap-1 text-xs text-primary">
            <CheckCircle2 className="h-3.5 w-3.5" />
            {fromDiscovery ? "From notes" : "Answered"}
          </span>
        )}
      </div>

      {inputType === "select" && selectOptions.length > 0 ? (
        <AnswerChips
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
            className="max-w-[200px] text-base"
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

function AnswerChips({
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
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setValue(opt.value)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
              value === opt.value
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background text-foreground hover:bg-muted"
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </>
  );
}
