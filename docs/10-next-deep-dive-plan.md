# Next Deep Dive Plan — Post Sprint 8B

This document outlines the recommended next development phase after Assistant V2 stabilisation (Sprint 8B). Focus remains on contractor trust, speed, and scope expansion — not broad new modules.

---

## 1. UX / UI deep dive

### Chat flow
- Refine turn ordering: work area confirmation → required facts → quality → constraints → optional facts.
- Reduce duplicate assistant bubbles after sync (merge persisted + optimistic more cleanly).
- Add inline retry for failed constraint / work area saves.
- Persist and replay work area confirmation state in message metadata for auditability.

### Mobile layout
- Sticky estimate panel behaviour on small screens (collapse to summary bar, expand on tap).
- Composer keyboard handling (safe-area, scroll-into-view on focus).
- Work area confirmation cards: stack vertically with larger tap targets.

### Estimate panel simplification
- Default view: range + confidence tier + includes/excludes only.
- Move quality checklist and missing info behind “Why this range?” collapsible.
- Show breakdown only when estimate quality ≥ FAIR.

### Contractor usability
- Plain-language change reasons (“+ tight access allowance” not internal slugs).
- Export scope summary as PDF in addition to clipboard.
- Quick links from estimate includes to edit work area facts.

---

## 2. Data processing and speed

### Query performance
- Single `loadProjectAssistantData` query bundle with fewer round-trips.
- Index review on `assistant_messages (project_id, created_at)` and `project_estimate_driver_values (quick_estimate_id)`.

### Message persistence
- Batch insert assistant messages after multi-step flows.
- Store `question_batch` answered state in metadata to avoid re-deriving from driver values.

### Optimistic updates
- Keep estimate range visible during save; show delta badge without full panel flicker.
- Roll back optimistic constraint / work area state on server error.

### Background discovery
- Run discovery analysis in background job after notes submit; stream status to chat.
- Cache latest discovery output per project with TTL invalidation on new notes.

---

## 3. Estimate accuracy

### Bathroom template review
- Validate fixture tiers, waterproofing allowances, and trade split against NZ benchmark jobs.
- Add regression fixtures for small / standard / premium bathrooms.

### Rate matching
- Improve org rate lookup by work area type + unit (m², lin.m, each).
- Surface “using fallback rates” more prominently when org rates missing.

### Cost benchmark validation
- Compare deck / retaining wall / bathroom outputs to anonymised benchmark ranges.
- Flag estimates >2× or <0.5× benchmark mid for manual review.

### Confidence / range testing
- Automated tests for completeness % → confidence tier mapping.
- Range width should narrow monotonically as required facts are answered.

---

## 4. Scope expansion

Recommended next scopes after Deck, Retaining Wall, Bathroom, Internal Alteration:

### Kitchen renovation
**Why:** High enquiry volume; overlaps bathroom trades (plumbing, electrical, cabinetry).  
**Required fields:** floor area or linear run, cabinet scope (faces only vs full), appliance changes, flooring retained/replaced, bench material tier, plumbing relocations, electrical circuit additions.

### Painting
**Why:** Common add-on and standalone job; good for testing simple quantity + surface-condition drivers.  
**Required fields:** interior vs exterior, room count or m², prep level (wash vs fill sand), coat count, ceiling included, occupied vs vacant, access (scaffold / ladder).

### Fence or flooring
**Why:** Fence = linear quantity + post footing template; flooring = area + product tier — both test different unit economics.  
**Fence fields:** total length, height, material (timber / aluminium), retaining vs free-standing, gate count, slope.  
**Flooring fields:** area, product type (laminate / engineered / tile), subfloor prep, skirting removed/reinstalled, furniture move.

---

## Suggested sprint sequence

| Sprint | Theme | Outcome |
|--------|--------|---------|
| 9A | Mobile + panel simplification | Cleaner estimate panel, better small-screen layout |
| 9B | Kitchen scope template | New work area type end-to-end |
| 9C | Rate matching + benchmarks | More trustworthy numbers |
| 10 | Painting + fence/flooring (pick one) | Third major scope live |

---

## Out of scope for this phase

- Detailed estimate line items
- RFQ sending workflow
- Client-facing quote PDF
- Full dashboard redesign
