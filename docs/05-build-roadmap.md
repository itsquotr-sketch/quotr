# Quotr Build Roadmap

**Status:** Source of truth for build sprints. AI agents must identify the current sprint before coding.

---

## Sprint overview

| Sprint | Name | Status |
|---|---|---|
| — | Pre-sprint foundation (auth, shell, capture) | ✅ Complete |
| 1 | Platform Stabilisation (Sprint 1) | ✅ Complete |
| 2A | Product Hardening | 🔄 In progress |
| 2 | Quick Estimate Foundation | ✅ Complete |
| 2C | Project Assistant Workflow | ✅ Complete |
| 3 | Quick Estimate Engine | ⬜ Not started |
| 4 | Rates Library | ⬜ Not started |
| 5 | Assemblies | ⬜ Not started |
| 6 | Detailed Estimate Engine | ⬜ Not started |
| 7 | RFQs | ⬜ Not started |
| 8 | Quote Builder | ⬜ Not started |
| 9 | PWA / native mobile | ⬜ Not started |
| 10 | Integrations / payments | ⬜ Not started |

---

## Product context

Quotr is primarily a **Rapid Estimating platform**. The primary user outcome:

> Help a contractor turn site notes into a profitable estimate in minutes.

Workflow: **Project → Project Assistant → Work Areas → Targeted Questions → Quick Estimate → Client Qualification → Detailed Estimate → RFQs → Quote**

**Pricing rule:** AI never generates prices. All dollar amounts come from rates, assemblies, allowances, and constraints.

### Quick Estimate vs Detailed Estimate

| | Quick Estimate | Detailed Estimate |
|---|---|---|
| **Purpose** | Ballpark in minutes; qualify the job | Line-item build-up for quoting |
| **Sprint** | Sprints 2–3 | Sprint 6 |
| **Speed** | Seconds to minutes | Minutes to hours |
| **Inputs** | Drivers + constraints + capture summary | Rates, assemblies, allowances, manual items |
| **Output** | Range or ballpark with confidence | Sections, line items, subtotals, margins |
| **When** | Right after capture | After client qualification; before RFQs and quote |

Quick Estimate answers: *"Is this job worth pursuing and roughly what will it cost?"*

Detailed Estimate answers: *"What exactly are we quoting and what is every line worth?"*

These are separate modules — do not merge them into one UI or one calculation path.

---

## Pre-sprint foundation (complete)

Auth, styling, app shell, project/scope CRUD, and capture (photos, documents, measurements) are built. See git history for Phase 0–1 detail.

---

## Sprint 2A: Product Hardening

### Goal
Stabilise the platform before building the Quick Estimate Engine — edit flows, file deletion, dashboard metrics, naming consistency, and RLS completeness.

### Scope
- [x] Permanent commit to `projects` / `project_id` (migration 011)
- [x] Edit project (title, client, address, enquiry source, priority, notes, status)
- [x] Edit scope (name, type, description, location, status, notes)
- [x] Delete photos and documents (storage + DB, confirmation dialog)
- [x] Signed URL expiry increased to 24 hours
- [x] Dashboard metrics via Supabase count() queries
- [x] Migration documentation (`docs/MIGRATION_STEPS.md`)
- [x] RLS audit — scope_questions, scope_answers, measurements/documents update policies
- [ ] Apply migrations 009–011 to remote Supabase
- [ ] Manual QA pass

### Definition of done
- [ ] Builder can edit projects and scopes
- [ ] Builder can delete uploaded files with confirmation
- [ ] Dashboard shows real counts (not JS filter)
- [ ] No `jobs` / `job_id` references in code
- [ ] Migrations applied to production/staging Supabase
- [ ] `npm run build` passes

### Do not build yet
- Quick Estimate Engine, rates library, assemblies, AI, RFQs, quotes

---

## Sprint 1: Platform Stabilisation (complete)

### Goal
Fix audit findings, harden security and reliability, and align schema/code naming — **no new product features**.

### Scope
- [x] Server-side file type and size validation on uploads
- [x] Rollback on partial scope creation failure
- [x] Commit to `projects` table name (rename from `jobs`); use `project_id` FKs
- [x] Full CRUD RLS on future tables (`estimate_sections`, `estimate_items`, `rfq_packages`, `ai_scope_runs`)
- [x] Form pending/loading states on project and scope forms
- [x] Client name/phone/email normalisation before lookup
- [x] Build-time environment variable validation (`@t3-oss/env-nextjs`)
- [x] Typed signed URL results with fallback UI for unavailable media
- [ ] Remaining audit items (see Sprint 1 backlog below)
- [ ] Apply migrations 009–010 to remote Supabase
- [ ] `npm run build` passes

### Sprint 1 backlog (remaining audit items — not in this sprint's initial fix batch)
- [ ] #5 Edit project
- [ ] #6 Edit scope
- [ ] #7 Delete uploaded photos/documents
- [ ] #9 Signed URL expiry (24h or on-demand refresh)
- [ ] #10 Dashboard metrics wired to real counts
- [ ] #11 Project list pagination
- [ ] #13 Remove denormalised client columns from projects
- [ ] #14 Status transition enforcement
- [ ] #15 Supabase CLI workflow
- [ ] #16 loading.tsx skeletons
- [ ] #17 Standardised form error display
- [ ] #18 Reduce onboarding fields
- [ ] #20 Drop legacy site_visits tables
- [ ] #21 scope_questions/scope_answers CRUD RLS
- [ ] #22 Automated tests
- [ ] #23 prettier-plugin-tailwindcss
- [ ] #24 Mobile nav active state on nested routes

### Definition of done
- [ ] All Sprint 1 audit fixes applied and verified
- [ ] `projects` is the only table name in code and migrations
- [ ] No silent upload or storage failures
- [ ] Build passes with zero errors
- [ ] No new product features added during stabilisation

### Do not build yet
- Quick Estimate UI, rates library, assemblies, Detailed Estimate, AI, RFQs, quotes

---

## Sprint 2D: Project Assistant → Quick Estimate (inline flow)

### Goal
Drive quick estimate entirely from Project Assistant — no duplicate notes entry on a separate page.

### Features
- [x] Five-step Project Assistant wizard (notes → work areas → questions → constraints → result)
- [x] Scope-specific questions from confirmed `project_scopes`
- [x] Work-area-specific constraints with conditional follow-ups
- [x] Rule-based quick estimate calculation with trades, allowances, risks
- [x] `project_estimate_driver_values` for constraint follow-up values
- [x] `/quick-estimate` redirects to Project Assistant (review only)

### Definition of done
- [x] User writes notes once; no rewrite on Quick Estimate page
- [x] `npm run build` passes

---

## Sprint 2C: Project Assistant Workflow

### Goal
Unify the project detail experience into an assistant-led workflow — not separate tool cards.

### Features
- [x] Project Assistant card (notes, analyse, work areas, questions, quick estimate summary)
- [x] Identified work areas from `project_scope_suggestions` with accept / reject / edit
- [x] Rule-based targeted questions per work area type
- [x] Questions seeded to `scope_questions` on work area accept
- [x] Quick estimate summary inside Project Assistant (trades, allowances, risks placeholders)
- [x] "Confirmed Work Areas" section (UI label for `project_scopes`)

### Definition of done
- [x] Single dominant Project Assistant on project detail
- [x] No competing Quick Estimate / Scope Builder cards on project page
- [x] Plain-language labels (work areas, not scopes)
- [x] `npm run build` passes

### Do not build yet
- RFQs, quote PDFs, detailed estimate engine, AI question generation, answer capture UI

---

## Sprint 2: Quick Estimate Foundation

### Goal
Establish estimate driver schema, constraints schema, and seed pricing data structures.

### Features
- [ ] Estimate driver schema (per scope type) — migration
- [ ] Driver storage on project/scope
- [ ] Constraints schema (organisation-level) — migration
- [ ] Constraints CRUD in settings (margin floors, rounding, exclusions)
- [ ] Seed/default rates for Quick Estimate (until Sprint 4 library exists)

### Definition of done
- [ ] Driver and constraint schemas migrated with full RLS
- [ ] Builder can configure organisation constraints in settings
- [ ] Driver types defined per scope type
- [ ] `npm run build` passes

### Do not build yet
- Quick Estimate calculation engine, Quick Estimate UI, rates CRUD, assemblies, Detailed Estimate, AI, quotes, RFQs

---

## Sprint 4A.1: Budget / Finish Level

### Goal
Add client budget / finish level as a quick estimate input without disrupting Project Assistant.

### Scope
- [x] `quality_level` on `quick_estimates` (budget, standard, premium, unknown)
- [x] Step 4 renamed to Budget, finish and constraints
- [x] v1 cost engine modifiers per finish level
- [x] AI + rule-based finish level detection from notes
- [x] Builder override in Step 4
- [x] Draft quick estimate card shows finish level and assumptions

---

## Sprint 4A: AI Discovery V2

### Goal
Integrate OpenAI into the Discovery Engine for improved job understanding — never pricing.

### Scope
- [x] AI provider architecture (`src/lib/ai/discovery/`)
- [x] `discovery_v1` prompt with strict JSON schema
- [x] OpenAI provider with rule-based fallback
- [x] Unified `runProjectDiscovery()` server orchestration
- [x] Persist to `discovery_runs` + `discovery_outputs` + legacy `project_discovery_runs`
- [x] Apply work areas, questions, constraints as builder-confirmed suggestions
- [x] Project Assistant UI — provider, confidence, last analysed time
- [ ] Set `OPENAI_API_KEY` in server env for AI mode

### Definition of done
- [ ] Analyse Project uses AI when key is configured
- [ ] Falls back to basic rules without breaking the flow
- [ ] Quick estimate reads saved/confirmed data only — not raw AI output
- [ ] `npm run build` passes

---

## Sprint 3F: Project Assistant Constraint Fixes + Discovery Engine Prep

### Goal
Make Project Assistant constraints fully functional end-to-end and prepare discovery tables for AI.

### Scope
- [x] Trace and fix constraint persistence (UI → DB → discovery summary → cost engine)
- [x] Hydrate constraint UI from `project_estimate_driver_values` on reload
- [x] Discovery summary shows note-detected + user-selected constraints with values
- [x] Quick Estimate applies v1 constraint modifiers (percent, carting tiers, fixed allowances)
- [x] Tighten estimate ranges when key dimensions exist
- [x] Enforce questions vs constraints distinction (no duplication)
- [x] `discovery_runs` + `discovery_outputs` tables (migration 025)
- [x] Bridge rule-based discovery into new tables on Analyse Project
- [ ] Apply migration 025 to remote Supabase

### Definition of done
- [ ] Selected constraints persist after page refresh
- [ ] Discovery summary → Constraints shows saved constraints with values
- [ ] Quick Estimate card shows applied constraints with modifiers
- [ ] `npm run build` passes
- [ ] No OpenAI integration yet

---

## Sprint 3: Quick Estimate Engine

### Goal
Builders can turn capture data into a ballpark estimate in minutes.

### Features
- [ ] Quick Estimate calculation engine (drivers + constraints + seed rates → ballpark)
- [ ] Quick Estimate UI on project detail (mobile-first)
- [ ] Confidence indicators and gap flags
- [ ] Driver edit UI (inline / bottom sheet on mobile)
- [ ] Recalculate on driver or capture change
- [ ] Client Qualification prompt (budget fit, proceed/on hold)

### Definition of done
- [ ] Builder can capture notes on mobile and run Quick Estimate within minutes
- [ ] Quick Estimate shows ballpark with confidence and flagged gaps
- [ ] No AI-generated prices — calculation traceable to seed rates and drivers
- [ ] Quick Estimate is visually separate from Detailed Estimate placeholder
- [ ] `npm run build` passes

### Do not build yet
- Full rates library CRUD, assemblies, Detailed Estimate line items, AI, quotes, RFQs

---

## Sprint 4: Rates Library

### Goal
Builders maintain a library of unit rates powering Quick Estimate formulas and Detailed Estimate line items.

### Features
- [ ] `rates` table migration
- [ ] Rates CRUD (desktop)
- [ ] Search and filter rates
- [ ] Driver-to-rate mapping for Quick Estimate formulas
- [ ] Migrate Quick Estimate from seed rates to organisation library
- [ ] Import/export rates (CSV) — optional

### Definition of done
- [ ] Builder can add, edit, and archive rates
- [ ] Quick Estimate uses organisation rates
- [ ] `npm run build` passes

### Do not build yet
- Assemblies, Detailed Estimate UI, AI, quotes, RFQs

---

## Sprint 5: Assemblies

### Goal
Pre-built assemblies from rates for Quick Estimate bundling and Detailed Estimate expansion.

### Features
- [ ] `assemblies` and `assembly_items` table migrations
- [ ] Assemblies CRUD (desktop)
- [ ] Assembly bundling logic (Quick Estimate)
- [ ] Assembly expansion logic (Detailed Estimate — Sprint 6)
- [ ] Search and filter assemblies

### Definition of done
- [ ] Builder can create assemblies from rates
- [ ] Quick Estimate can price via assembly-linked drivers
- [ ] `npm run build` passes

### Do not build yet
- Detailed Estimate UI, AI, quotes, RFQs

---

## Sprint 6: Detailed Estimate Engine

### Goal
Line-item estimates at scope level, rolled up to project, using rates, assemblies, and allowances.

### Features
- [ ] Allowances schema (provisional sums, PC items)
- [ ] Estimate UI (desktop-primary)
- [ ] Estimate sections and line items (manual, rates, assemblies, allowances)
- [ ] Quantity × rate calculations with constraint application
- [ ] Section and project subtotals
- [ ] Estimate status workflow
- [ ] Mobile read-only estimate summary

### Definition of done
- [ ] Builder can build scope-level Detailed Estimate
- [ ] Project estimate rolls up all scopes
- [ ] Detailed Estimate is separate from Quick Estimate
- [ ] `npm run build` passes

### Do not build yet
- AI Question Engine, quote PDFs, RFQ sending

---

## Sprint 7: RFQs

### Goal
Package scope trades and send pricing requests to subcontractors.

### Features
- [ ] `subcontractors` table migration
- [ ] Subcontractors CRUD
- [ ] RFQ builder from Detailed Estimate line items
- [ ] Resend email integration
- [ ] Track RFQ status and import subbie pricing

### Definition of done
- [ ] Builder can create and send RFQ packages
- [ ] Subbie pricing flows into Detailed Estimate
- [ ] `npm run build` passes

### Do not build yet
- Quote PDF generation, payments, native app

---

## Sprint 8: Quote Builder

### Goal
Generate professional client quotes from Detailed Estimates.

### Features
- [ ] `quotes` and `quote_line_items` migrations
- [ ] Quote builder UI (desktop)
- [ ] Roll up Detailed Estimate into quote line items
- [ ] PDF generation and download
- [ ] Quote status and versioning

### Definition of done
- [ ] Builder can generate quote from completed Detailed Estimate
- [ ] Every quote line traces to rates, assemblies, allowances, or subbie pricing
- [ ] `npm run build` passes

---

## Sprint 9: PWA / native mobile

Offline-capable field capture and Quick Estimate. See previous Phase 9 detail.

---

## Sprint 10: Integrations / payments

Stripe, accounting export, webhooks. See previous Phase 10 detail.

---

## How to use this roadmap

### For AI agents
1. Read the sprint overview table.
2. Find the current sprint.
3. Only implement work listed in that sprint.
4. During **Sprint 1**: fix audit items only — no new product features.
5. Check "Do not build yet" before every task.
6. **Never implement AI pricing** — pricing comes from rates, assemblies, allowances, and constraints.

### For the user
- To start a new sprint: explicitly tell the AI "begin Sprint N".
- To reprioritise: update this document first, then instruct the AI.

---

## Current priority

**Sprint 3F: Constraint fixes + Discovery Engine prep** is in progress. Next: Sprint 3 Quick Estimate Engine refinements and AI Discovery V2.
