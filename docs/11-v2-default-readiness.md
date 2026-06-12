# Assistant V2 — Default Route Readiness

This document tracks what remains before `/projects/[id]` becomes Assistant V2 by default.

## Remaining before switch

1. **Apply migration 030** (`project_constraint_selections`) on production Supabase and verify constraint save/none-apply flows in a real project.
2. **End-to-end QA** on staging: constraint batch, margin edit, reset, multi-scope projects, premium bathroom (no double uplift).
3. **Performance spot-check**: confirm assistant actions no longer trigger full page reload; client sync via `syncAssistantState` is sufficient.
4. **Legacy parity review**: confirm any critical legacy assistant flows (e.g. constraint form on old project page) are either migrated or intentionally deprecated.
5. **Error monitoring**: watch for PGRST205 / constraint persistence errors for one release cycle after migration.

## Legacy files still in repo

| Area | Path | Notes |
|------|------|-------|
| Legacy project assistant shell | `src/components/projects/project-assistant-shell.tsx` | Old tabbed assistant UI |
| Legacy constraints form | `src/components/projects/project-assistant-constraints-form.tsx` | Form-based constraint save |
| Legacy assistant actions | `src/actions/project-assistant.ts` | Used by legacy routes |
| Driver values table | `project_estimate_driver_values` | Superseded by `project_constraint_selections` for V2; kept for backward compat |
| Quick estimate section | `src/components/projects/quick-estimate-section.tsx` | Legacy estimate panel |

## Risks

| Risk | Mitigation |
|------|------------|
| Migration 030 not applied | Clear dev error via `userFacingConstraintPersistError`; migration is idempotent |
| Dual constraint storage during transition | V2 reads/writes `project_constraint_selections`; legacy may still use driver_values |
| Client state drift after mutations | `syncAssistantState` + targeted cache tags reduce need for `router.refresh()` |
| Incomplete work area templates | Generic placeholder pricing still used for unknown scopes |

## Rollback plan

1. Revert default route change only (keep `/projects/[id]/assistant-v2` as primary URL).
2. If constraint table causes issues: V2 can fall back to reading `project_estimate_driver_values` (data migrated into new table on 030).
3. If estimate regressions: disable snapshot gating temporarily by removing `shouldInsertEstimateSnapshot` guard.
4. Full rollback: restore previous `revalidateProjectAssistant` broad invalidation and legacy project page component.

## QA checklist

- [ ] **A — None apply**: constraint prompt → "None of these apply" → no error, all false, prompt gone after refresh
- [ ] **B — Selected constraints**: selected true, unselected false, allowances in estimate
- [ ] **C — Reset**: clean state (no stale estimate, constraints, work areas)
- [ ] **D — Margin**: cost range unchanged, sell range updates, no UI freeze
- [ ] **E — Premium bathroom**: finish uplift applied once only
- [ ] **F — Multi-scope**: deck complete + bathroom incomplete → confidence not collapsed unfairly
- [ ] **G — Edit site conditions**: re-opens prompt, recalculates once
- [ ] **H — Notes submit**: analysis runs, work area suggestions appear

## Migration route (completed Sprint 9B)

```
/projects/[id]                → Assistant V2 (default)
/projects/[id]/legacy         → legacy project assistant (rollback)
/projects/[id]/assistant-v2   → redirects to /projects/[id]
```
