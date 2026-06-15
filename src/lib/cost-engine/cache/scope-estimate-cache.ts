import { createHash } from "crypto";
import type { QuickEstimateConstraintInput } from "@/lib/cost-engine/quick-estimate-input";
import type { QuickEstimateWorkAreaInput } from "@/lib/cost-engine/quick-estimate-input";
import type { PricingContext } from "@/lib/cost-engine/cache/load-pricing-context";
import type { QualityLevel } from "@/lib/constants/quality-level";

export type CachedScopeContribution = {
  scopeId: string;
  inputHash: string;
  centralEstimate: number;
  areaResult: Record<string, unknown>;
  calculatedAt: string;
};

export type ScopeEstimateCache = {
  pricingContextVersion: number;
  globalHash: string;
  scopes: Record<string, CachedScopeContribution>;
};

function stableStringify(value: unknown): string {
  return JSON.stringify(value, Object.keys(value as object).sort());
}

export function buildScopeInputHash(params: {
  area: QuickEstimateWorkAreaInput;
  constraints: QuickEstimateConstraintInput[];
  qualityLevel: QualityLevel | string | null;
  pricingContextVersion: number;
  targetMarginPercent: number;
  contingencyPercent: number;
}): string {
  const relevantConstraintSlugs = params.constraints.map((c) => c.slug).sort();
  const payload = {
    scopeId: params.area.scopeId,
    answers: params.area.answers,
    workAreaTypeKey: params.area.workAreaTypeKey,
    constraints: relevantConstraintSlugs,
    qualityLevel: params.qualityLevel,
    pricingContextVersion: params.pricingContextVersion,
    targetMarginPercent: params.targetMarginPercent,
    contingencyPercent: params.contingencyPercent,
  };
  return createHash("sha256").update(stableStringify(payload)).digest("hex").slice(0, 16);
}

export function buildGlobalEstimateHash(params: {
  constraintSlugs: string[];
  qualityLevel: QualityLevel | string | null;
  pricingContextVersion: number;
  targetMarginPercent: number;
  contingencyPercent: number;
  allowanceTotal: number;
}): string {
  const payload = {
    constraints: [...params.constraintSlugs].sort(),
    qualityLevel: params.qualityLevel,
    pricingContextVersion: params.pricingContextVersion,
    targetMarginPercent: params.targetMarginPercent,
    contingencyPercent: params.contingencyPercent,
    allowanceTotal: params.allowanceTotal,
  };
  return createHash("sha256").update(stableStringify(payload)).digest("hex").slice(0, 16);
}

export function parseScopeEstimateCache(
  summary: Record<string, unknown> | null | undefined
): ScopeEstimateCache | null {
  const raw = summary?.scopeEstimateCache;
  if (!raw || typeof raw !== "object") return null;
  const cache = raw as ScopeEstimateCache;
  if (!cache.scopes || typeof cache.scopes !== "object") return null;
  return cache;
}

export function isScopeCacheValid(
  cached: CachedScopeContribution | undefined,
  inputHash: string
): boolean {
  return Boolean(cached && cached.inputHash === inputHash && cached.centralEstimate > 0);
}

export function buildScopeCacheFromResults(params: {
  pricingContext: PricingContext;
  globalHash: string;
  contributions: CachedScopeContribution[];
  previousCache?: ScopeEstimateCache | null;
}): ScopeEstimateCache {
  const scopes: Record<string, CachedScopeContribution> = {
    ...(params.previousCache?.scopes ?? {}),
  };
  for (const contribution of params.contributions) {
    scopes[contribution.scopeId] = contribution;
  }
  return {
    pricingContextVersion: params.pricingContext.version,
    globalHash: params.globalHash,
    scopes,
  };
}
