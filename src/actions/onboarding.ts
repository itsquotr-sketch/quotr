"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  onboardingSchema,
  type OnboardingActionState,
} from "@/lib/validations/onboarding";

export async function completeOnboarding(
  _prevState: OnboardingActionState,
  formData: FormData
): Promise<OnboardingActionState> {
  const raw = {
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    phone: formData.get("phone"),
    jobTitle: formData.get("jobTitle"),
    tradingName: formData.get("tradingName"),
    legalName: formData.get("legalName") || undefined,
    businessType: formData.get("businessType"),
    primaryTrade: formData.get("primaryTrade"),
    companySize: formData.get("companySize"),
    quotingVolume: formData.get("quotingVolume"),
    companyPhone: formData.get("companyPhone"),
    companyEmail: formData.get("companyEmail"),
    website: formData.get("website") || undefined,
    city: formData.get("city"),
    region: formData.get("region"),
  };

  const parsed = onboardingSchema.safeParse(raw);
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be signed in to continue." };
  }

  const { data: existingProfile } = await supabase
    .from("profiles")
    .select("organisation_id")
    .eq("id", user.id)
    .single();

  if (existingProfile?.organisation_id) {
    redirect("/dashboard");
  }

  const fullName =
    `${parsed.data.firstName.trim()} ${parsed.data.lastName.trim()}`.trim();

  const { error: profileError } = await supabase
    .from("profiles")
    .update({
      first_name: parsed.data.firstName.trim(),
      last_name: parsed.data.lastName.trim(),
      phone: parsed.data.phone.trim(),
      job_title: parsed.data.jobTitle.trim(),
      full_name: fullName,
    })
    .eq("id", user.id);

  if (profileError) {
    return { error: profileError.message };
  }

  const { error: rpcError } = await supabase.rpc(
    "create_organisation_for_user",
    {
      org_name: parsed.data.tradingName.trim(),
      org_trading_name: parsed.data.tradingName.trim(),
      org_legal_name: parsed.data.legalName?.trim() || null,
      org_business_type: parsed.data.businessType,
      org_primary_trade: parsed.data.primaryTrade.trim(),
      org_company_size: parsed.data.companySize,
      org_quoting_volume: parsed.data.quotingVolume,
      org_phone: parsed.data.companyPhone.trim(),
      org_email: parsed.data.companyEmail.trim(),
      org_website: parsed.data.website?.trim() || null,
      org_city: parsed.data.city.trim(),
      org_region: parsed.data.region.trim(),
    }
  );

  if (rpcError) {
    return { error: rpcError.message };
  }

  revalidatePath("/dashboard");
  revalidatePath("/settings");
  redirect("/dashboard");
}
