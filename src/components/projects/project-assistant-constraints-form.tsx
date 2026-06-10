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
    <form action={formAction} className="space-y-4">
      {Array.from(selected).map((slug) => (
        <input key={slug} type="hidden" name="constraintSlugs" value={slug} />
      ))}
      <input type="hidden" name="qualityLevel" value={finishLevel} />

      <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
        <div>
          <Label htmlFor="qualityLevel" className="text-sm font-medium">
            Finish level
          </Label>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Affects material and labour allowances in your estimate.
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

        <div className="flex flex-wrap gap-1.5">
          {QUALITY_LEVEL_OPTIONS.map((option) => {
            const isSelected = finishLevel === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setFinishLevel(option.value)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                  isSelected
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background hover:bg-muted"
                )}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>

      {constraints.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Site conditions — only shown when not already answered above.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {constraints.map((constraint) => {
              const isSelected = selected.has(constraint.slug);
              return (
                <div key={constraint.slug} className="space-y-1.5">
                  <button
                    type="button"
                    onClick={() => toggle(constraint.slug)}
                    className={cn(
                      "w-full rounded-lg border p-2.5 text-left text-sm transition-colors",
                      isSelected
                        ? "border-primary bg-primary/5 ring-1 ring-primary"
                        : "hover:bg-accent/50"
                    )}
                  >
                    <p className="font-medium leading-snug">{constraint.label}</p>
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
        </div>
      )}

      {state.message && (
        <p className="text-xs text-primary">{state.message}</p>
      )}
      {state.error && (
        <p className="text-xs text-destructive">{state.error}</p>
      )}

      <Button type="submit" disabled={pending} size="sm" className="w-full sm:w-auto">
        {pending ? "Saving…" : "Save finish & site conditions"}
      </Button>
    </form>
  );
}
