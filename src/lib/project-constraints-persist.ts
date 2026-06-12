import { devLog } from "@/lib/dev-log";
import { getConstraintBySlug } from "@/lib/project-assistant-constraints";
import { logSupabaseError } from "@/lib/supabase/log-error";
import type { Json } from "@/types/database";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type Supabase = SupabaseClient<Database>;

export type ConstraintAssessment = {
  slug: string;
  apply: boolean;
  followUp?: string | number;
};

async function loadActiveDriverIds(supabase: Supabase): Promise<Map<string, string>> {
  const { data: drivers, error } = await supabase
    .from("estimate_drivers")
    .select("id, slug")
    .eq("is_active", true);

  if (error) {
    logSupabaseError("loadActiveDriverIds", error);
    return new Map();
  }

  return new Map((drivers ?? []).map((d) => [d.slug, d.id]));
}

function buildConstraintMetadata(
  slug: string,
  apply: boolean,
  followUp?: string | number
): Json {
  if (!apply) {
    return { selected: false };
  }

  const constraint = getConstraintBySlug(slug);
  const valuePayload: Json = { selected: true };

  if (followUp != null && constraint?.followUp) {
    if (constraint.followUp.inputType === "number") {
      const num = Number(followUp);
      if (!Number.isNaN(num)) {
        (valuePayload as Record<string, Json>)[constraint.followUp.valueKey] =
          num;
      }
    } else {
      (valuePayload as Record<string, Json>)[constraint.followUp.valueKey] =
        String(followUp);
    }
  }

  return valuePayload;
}

async function upsertConstraintSelection(
  supabase: Supabase,
  params: {
    organisationId: string;
    projectId: string;
    quickEstimateId: string;
    userId: string;
    slug: string;
    apply: boolean;
    followUp?: string | number;
    driverIdBySlug?: Map<string, string>;
  }
): Promise<string | null> {
  const constraint = getConstraintBySlug(params.slug);
  const label = constraint?.label ?? params.slug;
  const metadata = buildConstraintMetadata(
    params.slug,
    params.apply,
    params.followUp
  );

  const { error: upsertError } = await supabase
    .from("project_constraint_selections")
    .upsert(
      {
        organisation_id: params.organisationId,
        project_id: params.projectId,
        quick_estimate_id: params.quickEstimateId,
        constraint_key: params.slug,
        label,
        selected: params.apply,
        metadata,
        created_by: params.userId,
      },
      { onConflict: "project_id,constraint_key" }
    );

  if (upsertError) {
    logSupabaseError("upsertConstraintSelection", upsertError);
    return upsertError.message;
  }

  const driverIdBySlug =
    params.driverIdBySlug ?? (await loadActiveDriverIds(supabase));
  const driverSlug = constraint?.driverSlug;
  const driverId = driverSlug ? driverIdBySlug.get(driverSlug) : undefined;

  if (params.apply && driverId) {
    const { error: driverInsertError } = await supabase
      .from("project_estimate_drivers")
      .insert({
        organisation_id: params.organisationId,
        project_id: params.projectId,
        quick_estimate_id: params.quickEstimateId,
        estimate_driver_id: driverId,
        created_by: params.userId,
      });

    if (driverInsertError && driverInsertError.code !== "23505") {
      logSupabaseError("upsertConstraintSelection.driver", driverInsertError);
      return driverInsertError.message;
    }
  }

  if (!params.apply && driverId) {
    const { error: removeDriverError } = await supabase
      .from("project_estimate_drivers")
      .delete()
      .eq("quick_estimate_id", params.quickEstimateId)
      .eq("organisation_id", params.organisationId)
      .eq("estimate_driver_id", driverId);

    if (removeDriverError) {
      logSupabaseError("upsertConstraintSelection.removeDriver", removeDriverError);
      return removeDriverError.message;
    }
  }

  return null;
}

/** @deprecated Use upsertConstraintSelection — kept for legacy callers */
export async function upsertConstraintAssessment(
  supabase: Supabase,
  params: {
    organisationId: string;
    projectId: string;
    quickEstimateId: string;
    userId: string;
    slug: string;
    apply: boolean;
    followUp?: string | number;
    driverIdBySlug?: Map<string, string>;
  }
): Promise<string | null> {
  return upsertConstraintSelection(supabase, params);
}

/** Persists a batch of constraint confirmations — selected=true, unselected=false. */
export async function persistConstraintAssessmentBatch(
  supabase: Supabase,
  params: {
    organisationId: string;
    projectId: string;
    quickEstimateId: string;
    userId: string;
    assessments: ConstraintAssessment[];
  }
): Promise<string | null> {
  if (params.assessments.length === 0) return null;

  const driverIdBySlug = await loadActiveDriverIds(supabase);

  for (const assessment of params.assessments) {
    const error = await upsertConstraintSelection(supabase, {
      ...params,
      slug: assessment.slug,
      apply: assessment.apply,
      followUp: assessment.followUp,
      driverIdBySlug,
    });
    if (error) return error;
  }

  devLog("constraints.batch.save", {
    projectId: params.projectId,
    quickEstimateId: params.quickEstimateId,
    assessments: params.assessments.map((a) => ({
      slug: a.slug,
      apply: a.apply,
    })),
  });

  return null;
}

export async function persistProjectConstraints(
  supabase: Supabase,
  params: {
    organisationId: string;
    projectId: string;
    quickEstimateId: string;
    userId: string;
    constraintSlugs: string[];
    formData: FormData;
  }
): Promise<string | null> {
  const {
    organisationId,
    projectId,
    quickEstimateId,
    userId,
    constraintSlugs,
    formData,
  } = params;

  devLog("constraints.save.payload", {
    projectId,
    quickEstimateId,
    constraintSlugs,
    followUps: Object.fromEntries(
      constraintSlugs.map((slug) => [
        slug,
        formData.get(`followUp_${slug}`)?.toString() ?? null,
      ])
    ),
  });

  const { error: deleteSelectionsError } = await supabase
    .from("project_constraint_selections")
    .delete()
    .eq("project_id", projectId)
    .eq("organisation_id", organisationId);

  if (deleteSelectionsError) {
    logSupabaseError(
      "persistProjectConstraints.deleteSelections",
      deleteSelectionsError
    );
    return deleteSelectionsError.message;
  }

  const { error: deleteDriversError } = await supabase
    .from("project_estimate_drivers")
    .delete()
    .eq("quick_estimate_id", quickEstimateId)
    .eq("organisation_id", organisationId);

  if (deleteDriversError) {
    logSupabaseError(
      "persistProjectConstraints.deleteDrivers",
      deleteDriversError
    );
    return deleteDriversError.message;
  }

  if (constraintSlugs.length === 0) {
    devLog("constraints.save.result", {
      deletedDrivers: true,
      insertedDrivers: [],
      insertedValues: [],
    });
    return null;
  }

  const driverIdBySlug = await loadActiveDriverIds(supabase);
  const driverIdsInserted = new Set<string>();
  const insertedDrivers: { slug: string; estimate_driver_id: string }[] = [];
  const insertedValues: { slug: string; value: Json }[] = [];

  for (const slug of constraintSlugs) {
    const constraint = getConstraintBySlug(slug);
    const followUpKey = `followUp_${slug}`;
    const followUpRaw = formData.get(followUpKey)?.toString();
    const metadata = buildConstraintMetadata(
      slug,
      true,
      followUpRaw ?? undefined
    );

    const driverId = constraint?.driverSlug
      ? driverIdBySlug.get(constraint.driverSlug)
      : undefined;

    if (driverId && !driverIdsInserted.has(driverId)) {
      const { error: driverInsertError } = await supabase
        .from("project_estimate_drivers")
        .insert({
          organisation_id: organisationId,
          project_id: projectId,
          quick_estimate_id: quickEstimateId,
          estimate_driver_id: driverId,
          created_by: userId,
        });

      if (driverInsertError && driverInsertError.code !== "23505") {
        logSupabaseError(
          "persistProjectConstraints.driver",
          driverInsertError
        );
        return driverInsertError.message;
      }
      driverIdsInserted.add(driverId);
      insertedDrivers.push({ slug, estimate_driver_id: driverId });
    }

    const { error: selectionError } = await supabase
      .from("project_constraint_selections")
      .upsert(
        {
          organisation_id: organisationId,
          project_id: projectId,
          quick_estimate_id: quickEstimateId,
          constraint_key: slug,
          label: constraint?.label ?? slug,
          selected: true,
          metadata,
          created_by: userId,
        },
        { onConflict: "project_id,constraint_key" }
      );

    if (selectionError) {
      logSupabaseError("persistProjectConstraints.selection", selectionError);
      return selectionError.message;
    }

    insertedValues.push({ slug, value: metadata });
  }

  devLog("constraints.save.result", {
    insertedDrivers,
    insertedValues,
  });

  return null;
}
