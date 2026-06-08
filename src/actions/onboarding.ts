"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { onboardingSchema } from "@/lib/validations/onboarding";

export type OnboardingActionState = {
  error?: string;
  fieldErrors?: Record<string, string[]>;
};

export async function createOrganisation(
  _prevState: OnboardingActionState,
  formData: FormData
): Promise<OnboardingActionState> {
  const raw = {
    organisationName: formData.get("organisationName"),
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

  const { error: rpcError } = await supabase.rpc(
    "create_organisation_for_user",
    { org_name: parsed.data.organisationName }
  );

  if (rpcError) {
    return { error: rpcError.message };
  }

  redirect("/dashboard");
}
