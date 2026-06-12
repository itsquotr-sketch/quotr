"use client";

import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { CheckCircle2, ChevronDown, ChevronRight } from "lucide-react";
import {
  autoSaveScopeQuestionAnswer,
  ensureAssistantQuestions,
} from "@/actions/project-assistant";
import { autosaveDevLog } from "@/lib/autosave/autosave-dev-log";
import { hasMeaningfulChange } from "@/lib/autosave/has-meaningful-change";
import { useEstimateUpdate } from "@/components/projects/estimate-update-context";
import { buildKnownFactsMapForWorkArea } from "@/lib/scopes/known-facts";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useDebounce } from "@/hooks/use-debounce";
import type { ScopeQuestionWithAnswers } from "@/lib/project-assistant-data";
import {
  resolveQuestionDef,
  resolveWorkAreaTypeKey,
} from "@/lib/project-assistant-questions";
import type { DiscoveryResult } from "@/lib/ai/discovery/types";
import {
  getScopeByWorkAreaType,
  isFactKnownForScope,
  isScopeSupportedWorkArea,
  questionKeyMatchesScopeFact,
} from "@/lib/scopes";
import { normalizeQuestionKey } from "@/lib/question-keys";
import {
  isTemplateAffectsEstimateQuestion,
  isTemplateRequiredQuestion,
} from "@/lib/scope-templates";
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
  discovery?: DiscoveryResult | null;
}

function buildMergedAnswersForGroup(
  group: ScopeGroup,
  discovery: DiscoveryResult | null | undefined
): Record<string, string> {
  const typeKey = resolveWorkAreaTypeKey(
    group.scopeTypeName,
    group.scopeName
  );

  return buildKnownFactsMapForWorkArea({
    scopeQuestions: group.questions,
    scopeId: group.scopeId,
    workAreaTypeKey: typeKey,
    discovery,
  });
}

function questionBelongsInMainFlow(
  question: ScopeQuestionWithAnswers,
  typeKey: string
): boolean {
  if (isScopeSupportedWorkArea(typeKey)) {
    return questionKeyMatchesScopeFact(question.question_key, typeKey);
  }
  const required = isTemplateRequiredQuestion(typeKey, question.question_key);
  const affects = isTemplateAffectsEstimateQuestion(
    typeKey,
    question.question_key
  );
  return required || affects;
}

function isRequiredQuestion(
  question: ScopeQuestionWithAnswers,
  typeKey: string
): boolean {
  const key = normalizeQuestionKey(question.question_key);
  const scope = getScopeByWorkAreaType(typeKey);
  if (scope && key) {
    return scope.requiredFacts.some((f) => f.key === key);
  }
  return isTemplateRequiredQuestion(typeKey, question.question_key);
}

export function ProjectAssistantQuestionsForm({
  projectId,
  scopeGroups,
  discovery,
}: ProjectAssistantQuestionsFormProps) {
  const router = useRouter();
  const { runGuardedRefresh } = useEstimateUpdate();
  const [ensuring, startEnsure] = useTransition();
  const [ensureError, setEnsureError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showOptional, setShowOptional] = useState(false);
  const ensuredRef = useRef(false);

  useEffect(() => {
    if (ensuredRef.current) return;
    ensuredRef.current = true;
    startEnsure(async () => {
      setEnsureError(null);
      const result = await ensureAssistantQuestions(projectId);
      if (result.error) {
        setEnsureError(result.error);
        ensuredRef.current = false;
        return;
      }
      router.refresh();
    });
  }, [projectId, router]);

  const handleAutoSave = useCallback(
    async (questionId: string, answer: string, previousValue: string) => {
      if (!answer.trim()) return;
      if (!hasMeaningfulChange(previousValue, answer.trim())) {
        autosaveDevLog("autosave", "skipped — no value change");
        return;
      }
      setSaveError(null);
      autosaveDevLog("autosave", "saving changed value");
      const result = await autoSaveScopeQuestionAnswer(
        projectId,
        questionId,
        answer.trim()
      );
      if (result.error) {
        setSaveError(result.error);
        return;
      }
      if (result.message === "No changes.") {
        return;
      }
      await runGuardedRefresh(async () => {
        router.refresh();
      }, "answer_changed");
    },
    [projectId, router, runGuardedRefresh]
  );

  const mergedByScopeId = useMemo(() => {
    const map = new Map<string, Record<string, string>>();
    for (const group of scopeGroups) {
      map.set(group.scopeId, buildMergedAnswersForGroup(group, discovery));
    }
    return map;
  }, [scopeGroups, discovery]);

  if (scopeGroups.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Confirm at least one work area to unlock questions.
      </p>
    );
  }

  if (ensureError) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3">
        <p className="text-sm text-destructive">{ensureError}</p>
      </div>
    );
  }

  if (ensuring && scopeGroups.every((g) => g.questions.length === 0)) {
    return (
      <p className="text-sm text-muted-foreground">Preparing questions…</p>
    );
  }

  const allQuestions = scopeGroups.flatMap((g) =>
    g.questions
      .filter((q) => questionBelongsInMainFlow(q, resolveWorkAreaTypeKey(g.scopeTypeName, g.scopeName)))
      .map((q) => ({
        question: q,
        scopeId: g.scopeId,
        scopeName: g.scopeName,
        typeKey: resolveWorkAreaTypeKey(g.scopeTypeName, g.scopeName),
      }))
  );

  const isKnown = (
    question: ScopeQuestionWithAnswers,
    typeKey: string,
    scopeId: string
  ) => {
    if (isQuestionAnswered(question, typeKey)) return true;
    const merged = mergedByScopeId.get(scopeId) ?? {};
    return isFactKnownForScope(typeKey, question.question_key, merged);
  };

  const missingRequired = allQuestions.filter(({ question, typeKey, scopeId }) => {
    if (!isRequiredQuestion(question, typeKey)) return false;
    return !isKnown(question, typeKey, scopeId);
  });

  const missingOptional = allQuestions.filter(({ question, typeKey, scopeId }) => {
    if (isRequiredQuestion(question, typeKey)) return false;
    if (!isKnown(question, typeKey, scopeId)) {
      const key = normalizeQuestionKey(question.question_key);
      const scope = getScopeByWorkAreaType(typeKey);
      if (scope && key) {
        return scope.confidenceRules.highImpactOptionalKeys.includes(key);
      }
    }
    return false;
  });

  const answeredQuestions = allQuestions.filter(({ question, typeKey, scopeId }) =>
    isKnown(question, typeKey, scopeId)
  );

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Answers save automatically and update your estimate.
      </p>

      {missingRequired.length > 0 ? (
        <section className="space-y-3">
          {scopeGroups.map((group) => {
            const typeKey = resolveWorkAreaTypeKey(
              group.scopeTypeName,
              group.scopeName
            );
            const groupMissing = group.questions.filter((q) =>
              missingRequired.some((m) => m.question.id === q.id)
            );
            if (groupMissing.length === 0) return null;

            return (
              <div
                key={group.scopeId}
                className="space-y-2 rounded-lg border p-3"
              >
                <h5 className="text-sm font-medium">{group.scopeName}</h5>
                {groupMissing.map((q) => (
                  <QuestionField
                    key={q.id}
                    question={q}
                    workAreaTypeKey={typeKey}
                    required
                    onAutoSave={handleAutoSave}
                  />
                ))}
              </div>
            );
          })}
        </section>
      ) : (
        <p className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-primary">
          Required information captured — estimate is using your answers.
        </p>
      )}

      {missingOptional.length > 0 && (
        <section>
          <button
            type="button"
            onClick={() => setShowOptional((v) => !v)}
            className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            {showOptional ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
            Improve estimate ({missingOptional.length} optional)
          </button>
          {showOptional && (
            <div className="mt-2 space-y-2 rounded-lg border border-dashed p-3">
              {missingOptional.map(({ question, typeKey }) => (
                <QuestionField
                  key={question.id}
                  question={question}
                  workAreaTypeKey={typeKey}
                  onAutoSave={handleAutoSave}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {answeredQuestions.length > 0 && (
        <section className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">Captured</p>
          <ul className="space-y-1">
            {answeredQuestions.map(({ question, scopeName, typeKey }) => (
              <CapturedAnswerRow
                key={question.id}
                question={question}
                scopeName={scopeName}
                typeKey={typeKey}
              />
            ))}
          </ul>
        </section>
      )}

      {saveError && (
        <p className="text-xs text-destructive">{saveError}</p>
      )}
    </div>
  );
}

function isQuestionAnswered(
  question: ScopeQuestionWithAnswers,
  typeKey: string
): boolean {
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
}

function CapturedAnswerRow({
  question,
  scopeName,
  typeKey,
}: {
  question: ScopeQuestionWithAnswers;
  scopeName: string;
  typeKey: string;
}) {
  const row = question.scope_answers?.[0];
  const value = answerValueToString(row?.answer, row?.source) ?? "";
  const parsed = parseScopeAnswer(row?.answer, row?.source);
  const fromDiscovery = parsed ? isDiscoverySource(parsed.source) : false;
  const def = resolveQuestionDef(question, typeKey);
  const selectOptions = parseSelectOptions(question, def);
  const displayValue =
    selectOptions.find((o) => o.value === value)?.label ?? value;

  return (
    <li className="flex flex-wrap justify-between gap-1 rounded bg-muted/30 px-2 py-1 text-xs">
      <span className="text-muted-foreground">
        {scopeName}: {question.question}
      </span>
      <span className="font-medium">
        {displayValue}
        {fromDiscovery && (
          <span className="ml-1 font-normal text-primary">(notes)</span>
        )}
      </span>
    </li>
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
  required = false,
  onAutoSave,
}: {
  question: ScopeQuestionWithAnswers;
  workAreaTypeKey: string;
  required?: boolean;
  onAutoSave: (questionId: string, answer: string, previousValue: string) => void;
}) {
  const answerRow = question.scope_answers?.[0];
  const def = resolveQuestionDef(question, workAreaTypeKey);
  const inputType = question.question_type ?? def?.inputType ?? "text";
  const unit = question.unit ?? def?.unit;
  const selectOptions = parseSelectOptions(question, def);
  const existing =
    answerValueToString(answerRow?.answer, answerRow?.source) ?? "";
  const parsed = parseScopeAnswer(answerRow?.answer, answerRow?.source);
  const fromDiscovery = parsed ? isDiscoverySource(parsed.source) : false;
  const questionAnswered = isQuestionAnswered(question, workAreaTypeKey);

  return (
    <div className="space-y-2 rounded-lg bg-muted/20 p-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-0.5">
          <Label className="text-sm font-medium">{question.question}</Label>
          {required && (
            <span className="text-[10px] font-medium text-amber-700 dark:text-amber-300">
              Required
            </span>
          )}
        </div>
        {questionAnswered && (
          <span className="inline-flex items-center gap-0.5 text-[10px] text-primary">
            <CheckCircle2 className="h-3 w-3" />
            {fromDiscovery ? "Notes" : "Saved"}
          </span>
        )}
      </div>

      {inputType === "select" && selectOptions.length > 0 ? (
        <AnswerChips
          defaultValue={existing}
          options={selectOptions}
          onChange={(value) => onAutoSave(question.id, value, existing)}
        />
      ) : inputType === "number" ? (
        <AutoSaveNumberInput
          defaultValue={existing}
          placeholder={def?.placeholder}
          unit={unit}
          onSave={(value) => onAutoSave(question.id, value, existing)}
        />
      ) : (
        <AutoSaveTextInput
          defaultValue={existing}
          placeholder={def?.placeholder}
          onSave={(value) => onAutoSave(question.id, value, existing)}
        />
      )}
    </div>
  );
}

function AutoSaveNumberInput({
  defaultValue,
  placeholder,
  unit,
  onSave,
}: {
  defaultValue: string;
  placeholder?: string;
  unit?: string;
  onSave: (value: string) => void;
}) {
  const [value, setValue] = useState(defaultValue);
  const savedRef = useRef(defaultValue);
  const debounced = useDebounce(value, 600);

  useEffect(() => {
    savedRef.current = defaultValue;
    setValue(defaultValue);
  }, [defaultValue]);

  useEffect(() => {
    if (!debounced.trim()) return;
    if (!hasMeaningfulChange(savedRef.current, debounced)) {
      autosaveDevLog("autosave", "skipped — no value change");
      return;
    }
    onSave(debounced);
    savedRef.current = debounced;
  }, [debounced, onSave]);

  return (
    <div className="flex items-center gap-2">
      <Input
        type="number"
        min={0}
        step="any"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        className="h-8 max-w-[160px] text-sm"
      />
      {unit && <span className="text-xs text-muted-foreground">{unit}</span>}
    </div>
  );
}

function AutoSaveTextInput({
  defaultValue,
  placeholder,
  onSave,
}: {
  defaultValue: string;
  placeholder?: string;
  onSave: (value: string) => void;
}) {
  const [value, setValue] = useState(defaultValue);
  const savedRef = useRef(defaultValue);
  const debounced = useDebounce(value, 600);

  useEffect(() => {
    savedRef.current = defaultValue;
    setValue(defaultValue);
  }, [defaultValue]);

  useEffect(() => {
    if (!debounced.trim()) return;
    if (!hasMeaningfulChange(savedRef.current, debounced)) {
      autosaveDevLog("autosave", "skipped — no value change");
      return;
    }
    onSave(debounced);
    savedRef.current = debounced;
  }, [debounced, onSave]);

  return (
    <Input
      type="text"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      placeholder={placeholder}
      className="h-8 text-sm"
    />
  );
}

function AnswerChips({
  defaultValue,
  options,
  onChange,
}: {
  defaultValue: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  const [value, setValue] = useState(defaultValue || "");

  function select(optValue: string) {
    setValue(optValue);
    onChange(optValue);
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => select(opt.value)}
          className={cn(
            "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
            value === opt.value
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border hover:bg-muted"
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
