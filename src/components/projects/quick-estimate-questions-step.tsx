"use client";

import { useActionState, useEffect, useState } from "react";
import { saveQuickEstimateAnswers } from "@/actions/quick-estimate";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { QUICK_ESTIMATE_QUESTIONS } from "@/lib/constants/quick-estimate";
import type { QuickEstimateAnswer } from "@/types/database";
import type { QuickEstimateActionState } from "@/lib/validations/quick-estimate";

const initialState: QuickEstimateActionState = {};

function getStoredAnswer(
  answers: QuickEstimateAnswer[],
  key: string
): string {
  const row = answers.find((a) => a.question_key === key);
  if (!row?.answer) return "";
  if (
    typeof row.answer === "object" &&
    row.answer !== null &&
    "value" in row.answer
  ) {
    return String((row.answer as { value: string }).value);
  }
  return String(row.answer);
}

interface QuickEstimateQuestionsStepProps {
  projectId: string;
  quickEstimateId: string;
  answers: QuickEstimateAnswer[];
  onStepComplete: (step: number) => void;
}

export function QuickEstimateQuestionsStep({
  projectId,
  quickEstimateId,
  answers,
  onStepComplete,
}: QuickEstimateQuestionsStepProps) {
  const boundAction = saveQuickEstimateAnswers.bind(
    null,
    projectId,
    quickEstimateId
  );
  const [state, formAction, pending] = useActionState(
    boundAction,
    initialState
  );

  useEffect(() => {
    if (state.success && state.redirectStep) {
      onStepComplete(state.redirectStep);
    }
  }, [state.success, state.redirectStep, onStepComplete]);

  return (
    <form action={formAction} className="space-y-6">
      {QUICK_ESTIMATE_QUESTIONS.map((question) => {
        const stored = getStoredAnswer(answers, question.key);

        if (question.type === "select") {
          return (
            <SelectField
              key={question.key}
              name={question.key}
              label={question.text}
              defaultValue={stored}
              options={question.options}
              error={state.fieldErrors?.[question.key]?.[0]}
            />
          );
        }

        if (question.type === "textarea") {
          return (
            <div key={question.key} className="space-y-2">
              <Label htmlFor={question.key}>{question.text}</Label>
              <Textarea
                id={question.key}
                name={question.key}
                defaultValue={stored}
                rows={4}
                placeholder={question.placeholder}
                className="min-h-[100px] resize-y text-base"
              />
              {state.fieldErrors?.[question.key] && (
                <p className="text-sm text-destructive">
                  {state.fieldErrors[question.key][0]}
                </p>
              )}
            </div>
          );
        }

        return (
          <div key={question.key} className="space-y-2">
            <Label htmlFor={question.key}>{question.text}</Label>
            <Input
              id={question.key}
              name={question.key}
              defaultValue={stored}
              placeholder={question.placeholder}
              className="text-base"
            />
            {state.fieldErrors?.[question.key] && (
              <p className="text-sm text-destructive">
                {state.fieldErrors[question.key][0]}
              </p>
            )}
          </div>
        );
      })}

      {state.error && (
        <p className="text-sm text-destructive">{state.error}</p>
      )}

      <Button type="submit" disabled={pending} className="w-full md:w-auto">
        {pending ? "Saving…" : "Continue"}
      </Button>
    </form>
  );
}

function SelectField({
  name,
  label,
  defaultValue,
  options,
  error,
}: {
  name: string;
  label: string;
  defaultValue: string;
  options: readonly { value: string; label: string }[];
  error?: string;
}) {
  const [value, setValue] = useState(defaultValue);

  return (
    <div className="space-y-2">
      <Label htmlFor={name}>{label}</Label>
      <input type="hidden" name={name} value={value} />
      <Select value={value} onValueChange={setValue}>
        <SelectTrigger id={name} className="text-base">
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
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
