# Assistant V2 Default Migration Plan

**Status:** Preparation (Sprint 8A)  
**Goal:** Make `/projects/[id]` render Assistant V2 as the primary project experience without deleting V1.

---

## Current State

| Route | Experience |
|-------|------------|
| `/projects/[id]` | V1 project page — `ProjectAssistantSection`, scope list, placeholder RFQ/quote sections |
| `/projects/[id]/assistant-v2` | V2 — conversation, live estimate, work areas |

V2 is functionally complete for deck, bathroom, and retaining wall quick estimates. V1 remains the default entry point from projects list and dashboard.

---

## V1 Dependencies Still Referenced

### Shared data layer (keep — used by both)

- `loadProjectAssistantData` / `build-quick-estimate-input` / `calculateQuickEstimateV1`
- `project_scopes`, `scope_questions`, `scope_answers`
- `quick_estimates`, `quick_estimate_snapshots`
- `project_estimate_driver_values` (constraints)
- `discovery_runs` / discovery engine
- Org rates tables

### V1-only UI (candidates for redirect or embed)

| Component | Location | Notes |
|-----------|----------|-------|
| `ProjectAssistantSection` | `/projects/[id]` | Full V1 wizard — brain dump, pricing panels, constraints form |
| `ProjectAssistantShell` | Legacy assistant route if any | Multi-panel flow |
| `project-assistant-*.tsx` | `components/projects/` | Questions form, constraints form, work areas |
| `assistant-flow-context.tsx` | V1 client state | Heavy `router.refresh` usage |
| `/projects/[id]/quick-estimate` | Standalone wizard | Redirect to V2 or deprecate later |

### V2-only UI (promote)

| Component | Notes |
|-----------|-------|
| `AssistantV2Shell` | Target default shell |
| `assistant-chat-context.tsx` | Optimistic chat + `syncAssistantState` |
| `assistant-v2/*` | Conversation, estimate panel, work areas |

### Actions

- `actions/project-assistant.ts` — V1 server actions (margin, constraints form, recalc)
- `actions/assistant-v2.ts` — V2 server actions (notes, batch answers, sync)

Both call the same cost engine. Consolidation optional post-migration.

---

## Blockers Before Default Switch

### P0 — Must fix (Sprint 8A addressed)

1. **Constraint confirmation** — Declined constraints must persist as `selected: false` in DB, not re-ask. ✅ Fixed in 8A.
2. **Performance** — V2 must not full-page refresh on every answer. ✅ `syncAssistantState` + tag revalidation.
3. **Trust signals** — Estimate change + breakdown visible. ✅ Live panel.

### P1 — Before production default

1. **Project metadata editing** — V2 has no inline edit for client, address, status. V1 project page has `ProjectDetailsCard`. V2 needs link to edit or embedded card.
2. **Scope management** — V2 shows work areas; add/delete scope exists but deep scope edit (`/scopes/[id]`) still V1 routes.
3. **Free-text corrections** — Composer re-runs discovery; does not parse "actually 45m²" as answer update.
4. **Template coverage** — Only deck, bathroom, retaining wall have full templates. Kitchen, fence, etc. still placeholder.
5. **Mobile estimate access** — Estimate panel duplicated compact/mobile; validate sticky composer UX.

### P2 — Nice to have

1. Unified action module (`assistant-v2.ts` only)
2. Remove duplicate data fetch on project page when V2 is default
3. `unstable_cache` + tags on `loadProjectAssistantData`

---

## Proposed Migration Steps

### Phase 1 — Soft default (low risk)

1. Change projects list + dashboard CTAs from `/projects/[id]` → `/projects/[id]/assistant-v2`
2. Add banner on V1 project page: "Open Assistant" → V2
3. Keep `/projects/[id]` unchanged for bookmarks

### Phase 2 — Route swap

1. Move current `projects/[id]/page.tsx` content to `projects/[id]/overview/page.tsx` (optional)
2. Replace `projects/[id]/page.tsx` with `AssistantV2Page` loader (same as assistant-v2)
3. Add redirect: `/projects/[id]/assistant-v2` → `/projects/[id]` (301/redirect)

### Phase 3 — V1 archival (do not delete code yet)

1. Feature-flag `ASSISTANT_V1_ENABLED` for rollback
2. Hide `ProjectAssistantSection` from default view
3. Keep V1 components for 1 release cycle

---

## Risks

| Risk | Mitigation |
|------|------------|
| Users bookmark `/assistant-v2` | Permanent redirect after swap |
| V1-only workflows (margin editor in wizard) | Margin stays in settings or estimate panel later |
| Regression in constraint/estimate sync | QA deck/bathroom/retaining wall + constraint batch |
| Slower first load on project page | Parallel queries in `loadProjectAssistantData` (done 8A) |
| RFQ/quote placeholders on V1 page | Already hidden in V2; do not port placeholders |

---

## Required Testing Before Default

### Functional

- [ ] Deck: notes → questions → estimate → constraint batch confirm (select + reject)
- [ ] Bathroom: area + layout questions, estimate updates
- [ ] Retaining wall: length × height, drainage add-ons
- [ ] Constraint reject does not reappear after refresh
- [ ] Constraint accept applies estimate driver
- [ ] Chat history persists across refresh
- [ ] Estimate breakdown expands/collapses
- [ ] Latest estimate change shows after answer
- [ ] Snapshots created on recalc (`quick_estimate_snapshots`)

### Performance (targets)

- [ ] Project page (V2) perceived load < 1.5s
- [ ] Question answer optimistic UI < 300ms
- [ ] Estimate panel update < 1s after batch save

### Regression

- [ ] V1 project page still loads if navigated directly (until Phase 3)
- [ ] Scope suggestions accept flow
- [ ] Reset assistant clears messages + estimate

---

## Remaining Blockers Summary

1. Project details / edit access from V2 header (P1)
2. Additional scope templates beyond big three (P1)
3. Free-text fact corrections in composer (P1)
4. Optional: merge `project-assistant` and `assistant-v2` actions (P2)

**Recommendation:** Proceed with **Phase 1** immediately after Sprint 8A QA. Schedule **Phase 2** when P1 blockers 1–2 are addressed or accepted as known limitations.
