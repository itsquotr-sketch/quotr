"use client";

import { LabourRatesTab } from "@/components/rates/labour-rates-tab";
import { MaterialRatesTab } from "@/components/rates/material-rates-tab";
import { PackageRatesTab } from "@/components/rates/package-rates-tab";
import { PricingSettingsCard } from "@/components/rates/pricing-settings-card";
import { ScopeRatesTab } from "@/components/rates/scope-rates-tab";
import { SubcontractorRatesTab } from "@/components/rates/subcontractor-rates-tab";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type {
  LabourRate,
  MaterialRate,
  OrganisationPricingSettings,
  PackageRate,
  ScopeRate,
  SubcontractorRate,
} from "@/types/database";

interface RatesManagerProps {
  scopeRates: ScopeRate[];
  labourRates: LabourRate[];
  subcontractorRates: SubcontractorRate[];
  materialRates: MaterialRate[];
  packageRates: PackageRate[];
  pricingSettings: OrganisationPricingSettings;
}

export function RatesManager({
  scopeRates,
  labourRates,
  subcontractorRates,
  materialRates,
  packageRates,
  pricingSettings,
}: RatesManagerProps) {
  return (
    <div className="space-y-8">
      <PricingSettingsCard settings={pricingSettings} />

      <Tabs defaultValue="scope" className="space-y-6">
        <TabsList variant="line" className="w-full justify-start">
          <TabsTrigger value="scope">Scope Rates</TabsTrigger>
          <TabsTrigger value="labour">Labour</TabsTrigger>
          <TabsTrigger value="subcontractors">Subcontractors</TabsTrigger>
          <TabsTrigger value="materials">Materials</TabsTrigger>
          <TabsTrigger value="packages">Packages</TabsTrigger>
        </TabsList>

        <TabsContent value="scope">
          <ScopeRatesTab rates={scopeRates} />
        </TabsContent>
        <TabsContent value="labour">
          <LabourRatesTab rates={labourRates} />
        </TabsContent>
        <TabsContent value="subcontractors">
          <SubcontractorRatesTab rates={subcontractorRates} />
        </TabsContent>
        <TabsContent value="materials">
          <MaterialRatesTab rates={materialRates} />
        </TabsContent>
        <TabsContent value="packages">
          <PackageRatesTab rates={packageRates} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
