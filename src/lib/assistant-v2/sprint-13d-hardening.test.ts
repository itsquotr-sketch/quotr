import { describe, expect, it } from "vitest";
import {
  mergeSyncRequests,
  syncKindsToLoader,
} from "@/lib/assistant-v2/assistant-sync-queue";
import {
  buildScopeInputHash,
  isScopeCacheValid,
  type CachedScopeContribution,
} from "@/lib/cost-engine/cache/scope-estimate-cache";
import { formatRateSourceDisclosure } from "@/lib/assistant-v2/fact-confirmation-status";
import { resolveEstimatePanelState } from "@/lib/cost-engine/resolve-estimate-panel-state";
import { resolveWideRangeAction } from "@/lib/assistant-v2/build-wide-range-action";
import { createSyncVersionTracker } from "@/lib/assistant-v2/sync-versioning";
import { TRUST_COPY } from "@/lib/assistant-v2/trust-messages";

describe("Sprint 13D hardening", () => {
  it("merges sync requests to include estimate when answers change", () => {
    const merged = mergeSyncRequests(
      { kinds: ["answers"] },
      { kinds: ["estimate"] }
    );
    expect(syncKindsToLoader(merged.kinds)).toContain("estimate");
    expect(syncKindsToLoader(merged.kinds)).toContain("answers");
  });

  it("reuses scope cache when input hash matches", () => {
    const hash = buildScopeInputHash({
      area: {
        scopeId: "scope-1",
        name: "Deck",
        workAreaTypeKey: "deck",
        answers: { deck_length_m: "6" },
        answeredFromNotes: [],
      },
      constraints: [],
      qualityLevel: "standard",
      pricingContextVersion: 1,
      targetMarginPercent: 5,
      contingencyPercent: 5,
    });

    const cached: CachedScopeContribution = {
      scopeId: "scope-1",
      inputHash: hash,
      centralEstimate: 12000,
      areaResult: { centralEstimate: 12000 },
      calculatedAt: new Date().toISOString(),
    };

    expect(isScopeCacheValid(cached, hash)).toBe(true);
    expect(isScopeCacheValid(cached, "other-hash")).toBe(false);
  });

  it("discloses placeholder rates honestly", () => {
    const message = formatRateSourceDisclosure([
      { rateSource: "placeholder" },
    ]);
    expect(message).toContain("placeholder");
    expect(message).toContain(TRUST_COPY.ratesPlaceholder);
  });

  it("ignores stale sync responses", () => {
    const tracker = createSyncVersionTracker();
    const v1 = tracker.beginSync();
    const v2 = tracker.beginSync();
    expect(tracker.isCurrent(v1)).toBe(false);
    expect(tracker.isCurrent(v2)).toBe(true);
  });

  it("builds actionable wide-range prompt", () => {
    const action = resolveWideRangeAction({
      isQualityUnknown: true,
      criticalMissing: [],
      actionableMissingItems: [],
      usesBenchmarkRates: false,
    });
    expect(action?.label).toMatch(/spec level|finish level/i);
  });

  it("shows actionable empty state when no estimate exists", () => {
    const state = resolveEstimatePanelState(null);
    expect(state?.kind).toBe("empty");
    expect(state?.title).toContain("Tell Quotr");
  });
});
