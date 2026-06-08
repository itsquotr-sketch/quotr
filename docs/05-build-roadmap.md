# Quotr Build Roadmap

**Status:** Source of truth for build phases. AI agents must identify the current phase before coding.

---

## Phase overview

| Phase | Name | Status |
|---|---|---|
| 0 | Foundation / styling / auth | ✅ Complete |
| 1 | Project and scope foundation | 🔄 In progress |
| 2 | Rates and assemblies | ⬜ Not started |
| 3 | Estimate engine | ⬜ Not started |
| 4 | AI scope assistant | ⬜ Not started |
| 5 | Quote generator | ⬜ Not started |
| 6 | Subcontractor RFQs | ⬜ Not started |
| 7 | PWA / native mobile | ⬜ Not started |
| 8 | Integrations / payments | ⬜ Not started |

---

## Phase 0: Foundation / styling / auth

### Goal
Establish a stable, styled, authenticated app shell that works on desktop and mobile.

### Features
- [x] Next.js App Router project setup
- [x] Tailwind CSS v4 + Shadcn UI
- [x] Supabase Auth (signup, login, logout)
- [x] Auth middleware and session refresh
- [x] Onboarding flow (organisation creation)
- [x] App shell: desktop sidebar + mobile bottom nav
- [x] PageContainer with responsive layout
- [x] Dashboard (desktop + mobile variants)
- [x] Settings page
- [x] Placeholder pages for future modules
- [x] Legacy route redirects (`/jobs`, `/site-visits` → `/projects`)
- [x] `npm run build` passes

### Definition of done
- [x] User can sign up, complete onboarding, and reach dashboard
- [x] Desktop shows sidebar; mobile shows bottom nav; never both
- [x] Tailwind styles load correctly on all pages
- [x] No unstyled HTML or phone-width desktop layout
- [x] Build passes with zero errors

### Do not build yet
- Projects, scopes, estimates, quotes, AI, RFQs, rates, assemblies

---

## Phase 1: Project and scope foundation

### Goal
Builders can create projects, add scopes of work, and capture photos, documents, and measurements.

### Features
- [x] Create project (enquiry capture form)
- [x] List projects
- [x] Project detail page with scopes list
- [x] Add scope of work (type selection, name, description, location)
- [x] Scope detail page
- [x] Upload scope photos (Supabase Storage)
- [x] Upload scope documents (Supabase Storage)
- [x] Add scope measurements (label, value, unit)
- [x] Client normalisation helper (`lib/clients.ts`)
- [x] Project and scope status tracking
- [ ] Edit project details
- [ ] Edit scope details
- [ ] Delete scope photos/documents
- [ ] Project status transitions (manual)
- [ ] Empty states and error states on all project pages
- [ ] Mobile-optimised scope capture flow

### Definition of done
- [ ] Builder can create a project from any enquiry source
- [ ] Builder can add multiple scopes to a project
- [ ] Builder can upload photos and documents to a scope on mobile
- [ ] Builder can add measurements to a scope
- [ ] All data correctly scoped to organisation via RLS
- [ ] `npm run build` passes
- [ ] QA checklist (Phase 1 section) passes

### Do not build yet
- AI questions, estimate items, rates, assemblies, quote PDFs, RFQ sending

---

## Phase 2: Rates and assemblies

### Goal
Builders can maintain a library of unit rates and pre-built assemblies to speed up estimating.

### Features
- [ ] `rates` table migration (unit, category, cost, markup)
- [ ] `assemblies` and `assembly_items` table migrations
- [ ] `subcontractors` table migration (name, trade, contact)
- [ ] Rates CRUD (desktop)
- [ ] Assemblies CRUD (desktop)
- [ ] Subcontractors CRUD (desktop)
- [ ] Search and filter rates/assemblies
- [ ] Import/export rates (CSV) — optional

### Definition of done
- [ ] Builder can add, edit, and archive rates
- [ ] Builder can create assemblies from rates
- [ ] Builder can manage subcontractor contacts
- [ ] All tables have RLS and organisation scoping
- [ ] Replace placeholder pages for rates, assemblies, subcontractors
- [ ] `npm run build` passes

### Do not build yet
- Estimate calculations, AI, quotes, RFQs, PDF export

---

## Phase 3: Estimate engine

### Goal
Builders can build estimates at scope level and roll up to project level using rates and assemblies.

### Features
- [ ] Estimate UI on project and scope pages
- [ ] Create estimate sections per scope
- [ ] Add estimate items (manual, from rates, from assemblies)
- [ ] Quantity × rate calculations
- [ ] Section and project subtotals
- [ ] Markup and margin settings
- [ ] Estimate status workflow (`not_started` → `draft` → `review` → `complete`)
- [ ] Optional top-level `estimates` table migration
- [ ] Replace estimates placeholder page

### Definition of done
- [ ] Builder can build a scope-level estimate using rates
- [ ] Project estimate rolls up all scope estimates
- [ ] Totals calculate correctly
- [ ] Estimate status tracked per scope and project
- [ ] `npm run build` passes

### Do not build yet
- AI suggestions, quote PDFs, RFQ sending, OpenAI integration

---

## Phase 4: AI scope assistant

### Goal
AI analyses scope capture data and suggests questions and estimate items to accelerate scoping.

### Features
- [ ] OpenAI integration (server-side only)
- [ ] `ai_scope_runs` workflow (trigger, status, confidence)
- [ ] AI-generated scope questions (`scope_questions`)
- [ ] Builder answer flow (`scope_answers`)
- [ ] AI-suggested estimate items (approve/reject)
- [ ] Photo analysis (scope photos → descriptions/measurements)
- [ ] AI status indicators on scope cards

### Definition of done
- [ ] Builder can trigger AI analysis on a scope
- [ ] AI generates relevant clarifying questions
- [ ] Builder can answer questions and see suggested items
- [ ] AI suggestions can be accepted into estimate items
- [ ] `ai_scope_runs` records status and confidence
- [ ] OpenAI key never exposed to client
- [ ] `npm run build` passes

### Do not build yet
- Quote PDFs, RFQ email sending, payments

---

## Phase 5: Quote generator

### Goal
Builders can generate professional client quotes from project estimates.

### Features
- [ ] `quotes` and `quote_line_items` table migrations
- [ ] Quote builder UI (desktop)
- [ ] Roll up estimate into quote line items
- [ ] Quote preview
- [ ] PDF generation and download
- [ ] Quote status tracking (`quote_status` on project)
- [ ] Quote versioning (draft → sent → accepted/declined)
- [ ] Replace quotes placeholder page

### Definition of done
- [ ] Builder can generate a quote from a completed estimate
- [ ] Quote PDF downloads correctly with company branding
- [ ] Quote status updates on project
- [ ] `npm run build` passes

### Do not build yet
- RFQ sending, email delivery to client, payments

---

## Phase 6: Subcontractor RFQs

### Goal
Builders can package scope trades and send pricing requests to subcontractors.

### Features
- [ ] RFQ builder (select scope, trades, line items)
- [ ] `rfq_packages` full CRUD and status workflow
- [ ] Resend email integration
- [ ] RFQ email templates
- [ ] Track RFQ status (draft → sent → received)
- [ ] Import subbie pricing into estimate
- [ ] Replace RFQs placeholder page

### Definition of done
- [ ] Builder can create an RFQ package from a scope
- [ ] RFQ email sends via Resend with scope details
- [ ] Builder can record received pricing
- [ ] Subbie pricing flows into estimate items
- [ ] `npm run build` passes

### Do not build yet
- Payments, client quote email sending, native app

---

## Phase 7: PWA / native mobile

### Goal
Optimise the mobile experience for offline-capable field capture and consider native app.

### Features
- [ ] PWA manifest and service worker
- [ ] Offline project/scope capture (queue and sync)
- [ ] Camera integration for photo capture
- [ ] Push notifications for quote/RFQ updates
- [ ] Evaluate React Native or Capacitor native app
- [ ] App store deployment (if native)

### Definition of done
- [ ] App installable as PWA on mobile devices
- [ ] Basic offline capture works and syncs on reconnect
- [ ] Field capture flow optimised for one-handed use
- [ ] `npm run build` passes

### Do not build yet
- Payments, third-party integrations beyond Supabase/Vercel

---

## Phase 8: Integrations / payments

### Goal
Connect Quotr to external systems and enable payment collection.

### Features
- [ ] Stripe payment integration (quote deposits)
- [ ] Xero/MYOB accounting export
- [ ] Calendar integration (site visit scheduling)
- [ ] Email integration (inbound enquiry parsing)
- [ ] Webhook API for third-party tools
- [ ] Multi-user roles and permissions

### Definition of done
- [ ] At least one payment flow works end-to-end
- [ ] At least one accounting export format works
- [ ] `npm run build` passes

---

## How to use this roadmap

### For AI agents
1. Read the phase overview table.
2. Find the current phase (first incomplete phase).
3. Only implement features listed in that phase.
4. Check "Do not build yet" before every task.
5. Mark items complete as they are finished.
6. Do not skip phases.

### For the user
- To start a new phase: explicitly tell the AI "begin Phase N".
- To check progress: review the checkboxes in the current phase.
- To reprioritise: update this document first, then instruct the AI.

---

## Current priority

**Phase 1** is the active phase. Complete remaining Phase 1 features before starting Phase 2.

Remaining Phase 1 work:
- Edit project/scope
- Delete uploaded media
- Mobile scope capture polish
- Phase 1 QA checklist
