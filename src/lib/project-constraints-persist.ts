import { devLog } from "@/lib/dev-log";
import { getConstraintBySlug } from "@/lib/project-assistant-constraints";
import { logSupabaseError } from "@/lib/supabase/log-error";
import type { Json } from "@/types/database";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type Supabase = SupabaseClient<Database>;

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

  const { error: deleteValuesError } = await supabase
    .from("project_estimate_driver_values")
    .delete()
    .eq("quick_estimate_id", quickEstimateId)
    .eq("organisation_id", organisationId)
    .not("constraint_key", "is", null);

  if (deleteValuesError) {
    logSupabaseError(
      "persistProjectConstraints.deleteValues",
      deleteValuesError
    );
    return deleteValuesError.message;
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

  const { data: drivers, error: driversError } = await supabase
    .from("estimate_drivers")
    .select("id, slug")
    .eq("is_active", true);

  if (driversError) {
    logSupabaseError("persistProjectConstraints.loadDrivers", driversError);
    return driversError.message;
  }

  const driverIdBySlug = new Map(
    (drivers ?? []).map((d) => [d.slug, d.id])
  );

  const driverIdsInserted = new Set<string>();
  const insertedDrivers: { slug: string; estimate_driver_id: string }[] = [];
  const insertedValues: { slug: string; value: Json }[] = [];

  for (const slug of constraintSlugs) {
    const constraint = getConstraintBySlug(slug);
    const driverId = constraint?.driverSlug
      ? driverIdBySlug.get(constraint.driverSlug)
      : undefined;

    const followUpKey = `followUp_${slug}`;
    const followUpRaw = formData.get(followUpKey)?.toString();

    const valuePayload: Json = { selected: true };
    if (followUpRaw && constraint?.followUp) {
      if (constraint.followUp.inputType === "number") {
        const num = Number(followUpRaw);
        if (!Number.isNaN(num)) {
          (valuePayload as Record<string, Json>)[constraint.followUp.valueKey] =
            num;
        }
      } else {
        (valuePayload as Record<string, Json>)[constraint.followUp.valueKey] =
          followUpRaw;
      }
    }

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

    const { error: valueError } = await supabase
      .from("project_estimate_driver_values")
      .insert({
        organisation_id: organisationId,
        project_id: projectId,
        quick_estimate_id: quickEstimateId,
        estimate_driver_id: null,
        constraint_key: slug,
        value: valuePayload,
      });

    if (valueError) {
      logSupabaseError("persistProjectConstraints.value", valueError);
      return valueError.message;
    }

    insertedValues.push({ slug, value: valuePayload });
  }

  devLog("constraints.save.result", {
    insertedDrivers,
    insertedValues,
  });

  return null;
}
