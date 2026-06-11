"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { autoSaveAssistantConstraints } from "@/actions/project-assistant";
import { useEstimateUpdate } from "@/components/projects/estimate-update-context";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useDebounce } from "@/hooks/use-debounce";
import {
  QUALITY_LEVEL_OPTIONS,
  normaliseQualityLevel,
  type QualityLevel,
} from "@/lib/constants/quality-level";
import type { AssistantConstraint } from "@/lib/project-assistant-constraints";
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
  const { markSaving, markUpdating, markSaved } = useEstimateUpdate();
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
  const [saveError, setSaveError] = useState<string | null>(null);
  const skipAutoSaveRef = useRef(true);

  useEffect(() => {
    setSelected(new Set(selectedSlugs));
    setFollowUps(
      Object.fromEntries(
        Object.entries(followUpValues).map(([k, v]) => [k, v?.toString() ?? ""])
      )
    );
    setFinishLevel(normaliseQualityLevel(qualityLevel));
  }, [selectedSlugs, followUpValues, qualityLevel]);

  const savePayload = useDebounce(
    {
      slugs: Array.from(selected),
      finishLevel,
      followUps,
    },
    500
  );

  const persist = useCallback(async () => {
    setSaveError(null);
    markSaving();
    const result = await autoSaveAssistantConstraints(
      projectId,
      quickEstimateId,
      {
        constraintSlugs: savePayload.slugs,
        qualityLevel: savePayload.finishLevel,
        followUps: savePayload.followUps,
      }
    );
    if (result.error) {
      setSaveError(result.error);
      return;
    }
    markUpdating();
    router.refresh();
    markSaved();
  }, [
    projectId,
    quickEstimateId,
    savePayload,
    router,
    markSaving,
    markUpdating,
    markSaved,
  ]);

  const persistRef = useRef(persist);
  persistRef.current = persist;

  useEffect(() => {
    if (skipAutoSaveRef.current) {
      skipAutoSaveRef.current = false;
      return;
    }
    void persistRef.current();
  }, [savePayload]);

  function toggle(slug: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
        <div>
          <Label className="text-sm font-medium">Finish level</Label>
          <p className="text-xs text-muted-foreground">
            Saves automatically — adjusts material and labour allowances.
          </p>
        </div>

        {detectedQualityLevel &&
          detectedQualityLevel !== "unknown" &&
          finishLevel === "unknown" && (
            <p className="text-xs text-muted-foreground">
              From notes:{" "}
              {
                QUALITY_LEVEL_OPTIONS.find(
                  (o) => o.value === detectedQualityLevel
                )?.label
              }
              {detectedQualityReason ? ` — ${detectedQualityReason}` : ""}
            </p>
          )}

        <div className="flex flex-wrap gap-1.5">
          {QUALITY_LEVEL_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setFinishLevel(option.value)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                finishLevel === option.value
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border hover:bg-muted"
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {constraints.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Site conditions</p>
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
                      <Label className="text-xs">
                        {constraint.followUp.label}
                      </Label>
                      <div className="mt-1">
                        {constraint.followUp.inputType === "select" ? (
                          <select
                            value={followUps[constraint.slug] ?? "typical"}
                            onChange={(e) =>
                              setFollowUps((prev) => ({
                                ...prev,
                                [constraint.slug]: e.target.value,
                              }))
                            }
                            className="flex h-8 w-full rounded-md border bg-background px-2 text-sm"
                          >
                            {(constraint.followUp.options ?? []).map((o) => (
                              <option key={o.value} value={o.value}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                        ) : constraint.followUp.inputType === "text" ? (
                          <Textarea
                            value={followUps[constraint.slug] ?? ""}
                            onChange={(e) =>
                              setFollowUps((prev) => ({
                                ...prev,
                                [constraint.slug]: e.target.value,
                              }))
                            }
                            rows={2}
                            className="text-sm"
                          />
                        ) : (
                          <div className="flex items-center gap-2">
                            <Input
                              type="number"
                              min={0}
                              value={followUps[constraint.slug] ?? ""}
                              onChange={(e) =>
                                setFollowUps((prev) => ({
                                  ...prev,
                                  [constraint.slug]: e.target.value,
                                }))
                              }
                              className="h-8 text-sm"
                            />
                            {constraint.followUp.unit && (
                              <span className="text-xs text-muted-foreground">
                                {constraint.followUp.unit}
                              </span>
                            )}
                          </div>
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

      {saveError && (
        <p className="text-xs text-destructive">{saveError}</p>
      )}
    </div>
  );
}
