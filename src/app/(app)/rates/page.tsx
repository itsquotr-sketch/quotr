import { RatesManager } from "@/components/rates/rates-manager";
import { PageHeader } from "@/components/shared/page-header";
import { requireOrganisation } from "@/lib/auth";
import {
  ensureOrganisationPricingSettings,
  listLabourRates,
  listMaterialRates,
  listPackageRates,
  listSubcontractorRates,
} from "@/lib/rates-data";
import { createClient } from "@/lib/supabase/server";

export default async function RatesPage() {
  const { organisationId } = await requireOrganisation();
  const supabase = await createClient();

  const [
    { data: labourRates },
    { data: subcontractorRates },
    { data: materialRates },
    { data: packageRates },
    { data: pricingSettings },
  ] = await Promise.all([
    listLabourRates(supabase, organisationId),
    listSubcontractorRates(supabase, organisationId),
    listMaterialRates(supabase, organisationId),
    listPackageRates(supabase, organisationId),
    ensureOrganisationPricingSettings(supabase, organisationId),
  ]);

  if (!pricingSettings) {
    return (
      <div>
        <PageHeader
          title="Rates"
          description="Define your labour, subcontractor, material, and package rates."
        />
        <p className="text-sm text-destructive">
          Could not load pricing settings. Try again shortly.
        </p>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Rates"
        description="Your pricing DNA — labour, subcontractors, materials, and packages. Organisation-specific rates power future estimates."
      />
      <RatesManager
        labourRates={labourRates ?? []}
        subcontractorRates={subcontractorRates ?? []}
        materialRates={materialRates ?? []}
        packageRates={packageRates ?? []}
        pricingSettings={pricingSettings}
      />
    </div>
  );
}
