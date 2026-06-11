# Discovery Module Consolidation Plan

Sprint 6A audit — do not delete active files until migration is complete.

## Current architecture

Two layers coexist:

| Layer | Path | Role |
|-------|------|------|
| Core / rule engine | `src/lib/discovery/` | Canonical domain types, keyword extractors, sync rule provider |
| AI orchestration | `src/lib/ai/discovery/` | Async provider, OpenAI, DB persistence, wraps core rules as fallback |

**Production path:** `project-assistant.ts` → `runProjectDiscovery` (`@/lib/ai/discovery`) → OpenAI or rule-based AI provider → core `ruleBasedDiscoveryProvider`.

## Active files

### `src/lib/discovery/` (keep)

| File | Status | Used by |
|------|--------|---------|
| `types.ts` | **Active — canonical** | 19+ consumers via `@/lib/discovery` barrel |
| `index.ts` | **Active** | Barrel + `buildDiscoveryQuestionsAndTrades` |
| `rule-based-provider.ts` | **Active** | AI layer rule fallback |
| `fact-rules.ts` | **Active (internal)** | `rule-based-provider.ts` |
| `constraint-rules.ts` | **Active** | `scope-templates/discovery.ts` |
| `quality-level-rules.ts` | **Active** | AI rule-based provider |
| `provider.ts` | **Active (interface)** | Legacy sync contract |

### `src/lib/ai/discovery/` (keep)

| File | Status |
|------|--------|
| `index.ts` | **Active** — public API |
| `run-discovery.ts` | **Active** — orchestrator |
| `discover-project.ts` | **Active** |
| `types.ts` | **Active** — re-exports core types |
| `discovery-provider.ts` | **Active** |
| `rule-based-discovery-provider.ts` | **Active** |
| `providers/openai-discovery-provider.ts` | **Active** |
| `apply-discovery-results.ts` | **Active** |
| `build-discovery-context.ts` | **Active** |
| `prompts.ts` | **Active** |
| `parse-discovery-output.ts` | **Active** |
| `logging.ts` | **Active (internal)** |

## Legacy / dead (safe to remove later)

| File / export | Evidence |
|---------------|----------|
| `lib/discovery/openai-provider.ts` | Stub, zero imports — superseded by `ai/discovery/providers/openai-discovery-provider.ts` |
| `getDiscoveryProvider()` / `getDefaultDiscoveryProvider()` | Exported from `index.ts`, never called |
| `lib/discovery/index.ts` OpenAI branch | Throws — superseded |

## Duplicated types

| Type | Locations | Action |
|------|-----------|--------|
| `DiscoveryRisk` | `lib/discovery/types.ts`, `lib/ai/discovery/types.ts` | Consolidate to core `types.ts`; AI layer imports |
| `DiscoveryProvider` vs `IDiscoveryProvider` | Sync vs async contracts | Rename AI async interface; deprecate sync export |
| `DetectedQualityLevel` vs `DiscoveryQualityLevel` | AI rules vs core | Alias or map in one place |
| `RuleBasedDiscoveryProvider` (class name) | Both layers | Rename AI wrapper to `AiRuleBasedDiscoveryProvider` |

## Transitional / dual-write

| Artifact | Notes |
|----------|-------|
| `discovery-data.ts` | Reads `discovery_runs` and `project_discovery_runs` |
| `run-discovery.ts` | Writes both tables |
| Cost engine + UI | Consume `DiscoveryResult` from core types regardless of source table |

## Target structure (future — not Sprint 6A)

```
src/lib/discovery/
  types.ts                    # single source of truth
  providers/
    openai.ts                 # move from ai/discovery/providers/
    rule-based.ts             # merge sync + async wrappers
  run-discovery.ts            # single entry (async)
  apply-results.ts
  build-confidence.ts
  prompts/
    v2.ts
```

Migration steps (future sprint):

1. Move OpenAI provider under `discovery/providers/openai.ts`.
2. Collapse `lib/ai/discovery/` into `lib/discovery/`; keep `@/lib/ai/discovery` as re-export shim for one release.
3. Remove `openai-provider.ts` stub and unused `getDiscoveryProvider`.
4. Unify `DiscoveryRisk` and quality level types.
5. Single DB table for discovery runs (`discovery_runs`); migrate reads off `project_discovery_runs`.
6. Add streaming discovery plan (see Performance section below).

## Streaming discovery (future plan)

Not implemented in Sprint 6A. Recommended approach:

1. Server action returns stream ID; client subscribes via SSE or React `use()` + partial hydration.
2. Phased output: work areas → facts → questions → confidence hints.
3. Estimate recalc debounced on partial facts (already debounced on answer save).
4. Keep rule-based fallback synchronous for offline / no-API scenarios.

## Sprint 6A constraints (honoured)

- Did not break working AI discovery.
- Did not delete active files.
- Document only; consolidation deferred to future sprint.
