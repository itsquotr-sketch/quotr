"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOrganisation } from "@/lib/auth";
import { findOrCreateClient } from "@/lib/clients";
import { createClient } from "@/lib/supabase/server";
import { siteVisitSchema } from "@/lib/validations/site-visit";

export type SiteVisitActionState = {
  error?: string;
  fieldErrors?: Record<string, string[]>;
};

export async function createSiteVisit(
  _prevState: SiteVisitActionState,
  formData: FormData
): Promise<SiteVisitActionState> {
  const { user, organisationId } = await requireOrganisation();

  const measurementsRaw = formData.get("measurements");
  let measurements: { label: string; value: string; unit?: string }[] = [];

  if (typeof measurementsRaw === "string" && measurementsRaw) {
    try {
      measurements = JSON.parse(measurementsRaw);
    } catch {
      return { error: "Invalid measurements data." };
    }
  }

  const raw = {
    title: formData.get("title"),
    clientName: formData.get("clientName"),
    clientPhone: formData.get("clientPhone") || undefined,
    siteAddress: formData.get("siteAddress"),
    jobType: formData.get("jobType"),
    notes: formData.get("notes") || undefined,
    measurements,
  };

  const parsed = siteVisitSchema.safeParse(raw);
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const supabase = await createClient();

  let clientId: string | null = null;

  if (parsed.data.clientName.trim()) {
    try {
      clientId = await findOrCreateClient(
        supabase,
        organisationId,
        parsed.data.clientName,
        parsed.data.clientPhone
      );
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not save client.";
      return { error: message };
    }
  }

  const { data: siteVisit, error: visitError } = await supabase
    .from("site_visits")
    .insert({
      organisation_id: organisationId,
      created_by: user.id,
      client_id: clientId,
      title: parsed.data.title,
      client_name: parsed.data.clientName,
      client_phone: parsed.data.clientPhone ?? null,
      site_address: parsed.data.siteAddress,
      job_type: parsed.data.jobType,
      notes: parsed.data.notes ?? null,
    })
    .select("id")
    .single();

  if (visitError || !siteVisit) {
    return { error: visitError?.message ?? "Could not save site visit." };
  }

  if (parsed.data.measurements.length > 0) {
    const measurementRows = parsed.data.measurements.map((m, index) => ({
      site_visit_id: siteVisit.id,
      label: m.label,
      value: m.value,
      unit: m.unit ?? null,
      sort_order: index,
    }));

    const { error: measurementError } = await supabase
      .from("site_visit_measurements")
      .insert(measurementRows);

    if (measurementError) {
      return { error: measurementError.message };
    }
  }

  const photoFiles = formData.getAll("photos") as File[];
  const validPhotos = photoFiles.filter(
    (file) => file instanceof File && file.size > 0
  );

  for (const photo of validPhotos) {
    const ext = photo.name.split(".").pop() ?? "jpg";
    const fileName = `${crypto.randomUUID()}.${ext}`;
    const storagePath = `${organisationId}/${siteVisit.id}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from("site-photos")
      .upload(storagePath, photo, {
        contentType: photo.type,
        upsert: false,
      });

    if (uploadError) {
      return { error: `Photo upload failed: ${uploadError.message}` };
    }

    const { error: photoRecordError } = await supabase
      .from("site_visit_photos")
      .insert({
        site_visit_id: siteVisit.id,
        storage_path: storagePath,
        file_name: photo.name,
      });

    if (photoRecordError) {
      return { error: photoRecordError.message };
    }
  }

  revalidatePath("/site-visits");
  redirect(`/site-visits/${siteVisit.id}`);
}

export async function getSiteVisitPhotoUrl(storagePath: string) {
  const { organisationId } = await requireOrganisation();

  if (!storagePath.startsWith(`${organisationId}/`)) {
    return null;
  }

  const supabase = await createClient();
  const { data } = await supabase.storage
    .from("site-photos")
    .createSignedUrl(storagePath, 3600);

  return data?.signedUrl ?? null;
}
