# Scope Expansion Plan

This document prepares the next work areas for Assistant V2 and quick estimate support. Current scopes (Deck, Bathroom renovation, Retaining wall) remain the only **active** templates. The scopes below are specification-only until implemented per `docs/07-adding-new-scope-template.md`.

---

## Kitchen Renovation

| Area | Detail |
|------|--------|
| **Aliases** | kitchen, kitchen reno, kitchen renovation, cabinetry, benchtop, splashback, kitchen fit-out |
| **Required facts** | floor area (m²), layout changing (yes/no), finish level, benchtop material, cabinetry extent (full/partial) |
| **Optional facts** | demolition, plumbing relocation, electrical allowance, appliance package, splashback type, rubbish removal, occupied home |
| **Constraints** | tight access, occupied home, apartment access, asbestos risk, limited working hours |
| **Likely trades** | Builder, Cabinetmaker, Plumber, Electrician, Tiler, Stonemason |
| **Benchmark rate type** | `floor_area` — $4,500–9,500/m² (NZ indicative) |
| **Key questions** | Floor area? Layout changing? Finish level? Full or partial cabinetry? Benchtop material? |
| **Calculation approach** | Base m² rate × finish modifier; +layout change +20%; +demolition, plumbing, electrical allowances |
| **Rate onboarding** | Scope rate per m²; optional package rate for standard kitchen packages |

---

## Painting

| Area | Detail |
|------|--------|
| **Aliases** | painting, paint, interior paint, exterior paint, repainting, walls and ceilings |
| **Required facts** | area (m²), interior/exterior, number of coats, finish level |
| **Optional facts** | prep level (light/medium/heavy), ceiling included, trim/doors included, occupied home, scaffolding |
| **Constraints** | tight access, occupied home, weather exposure (exterior), restricted hours |
| **Likely trades** | Painter, Plasterer (prep), Scaffolder |
| **Benchmark rate type** | `floor_area` or `wall_area` — $35–85/m² (interior walls, indicative) |
| **Key questions** | Approximate area? Interior or exterior? How many coats? What prep is needed? |
| **Calculation approach** | m² × base rate; ×1.15 exterior; ×1.1 heavy prep; +scaffolding allowance if elevated |
| **Rate onboarding** | Labour rate per m²; material allowance per m² optional |

---

## Fence

| Area | Detail |
|------|--------|
| **Aliases** | fence, fencing, boundary fence, paling fence, post and rail, gate |
| **Required facts** | length (m), height (m), material (timber/colorbond/block), gate included (yes/no) |
| **Optional facts** | existing fence removal, concrete posts, retaining integration, rubbish removal, slope |
| **Constraints** | tight access, poor parking, boundary/neighbour access, rock/hard dig |
| **Likely trades** | Fencer, Labourer, Earthworks |
| **Benchmark rate type** | `wall_area` (length × height) — $180–450/m² face area |
| **Key questions** | Fence length? Height? Material? Gate included? Existing fence to remove? |
| **Calculation approach** | length × height × rate; +gate allowance (~$800–1,500); +demo if existing |
| **Rate onboarding** | Scope rate per m² face area; gate as optional component |

---

## Flooring

| Area | Detail |
|------|--------|
| **Aliases** | flooring, floor, timber floor, laminate, vinyl, carpet, floor replacement |
| **Required facts** | area (m²), floor type (timber/laminate/vinyl/carpet/tile), subfloor condition |
| **Optional facts** | removal of existing floor, levelling/screed, transitions, skirting removal, occupied home |
| **Constraints** | tight access, occupied home, moisture risk, adhesive restrictions (strata) |
| **Likely trades** | Floor layer, Carpenter, Screeder |
| **Benchmark rate type** | `floor_area` — $120–350/m² supply & lay (material dependent) |
| **Key questions** | Floor area? Material/type? Subfloor condition? Existing floor to remove? |
| **Calculation approach** | m² × material rate; +removal allowance; +levelling if poor subfloor |
| **Rate onboarding** | Material-specific scope rates; labour-only option for client-supplied product |

---

## Expansion checklist (per scope)

1. Add `src/lib/scopes/<scope>.ts` with facts, constraints, benchmark rates.
2. Re-export via `src/lib/scope-templates/<scope>.ts`.
3. Register in `src/lib/scopes/index.ts`.
4. Add scope suggestion rules in `src/lib/scope-suggestion-rules.ts`.
5. Add work area type key mapping in `resolveWorkAreaTypeKey`.
6. Add scope rate definition in `src/lib/constants/scope-rates.ts`.
7. Extend `calculateFromTemplate` if new calculation type needed.
8. Seed scope questions via migration or seed script.
9. QA: notes extraction, missing questions, estimate movement, assistant commands.

---

## Alias normalisation notes

When adding scopes, use the same alias-matching approach as existing scopes:

- Lowercase, substring match in notes
- Work area name matching in assistant commands (exact → bidirectional substring)
- Allowance synonym clusters in `item-resolution/normalize-item-text.ts` for commercial items (rubbish, spoil, cartage)

Keep contractor-facing labels plain: “Rubbish removal”, “Site access”, “Tighten the estimate” — avoid internal keys in UI.
