import {
  getOrganisationPricingSettings,
  listLabourRates,
  listMaterialRates,
  listPackageRates,
  listScopeRates,
  listSubcontractorRates,
} from "@/lib/rates-data";
import type {
  LabourRate,
  MaterialRate,
  PackageRate,
  ScopeRate,
  SubcontractorRate,
} from "@/types/database";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type Supabase = SupabaseClient<Database>;

export type OrganisationPricingSettings = {
  default_margin_percent: number | null;
  contingency_percent: number | null;
};

export type PricingContext = {
  organisationId: string;
  version: number;
  loadedAt: string;
  pricingSettings: OrganisationPricingSettings | null;
  scopeRates: ScopeRate[];
  packageRates: PackageRate[];
  labourRates: LabourRate[];
  materialRates: MaterialRate[];
  subcontractorRates: SubcontractorRate[];
};

type CacheEntry = {
  context: PricingContext;
  expiresAt: number;
};

const CACHE_TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, CacheEntry>();
const versions = new Map<string, number>();

export function invalidatePricingContext(organisationId: string): void {
  cache.delete(organisationId);
  versions.set(organisationId, (versions.get(organisationId) ?? 0) + 1);
}

export function getPricingContextVersion(organisationId: string): number {
  return versions.get(organisationId) ?? 0;
}

export async function loadPricingContext(
  supabase: Supabase,
  organisationId: string,
  options?: { forceRefresh?: boolean }
): Promise<PricingContext> {
  const forceRefresh = options?.forceRefresh ?? false;
  const cached = cache.get(organisationId);
  const now = Date.now();

  if (!forceRefresh && cached && cached.expiresAt > now) {
    return cached.context;
  }

  const [
    { data: scopeRates },
    { data: packageRates },
    { data: labourRates },
    { data: materialRates },
    { data: subcontractorRates },
    { data: pricingSettings },
  ] = await Promise.all([
    listScopeRates(supabase, organisationId),
    listPackageRates(supabase, organisationId),
    listLabourRates(supabase, organisationId),
    listMaterialRates(supabase, organisationId),
    listSubcontractorRates(supabase, organisationId),
    getOrganisationPricingSettings(supabase, organisationId),
  ]);

  const version = versions.get(organisationId) ?? 0;
  const context: PricingContext = {
    organisationId,
    version,
    loadedAt: new Date().toISOString(),
    pricingSettings: pricingSettings ?? null,
    scopeRates: scopeRates ?? [],
    packageRates: packageRates ?? [],
    labourRates: labourRates ?? [],
    materialRates: materialRates ?? [],
    subcontractorRates: subcontractorRates ?? [],
  };

  cache.set(organisationId, {
    context,
    expiresAt: now + CACHE_TTL_MS,
  });

  return context;
}
