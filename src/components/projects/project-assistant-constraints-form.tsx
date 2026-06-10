"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { saveAssistantConstraints } from "@/actions/project-assistant";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  QUALITY_LEVEL_OPTIONS,
  normaliseQualityLevel,
  type QualityLevel,
} from "@/lib/constants/quality-level";
import type { AssistantConstraint } from "@/lib/project-assistant-constraints";
import type { ProjectAssistantActionState } from "@/actions/project-assistant";
import { cn } from "@/lib/utils";

interface ProjectAssistantConstraintsFormProps {
  projectId: string;
  quickEstimateId: string;
  constraints: AssistantConstraint[];
  selectedSlugs: string[];
  followUpValues: Record<string, string | number | undefined>;
  qualityLevel: string;
  detectedQualityLevel?: QualityLevel | null;
  detectedQualityReason?: string | null;
  onStepComplete: (step: number) => void;
}

export function ProjectAssistantConstraintsForm({
  projectId,
  quickEstimateId,
  constraints,
  selectedSlugs,
  followUpValues,
  qualityLevel,
  detectedQualityLevel,
  detectedQualityReason,
  onStepComplete,
}: ProjectAssistantConstraintsFormProps) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(
    new Set(selectedSlugs)
  );
  const [followUps, setFollowUps] = useState<Record<string, string>>(
    Object.fromEntries(
      Object.entries(followUpValues).map(([k, v]) => [k, v?.toString() ?? ""])
    )
  );
  const [finishLevel, setFinishLevel] = useState<QualityLevel>(
    normaliseQualityLevel(qualityLevel)
  );

  useEffect(() => {
    setSelected(new Set(selectedSlugs));
    setFollowUps(
      Object.fromEntries(
        Object.entries(followUpValues).map(([k, v]) => [k, v?.toString() ?? ""])
      )
    );
    setFinishLevel(normaliseQualityLevel(qualityLevel));
  }, [selectedSlugs, followUpValues, qualityLevel]);

  const boundAction = saveAssistantConstraints.bind(
    null,
    projectId,
    quickEstimateId
  );
  const [state, formAction, pending] = useActionState(
    boundAction,
    {} as ProjectAssistantActionState
  );

  useEffect(() => {
    if (state.success) {
      router.refresh();
    }
  }, [state.success, router]);

  function toggle(slug: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  }

  return (
    <form action={formAction} className="space-y-8">
      {Array.from(selected).map((slug) => (
        <input key={slug} type="hidden" name="constraintSlugs" value={slug} />
      ))}
      <input type="hidden" name="qualityLevel" value={finishLevel} />

      <div className="space-y-3 rounded-xl border bg-muted/20 p-4">
        <div>
          <Label htmlFor="qualityLevel" className="text-base font-medium">
            Client budget / finish level
          </Label>
          <p className="mt-1 text-sm text-muted-foreground">
            This helps Quotr adjust the estimate range. You can change it later.
          </p>
        </div>

        {detectedQualityLevel &&
          detectedQualityLevel !== "unknown" &&
          finishLevel === "unknown" && (
            <p className="text-sm text-muted-foreground">
              Detected from notes:{" "}
              <span className="font-medium text-foreground">
                {
                  QUALITY_LEVEL_OPTIONS.find(
                    (option) => option.value === detectedQualityLevel
                  )?.label
                }
              </span>
              {detectedQualityReason ? ` — ${detectedQualityReason}` : ""}
            </p>
          )}

        <div className="grid gap-2 sm:grid-cols-2">
          {QUALITY_LEVEL_OPTIONS.map((option) => {
            const isSelected = finishLevel === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setFinishLevel(option.value)}
                className={cn(
                  "rounded-xl border p-4 text-left transition-colors",
                  isSelected
                    ? "border-primary bg-primary/5 ring-1 ring-primary"
                    : "hover:bg-accent/50"
                )}
              >
                <p className="font-medium">{option.label}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {option.description}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <h4 className="text-base font-medium">Site and programme constraints</h4>
          <p className="mt-1 text-sm text-muted-foreground">
            Select anything that may make this job harder or more expensive.
          </p>
        </div>

        {constraints.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Confirm work areas first to see relevant constraints.
          </p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {constraints.map((constraint) => {
              const isSelected = selected.has(constraint.slug);
              return (
                <div key={constraint.slug} className="space-y-2">
                  <button
                    type="button"
                    onClick={() => toggle(constraint.slug)}
                    className={cn(
                      "w-full rounded-xl border p-4 text-left transition-colors",
                      isSelected
                        ? "border-primary bg-primary/5 ring-1 ring-primary"
                        : "hover:bg-accent/50"
                    )}
                  >
                    <p className="font-medium">{constraint.label}</p>
                  </button>

                  {isSelected && constraint.followUp && (
                    <div className="px-1">
                      <Label htmlFor={`followUp_${constraint.slug}`}>
                        {constraint.followUp.label}
                      </Label>
                      <div className="mt-1 flex items-center gap-2">
                        {constraint.followUp.inputType === "select" ? (
                          <select
                            id={`followUp_${constraint.slug}`}
                            name={`followUp_${constraint.slug}`}
                            value={followUps[constraint.slug] ?? "typical"}
                            onChange={(e) =>
                              setFollowUps((prev) => ({
                                ...prev,
                                [constraint.slug]: e.target.value,
                              }))
                            }
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base"
                          >
                            {(constraint.followUp.options ?? []).map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        ) : constraint.followUp.inputType === "text" ? (
                          <Textarea
                            id={`followUp_${constraint.slug}`}
                            name={`followUp_${constraint.slug}`}
                            value={followUps[constraint.slug] ?? ""}
                            onChange={(e) =>
                              setFollowUps((prev) => ({
                                ...prev,
                                [constraint.slug]: e.target.value,
                              }))
                            }
                            rows={2}
                            className="text-base"
                          />
                        ) : (
                          <>
                            <Input
                              id={`followUp_${constraint.slug}`}
                              name={`followUp_${constraint.slug}`}
                              type="number"
                              min={0}
                              step="any"
                              value={followUps[constraint.slug] ?? ""}
                              onChange={(e) =>
                                setFollowUps((prev) => ({
                                  ...prev,
                                  [constraint.slug]: e.target.value,
                                }))
                              }
                              className="text-base"
                            />
                            {constraint.followUp.unit && (
                              <span className="shrink-0 text-sm text-muted-foreground">
                                {constraint.followUp.unit}
                              </span>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {state.message && (
        <p className="text-sm text-primary">{state.message}</p>
      )}
      {state.error && (
        <p className="text-sm text-destructive">{state.error}</p>
      )}

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button type="submit" disabled={pending} className="w-full sm:w-auto">
          {pending ? "Saving…" : "Save budget, finish and constraints"}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          className="w-full sm:w-auto"
          onClick={() => onStepComplete(5)}
        >
          View draft quick estimate
        </Button>
      </div>
    </form>
  );
}
