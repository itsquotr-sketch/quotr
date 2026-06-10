"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOrganisation } from "@/lib/auth";
import { QUICK_ESTIMATE_QUESTIONS } from "@/lib/constants/quick-estimate";
import { calculateQuickEstimate } from "@/lib/quick-estimate-calculate";
import {
  getQuickEstimateById,
  getQuickEstimateForProject,
  listProjectEstimateDrivers,
  listQuickEstimateAnswers,
} from "@/lib/quick-estimate-data";
import { getProjectById } from "@/lib/projects-data";
import { createClient } from "@/lib/supabase/server";
import {
  logSupabaseError,
  userFacingSupabaseError,
} from "@/lib/supabase/log-error";
import {
  quickEstimateAnswersSchema,
  quickEstimateDriversSchema,
  quickEstimateIdSchema,
  quickEstimateNotesSchema,
  type QuickEstimateActionState,
} from "@/lib/validations/quick-estimate";

async function ensureProjectAccess(projectId: string) {
  const { user, organisationId } = await requireOrganisation();
  const supabase = await createClient();

  const { data: project, error } = await getProjectById(
    supabase,
    projectId,
    organisationId
  );

  if (error || !project) {
    return { error: "Project not found." as const };
  }

  return { user, organisationId, supabase, project };
}

async function getOrCreateQuickEstimate(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organisationId: string,
  projectId: string,
  userId: string
) {
  const { data: existing } = await getQuickEstimateForProject(
    supabase,
    organisationId,
    projectId
  );

  if (existing) {
    return { data: existing, error: null };
  }

  return supabase
    .from("quick_estimates")
    .insert({
      organisation_id: organisationId,
      project_id: projectId,
      created_by: userId,
      status: "draft",
    })
    .select("*")
    .single();
}

export async function ensureQuickEstimate(
  projectId: string
): Promise<QuickEstimateActionState & { quickEstimateId?: string }> {
  const ctx = await ensureProjectAccess(projectId);
  if ("error" in ctx && ctx.error) {
    return { error: ctx.error };
  }

  const { user, organisationId, supabase } = ctx;
  const { data, error } = await getOrCreateQuickEstimate(
    supabase,
    organisationId,
    projectId,
    user.id
  );

  if (error || !data) {
    logSupabaseError("ensureQuickEstimate", error);
    return {
      error: userFacingSupabaseError(
        error,
        "Could not start quick estimate."
      ),
    };
  }

  return { success: true, quickEstimateId: data.id };
}

export async function saveQuickEstimateNotes(
  projectId: string,
  _prevState: QuickEstimateActionState,
  formData: FormData
): Promise<QuickEstimateActionState> {
  const ctx = await ensureProjectAccess(projectId);
  if ("error" in ctx && ctx.error) {
    return { error: ctx.error };
  }

  const { user, organisationId, supabase } = ctx;

  const raw = {
    sourceNotes: formData.get("sourceNotes"),
    clientBudget: formData.get("clientBudget")?.toString() ?? undefined,
  };

  const parsed = quickEstimateNotesSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      fieldErrors: parsed.error.flatten().fieldErrors as Record<
        string,
        string[]
      >,
    };
  }

  const { data: quickEstimate, error: createError } =
    await getOrCreateQuickEstimate(
      supabase,
      organisationId,
      projectId,
      user.id
    );

  if (createError || !quickEstimate) {
    logSupabaseError("saveQuickEstimateNotes.create", createError);
    return { error: "Could not save quick estimate." };
  }

  const { error: updateError } = await supabase
    .from("quick_estimates")
    .update({
      source_notes: parsed.data.sourceNotes.trim(),
      client_budget: parsed.data.clientBudget ?? null,
      status: quickEstimate.status === "draft" ? "in_progress" : quickEstimate.status,
    })
    .eq("id", quickEstimate.id)
    .eq("organisation_id", organisationId);

  if (updateError) {
    logSupabaseError("saveQuickEstimateNotes.update", updateError);
    return { error: "Could not save job notes." };
  }

  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}/quick-estimate`);
  return {
    success: true,
    message: "Job notes saved.",
    quickEstimateId: quickEstimate.id,
    redirectStep: 2,
  };
}

export async function saveQuickEstimateAnswers(
  projectId: string,
  quickEstimateId: string,
  _prevState: QuickEstimateActionState,
  formData: FormData
): Promise<QuickEstimateActionState> {
  const ctx = await ensureProjectAccess(projectId);
  if ("error" in ctx && ctx.error) {
    return { error: ctx.error };
  }

  const parsedId = quickEstimateIdSchema.safeParse(quickEstimateId);
  if (!parsedId.success) {
    return { error: "Invalid quick estimate." };
  }

  const { organisationId, supabase } = ctx;

  const { data: quickEstimate, error: lookupError } =
    await getQuickEstimateById(
      supabase,
      organisationId,
      projectId,
      parsedId.data
    );

  if (lookupError || !quickEstimate) {
    return { error: "Quick estimate not found." };
  }

  const raw = Object.fromEntries(
    QUICK_ESTIMATE_QUESTIONS.map((q) => [
      q.key,
      formData.get(q.key)?.toString() ?? "",
    ])
  );

  const parsed = quickEstimateAnswersSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      fieldErrors: parsed.error.flatten().fieldErrors as Record<
        string,
        string[]
      >,
    };
  }

  for (const question of QUICK_ESTIMATE_QUESTIONS) {
    const value = parsed.data[question.key as keyof typeof parsed.data];
    if (!value?.trim()) continue;

    const answerPayload =
      question.type === "textarea" || question.type === "text"
        ? { value: value.trim() }
        : { value: value.trim() };

    const { error: upsertError } = await supabase
      .from("quick_estimate_answers")
      .upsert(
        {
          organisation_id: organisationId,
          quick_estimate_id: parsedId.data,
          project_id: projectId,
          question_key: question.key,
          question_text: question.text,
          answer: answerPayload,
        },
        { onConflict: "quick_estimate_id,question_key" }
      );

    if (upsertError) {
      logSupabaseError("saveQuickEstimateAnswers.upsert", upsertError);
      return { error: "Could not save answers." };
    }
  }

  await supabase
    .from("quick_estimates")
    .update({ status: "in_progress" })
    .eq("id", parsedId.data)
    .eq("organisation_id", organisationId);

  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}/quick-estimate`);
  return {
    success: true,
    message: "Answers saved.",
    redirectStep: 3,
  };
}

export async function saveQuickEstimateDrivers(
  projectId: string,
  quickEstimateId: string,
  _prevState: QuickEstimateActionState,
  formData: FormData
): Promise<QuickEstimateActionState> {
  const ctx = await ensureProjectAccess(projectId);
  if ("error" in ctx && ctx.error) {
    return { error: ctx.error };
  }

  const parsedId = quickEstimateIdSchema.safeParse(quickEstimateId);
  if (!parsedId.success) {
    return { error: "Invalid quick estimate." };
  }

  const { user, organisationId, supabase } = ctx;

  const driverIds = formData.getAll("driverIds").map(String);
  const parsed = quickEstimateDriversSchema.safeParse({ driverIds });
  if (!parsed.success) {
    return {
      fieldErrors: parsed.error.flatten().fieldErrors as Record<
        string,
        string[]
      >,
    };
  }

  const { data: quickEstimate, error: lookupError } =
    await getQuickEstimateById(
      supabase,
      organisationId,
      projectId,
      parsedId.data
    );

  if (lookupError || !quickEstimate) {
    return { error: "Quick estimate not found." };
  }

  const { error: deleteError } = await supabase
    .from("project_estimate_drivers")
    .delete()
    .eq("quick_estimate_id", parsedId.data)
    .eq("organisation_id", organisationId);

  if (deleteError) {
    logSupabaseError("saveQuickEstimateDrivers.delete", deleteError);
    return { error: "Could not update drivers." };
  }

  if (parsed.data.driverIds.length > 0) {
    const rows = parsed.data.driverIds.map((driverId) => ({
      organisation_id: organisationId,
      project_id: projectId,
      quick_estimate_id: parsedId.data,
      estimate_driver_id: driverId,
      created_by: user.id,
    }));

    const { error: insertError } = await supabase
      .from("project_estimate_drivers")
      .insert(rows);

    if (insertError) {
      logSupabaseError("saveQuickEstimateDrivers.insert", insertError);
      return { error: "Could not save selected drivers." };
    }
  }

  await supabase
    .from("quick_estimates")
    .update({ status: "in_progress" })
    .eq("id", parsedId.data)
    .eq("organisation_id", organisationId);

  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}/quick-estimate`);
  return {
    success: true,
    message: "Drivers saved.",
    redirectStep: 4,
  };
}

export async function finalizeQuickEstimate(
  projectId: string,
  quickEstimateId: string
): Promise<QuickEstimateActionState> {
  const ctx = await ensureProjectAccess(projectId);
  if ("error" in ctx && ctx.error) {
    return { error: ctx.error };
  }

  const parsedId = quickEstimateIdSchema.safeParse(quickEstimateId);
  if (!parsedId.success) {
    return { error: "Invalid quick estimate." };
  }

  const { organisationId, supabase } = ctx;

  const { data: quickEstimate, error: lookupError } =
    await getQuickEstimateById(
      supabase,
      organisationId,
      projectId,
      parsedId.data
    );

  if (lookupError || !quickEstimate) {
    return { error: "Quick estimate not found." };
  }

  const { data: answers } = await listQuickEstimateAnswers(
    supabase,
    organisationId,
    parsedId.data
  );

  const { data: projectDrivers } = await listProjectEstimateDrivers(
    supabase,
    organisationId,
    parsedId.data
  );

  const drivers =
    projectDrivers?.map((pd) => pd.estimate_drivers).filter(Boolean) ?? [];

  const result = calculateQuickEstimate({
    workType: null,
    answers: answers ?? [],
    drivers: drivers.map((d) => ({
      multiplier: d!.multiplier,
      fixed_allowance: d!.fixed_allowance,
      labour_modifier_percent: d!.labour_modifier_percent,
    })),
    clientBudget: quickEstimate.client_budget
      ? Number(quickEstimate.client_budget)
      : null,
    targetMarginPercent: quickEstimate.target_margin_percent
      ? Number(quickEstimate.target_margin_percent)
      : undefined,
  });

  const updatePayload = result.canCalculate
    ? {
        status: "ready" as const,
        estimated_cost_low: result.estimatedCostLow,
        estimated_cost_high: result.estimatedCostHigh,
        recommended_sell_low: result.recommendedSellLow,
        recommended_sell_high: result.recommendedSellHigh,
        target_margin_percent: result.targetMarginPercent,
        expected_margin_percent: result.expectedMarginPercent,
        confidence_level: result.confidenceLevel,
        budget_fit: result.budgetFit,
        notes: "Draft quick estimate — placeholder calculation only.",
      }
    : {
        status: "in_progress" as const,
        notes: result.reason ?? null,
      };

  const { error: updateError } = await supabase
    .from("quick_estimates")
    .update(updatePayload)
    .eq("id", parsedId.data)
    .eq("organisation_id", organisationId);

  if (updateError) {
    logSupabaseError("finalizeQuickEstimate", updateError);
    return { error: "Could not save quick estimate." };
  }

  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}/quick-estimate`);
  redirect(`/projects/${projectId}`);
}
