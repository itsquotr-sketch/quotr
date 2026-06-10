# Quotr System Architecture

**Status:** Source of truth for technical architecture.

---

## Stack overview

| Layer | Technology |
|---|---|
| Frontend | Next.js 15 App Router, React 19, TypeScript |
| Styling | Tailwind CSS v4, Shadcn UI (radix-sera style) |
| Auth | Supabase Auth (email/password) |
| Database | Supabase Postgres |
| File storage | Supabase Storage |
| Security | Supabase Row Level Security (RLS) |
| Hosting | Vercel |
| AI (later) | OpenAI |
| Email (later) | Resend |

---

## Repository structure

```
quotr/
├── docs/                    # Build guidance (this folder)
├── supabase/
│   └── migrations/          # SQL migrations (source of truth for schema)
├── src/
│   ├── app/
│   │   ├── layout.tsx       # Root layout, globals.css import
│   │   ├── globals.css      # Tailwind + Shadcn theme
│   │   ├── (auth)/          # Login, signup (unauthenticated)
│   │   ├── (app)/           # Authenticated app routes
│   │   ├── onboarding/      # Organisation setup
│   │   └── auth/callback/   # Supabase auth callback
│   ├── actions/             # Server Actions (mutations)
│   ├── components/
│   │   ├── layout/          # App shell, sidebar, bottom nav
│   │   ├── ui/              # Shadcn primitives
│   │   ├── projects/        # Project/scope components
│   │   ├── auth/            # Auth forms
│   │   └── shared/          # Shared UI patterns
│   ├── lib/
│   │   ├── supabase/        # Server/client clients, middleware
│   │   ├── validations/     # Zod schemas
│   │   ├── constants/       # Status enums, labels
│   │   ├── discovery/       # Discovery Engine (rule-based + future OpenAI)
│   │   ├── cost-engine/     # Quick Estimate pricing (placeholder)
│   │   └── auth.ts          # Session/profile helpers
│   └── types/
│       └── database.ts      # Generated/manual DB types
├── tailwind.config.ts       # Tailwind content paths
├── postcss.config.mjs         # PostCSS with @tailwindcss/postcss
└── components.json            # Shadcn config
```

---

## Product workflow architecture

Quotr is a **Rapid Estimating platform**. The technical modules map to this workflow:

```
Project
  → Project Assistant
  → Work Areas / Confirmed Work Areas
  → Targeted Questions
  → Quick Estimate
  → Client Qualification
  → Detailed Estimate
  → RFQs
  → Quote
```

Each stage is a module boundary. Data flows forward; any stage may trigger a return to Capture or driver updates.

---

## Discovery Engine (Sprint 2D)

The Discovery Engine extracts structured information from project notes. **This is information discovery, not AI estimating.**

| Output | Description | Examples |
|---|---|---|
| Work areas | Scopes to quote | Deck, Bathroom renovation |
| Facts | Measurable scope data | Deck area, wall length/height |
| Constraints | Site/job difficulty | Tight access, poor parking |
| Questions | Per work area gaps | "Approximate deck area?" |
| Trades | Likely trades required | Builder, Plumber, Tiler |

### Architecture

```
src/lib/discovery/
├── types.ts                  # DiscoveryResult and item types
├── provider.ts               # DiscoveryProvider interface
├── rule-based-provider.ts    # Current implementation (keyword + regex)
├── openai-provider.ts        # Future — stub only
├── fact-rules.ts             # Scope fact extraction
├── constraint-rules.ts       # Constraint extraction (separate from facts)
└── index.ts                  # getDiscoveryProvider(), exports
```

**Provider pattern:** `DiscoveryProvider.discoverProject(sourceNotes)` returns a `DiscoveryResult`. Swap providers via `getDefaultDiscoveryProvider()` — set `DISCOVERY_PROVIDER=openai` when ready.

**Persistence (dual-write during transition):**

| Table | Purpose |
|---|---|
| `project_discovery_runs` | Legacy JSONB snapshot — still used by Project Assistant discovery summary |
| `discovery_runs` | Canonical run log with `input_text`, `input_hash`, `provider`, `model`, `prompt_version`, `raw_output`, `parsed_output` |
| `discovery_outputs` | Structured outputs per run (`work_area`, `fact`, `question`, `constraint`, `trade`, `risk`, `assumption`) |

**Engine versions:**

| Version | Provider | Status |
|---|---|---|
| V1 | `rule_based` (keyword + regex) | Active — `rule-based-provider.ts` |
| V2 | `openai` | Prepared — `openai-provider.ts` stub; AI must output structured JSON matching `DiscoveryResult` |

All runs (V1 and V2) must store input, output, `prompt_version`, `model`, and per-output `confidence`.

**Integration points:**

| Trigger | Action |
|---|---|
| Analyse Project | `runAndPersistDiscovery()` → `project_discovery_runs` + `discovery_runs` / `discovery_outputs` → scope suggestions |
| Accept work area | `syncScopeQuestionsForScope()` → `scope_questions`; refresh discovery questions/trades |
| Future OpenAI | Implement `OpenAIDiscoveryProvider`, enable via `DISCOVERY_PROVIDER=openai` |

**Data flow (Sprint 3D–3F):** Discovery facts sync into `scope_answers` (`source: discovery`). Quick estimate reads saved `scope_answers` first; discovery facts are a calculation fallback only when not yet synced. User-edited answers always take priority.

**Constraint flow (Sprint 3F):** User-selected constraints persist to `project_estimate_driver_values` (`constraint_key` + JSON `value`) and linked `project_estimate_drivers`. `buildQuickEstimateInput()` loads saved constraints; `applyConstraintsToBand()` applies v1 modifiers. Discovery summary merges note-detected and user-selected constraints.

**Finish level (Sprint 4A.1):** `quick_estimates.quality_level` is set in Project Assistant Step 4 (Budget, finish and constraints). AI/rule discovery may suggest a level from notes; builder confirmation always wins. `applyQualityLevelToBand()` adjusts estimate range and confidence. Pricing remains from rates/fallback benchmarks — never from raw AI output.

---

## Cost Engine (Sprint 3A)

The Cost Engine calculates quick estimate pricing from discovery output and organisation rates.

```
Discovery Engine → Cost Engine → Quick Estimate UI
```

### Architecture

```
src/lib/cost-engine/
├── types.ts              # QuickEstimateCostInput, QuickEstimateCostResult
├── engine.ts             # CostEngine interface
├── placeholder-engine.ts # Current implementation (returns zeros)
└── index.ts              # getCostEngine()
```

**Method:** `calculateQuickEstimate(input)` returns `{ cost, sell, margin, confidence }`.

**Rate ranges:** Subcontractor and package rates store `RateRange` bands (`low`, `typical`, `high`). Legacy single-value columns (`cost_rate`, `base_cost`, etc.) mirror the typical value.

```typescript
type RateRange = { low: number; typical: number; high: number };
```

**Future integration:** Load org rate bands and `organisation_pricing_settings`; apply discovery work areas, facts, and constraints to produce low/high quick estimate ranges.

**Hard rule:** Cost Engine is separate from Discovery — discovery finds information; cost engine prices it.

### Rate Library

Organisation-scoped pricing tables (migration 016):

| Table | Purpose |
|---|---|
| `labour_rates` | Internal labour cost/charge rates |
| `subcontractor_rates` | Trade subcontractor rates |
| `material_rates` | Material cost/charge rates |
| `package_rates` | Bundled work area packages |
| `organisation_pricing_settings` | Default margin, contingency, GST, currency |

Managed via `/rates` UI with Labour, Subcontractors, Materials, Packages tabs.

---

## Estimating engine architecture

### Quick Estimate Engine (Phase 2)

The Quick Estimate Engine is the core speed module. It:

1. Accepts **capture data** (notes, photos, measurements, scope type) from a project.
2. Resolves or infers **estimate drivers** (structured inputs — area, fixture count, finish level, etc.).
3. Runs driver formulas against **rates**, **assemblies**, and **allowances** from the organisation library.
4. Applies **constraints** (margins, rounding, exclusions, provisional sums).
5. Returns a ballpark (range or single figure) with confidence scores and flagged gaps.

**Implementation rules:**

- Quick Estimate runs server-side via Server Actions.
- Calculation logic lives in dedicated lib modules — not inline in UI components.
- Results are persisted on the project (or linked estimate record) for audit and comparison.
- Recalculation triggers when drivers or library data change.

### Estimate Drivers

Drivers are structured key-value inputs stored per project (or scope). They are the variables in Quick Estimate formulas.

| Concern | Approach |
|---|---|
| Storage | Driver schema per scope type; values on project/scope |
| Sources | Manual entry, measurements, AI extraction (Phase 6) |
| Validation | Zod schemas per driver type |
| Change tracking | Driver updates trigger Quick Estimate recalculation |

Drivers must never be free-form prose used directly for pricing — they are typed, validated inputs.

### Constraints System

Constraints are organisation-level business rules applied during every estimate calculation.

| Constraint type | Example |
|---|---|
| Margin floor | Minimum 15% gross margin |
| Rounding | Round totals to nearest $50 |
| Exclusions | "Owner supplies tiles" — zero cost, note only |
| Provisional sums | Fixed allowance for unknown subfloor work |
| Discount cap | Max 5% without owner approval |

**Implementation rules:**

- Constraints stored per organisation; evaluated by the pricing engine, not the UI.
- Same constraint engine serves Quick Estimate and Detailed Estimate.
- Constraint violations surface as warnings or blocks — never silent overrides.

### Detailed Estimate Engine (Phase 5)

The Detailed Estimate Engine builds line-item estimates from the pricing library.

| Concern | Approach |
|---|---|
| Structure | Sections → line items per project/scope |
| Line item sources | Manual, rate lookup, assembly expansion, allowance |
| Calculations | Quantity × rate; assembly roll-up; constraint application |
| Roll-up | Scope subtotals → project total |

Detailed Estimate is separate from Quick Estimate. A project may have both: Quick Estimate for speed, Detailed Estimate for quoting.

### AI Question Engine (Phase 6)

The AI Question Engine improves estimate inputs — it does **not** generate prices.

Responsibilities:

- Analyse capture data (notes, photos, measurements)
- Identify missing or low-confidence drivers
- Generate clarifying questions (`scope_questions`)
- Suggest scope items for builder review
- Track runs in `ai_scope_runs` with confidence scores

**Hard rule: AI output never flows directly into pricing calculations.**

AI may suggest drivers or line items; the builder approves; the pricing engine calculates from rates, assemblies, allowances, and constraints.

### Why AI never generates pricing directly

| Layer | Responsibility |
|---|---|
| AI | Interpret capture, extract/suggest drivers, ask questions |
| Pricing engine | Calculate from rates + assemblies + allowances + constraints |
| Builder | Approve drivers, line items, and final numbers |

This separation is architectural, not optional:

- Ensures reproducible, auditable pricing
- Keeps builder-owned commercial rules in control
- Prevents model hallucination from reaching client-facing numbers
- Allows AI to improve over time without invalidating historical quotes

### Pricing sources (single source of truth)

All dollar amounts originate from:

| Source | Used by |
|---|---|
| **Rates** | Quick Estimate (via driver formulas), Detailed Estimate (line items) |
| **Assemblies** | Quick Estimate (bundled drivers), Detailed Estimate (expanded line items) |
| **Allowances** | Both engines (provisional sums, PC items, unknowns) |
| **Constraints** | Both engines (margins, rounding, exclusions) |

No other code path may produce pricing. OpenAI responses are never parsed for dollar amounts.

---

## Frontend architecture

### App Router route groups

| Group | Purpose | Layout |
|---|---|---|
| `(auth)` | Login, signup | Minimal auth layout, no sidebar |
| `(app)` | All authenticated features | `AppShell` with sidebar/bottom nav |
| `onboarding` | First-time org setup | Standalone, no app shell |

### Rendering strategy

- **Server Components** by default for data fetching and pages.
- **Client Components** (`"use client"`) only for: navigation active states, forms with client interactivity, file uploads, interactive UI.
- **Server Actions** for all mutations — no REST API layer for CRUD.

### Key layout components

| Component | Role |
|---|---|
| `AppShell` | Wraps authenticated pages |
| `DesktopSidebar` | Fixed left nav, visible `md+` only |
| `MobileBottomNav` | Fixed bottom nav, visible `<md` only |
| `PageContainer` | Main content area with `max-w-7xl` and mobile bottom padding |

---

## Backend architecture

Quotr has no custom backend server. Supabase is the backend.

```
Browser
  → Next.js (Vercel)
    → Server Component / Server Action
      → Supabase client (anon key + user session)
        → Postgres (RLS enforced)
        → Storage (RLS enforced)
```

### Supabase clients

| Client | Location | Use |
|---|---|---|
| Server | `src/lib/supabase/server.ts` | Server Components, Server Actions |
| Browser | `src/lib/supabase/client.ts` | Client Components |
| Middleware | `src/lib/supabase/middleware.ts` | Session refresh, route protection |

### Middleware (`middleware.ts`)

- Refreshes Supabase session on every request.
- Redirects unauthenticated users to `/login`.
- Redirects users without `organisation_id` to `/onboarding`.
- Legacy redirects: `/jobs` → `/projects`, `/site-visits` → `/projects`.

---

## Auth and organisation model

### Signup flow
1. User signs up via Supabase Auth.
2. Trigger `handle_new_user` creates a `profiles` row.
3. User redirected to `/onboarding` if no organisation.

### Onboarding flow
1. User submits business details.
2. `create_organisation_for_user` RPC creates `organisations` row and links `profiles.organisation_id`.
3. User redirected to `/dashboard`.

### Session helpers (`src/lib/auth.ts`)

| Function | Purpose |
|---|---|
| `getSession()` | Current auth user or null |
| `getProfile()` | Profile row for current user |
| `requireAuth()` | Redirect to `/login` if unauthenticated |
| `requireOrganisation()` | Redirect to `/onboarding` if no org |

### Multi-tenancy

- Every data table is scoped to `organisation_id`.
- RLS policies use `get_user_organisation_id()` helper function.
- Users belong to exactly one organisation (current model).

---

## Data access patterns

### Reads (Server Components)
```typescript
const supabase = await createClient();
const { data } = await supabase
  .from("projects")
  .select("*")
  .order("created_at", { ascending: false });
```

### Writes (Server Actions)
```typescript
"use server";
// 1. Validate with Zod
// 2. const supabase = await createClient()
// 3. const user = await requireAuth() / requireOrganisation()
// 4. Insert/update with organisation_id from session
// 5. revalidatePath() if needed
```

### File uploads
- Upload to Supabase Storage via server-side `uploadFile()` helper.
- Path pattern: `{organisation_id}/{project_scope_id}/{filename}`.
- Buckets: `scope-photos`, `scope-documents`.
- Record metadata in `scope_photos` / `scope_documents` tables.

---

## Desktop vs mobile responsive architecture

One codebase, two experiences via Tailwind breakpoints:

| Breakpoint | Experience |
|---|---|
| `< md` (below 768px) | Mobile: bottom nav, capture + Quick Estimate focused, full-width CTAs |
| `≥ md` | Desktop: sidebar, full workspace, tables, multi-column layouts |

### Rules
- `DesktopSidebar`: `hidden md:flex`
- `MobileBottomNav`: `md:hidden`
- Main content: `md:pl-64` to offset sidebar
- Mobile content: `pb-24` to clear bottom nav
- Dashboard content: `max-w-7xl` centred — not phone-width on desktop

### Future native app (post Phase 8)
The responsive web app is the foundation. A future native app (React Native or Capacitor) would share the same Supabase backend and API patterns. Do not build native until the estimating workflow is stable through Phase 8.

---

## Module map (current and planned)

| Module | Status | Sprint |
|---|---|---|
| Auth + onboarding | Built | Pre-sprint |
| App shell + styling | Built | Pre-sprint |
| Projects CRUD + capture | Built | Pre-sprint |
| Platform stabilisation (audit fixes) | In progress | Sprint 1 |
| Quick Estimate Foundation | Built | Sprint 2 |
| Project Assistant (unified project detail UX) | Built | Sprint 2C |
| Quick Estimate Engine | Not started | Sprint 3 |
| Rates library | Placeholder page | Sprint 4 |
| Assemblies library | Placeholder page | Sprint 5 |
| Detailed Estimate Engine | Schema only | Sprint 6 |
| Subcontractor RFQs | Schema only | Sprint 7 |
| Quote Builder | Placeholder page | Sprint 8 |

---

## Quick Estimate module (Phase 2 — not yet built)

Planned capabilities:
- Driver schema and storage per scope type
- Quick Estimate calculation engine (drivers → rates/assemblies/allowances → ballpark)
- Constraints evaluation on Quick Estimate output
- Quick Estimate UI on project detail (mobile-first)
- Confidence indicators and gap flags

**Do not build Quick Estimate UI until driver and constraint foundations are designed.**

---

## Rates module (Phase 3 — not yet built)

Planned capabilities:
- `rates` table migration (unit, category, cost, markup)
- Rates CRUD (desktop)
- Search and filter
- Driver-to-rate mapping for Quick Estimate formulas

**Do not build rates CRUD until Phase 2 Quick Estimate foundation defines driver requirements.**

---

## Assemblies module (Phase 4 — not yet built)

Planned capabilities:
- `assemblies` and `assembly_items` table migrations
- Assemblies CRUD (desktop)
- Assembly expansion into line items (Detailed Estimate) and bundled pricing (Quick Estimate)

**Do not build assemblies until rates library exists (Phase 3).**

---

## Detailed Estimate module (Phase 5 — not yet built)

Planned capabilities:
- Estimate UI on project and scope pages
- Create estimate sections per scope
- Add estimate items (manual, from rates, from assemblies, from allowances)
- Quantity × rate calculations with constraint application
- Section and project subtotals
- Markup and margin settings
- Estimate status workflow (`not_started` → `draft` → `review` → `complete`)

**Do not build Detailed Estimate until rates and assemblies exist (Phases 3–4).**

---

## AI Question Engine (Phase 6 — not yet built)

Planned capabilities:
- OpenAI integration (server-side only)
- `ai_scope_runs` workflow (trigger, status, confidence)
- AI-generated scope questions (`scope_questions`)
- Builder answer flow (`scope_answers`)
- Driver extraction and scope item suggestions (approve/reject)
- Photo analysis (scope photos → descriptions/measurements)

**Hard rule: AI never returns or sets dollar amounts. Do not call OpenAI or build AI UI until Phase 6.**

---

## RFQ module (Phase 7 — not yet built)

Planned capabilities:
- Package scope trades for subcontractor pricing
- `subcontractors` table migration (name, trade, contact)
- Send RFQ emails (Resend)
- Track responses and attach to Detailed Estimate

Foundation table: `rfq_packages` (exists, read-only RLS).

**Do not build RFQ sending until Phase 7.**

---

## Quote module (Phase 8 — not yet built)

Planned capabilities:
- Roll up Detailed Estimate into project quote
- Quote builder UI (desktop)
- Generate PDF quote document
- Track quote status on project (`quote_status`)
- Quote versioning (draft → sent → accepted/declined)

**Do not build PDF generation until Phase 8.**

---

## Environment variables

| Variable | Scope | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Public | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only | Admin operations (avoid in app code) |
| `OPENAI_API_KEY` | Server only | Phase 6+ |
| `RESEND_API_KEY` | Server only | Phase 7+ |

---

## Deployment

- **Production:** Vercel, connected to GitHub.
- **Database:** Supabase hosted Postgres.
- **Migrations:** Apply via Supabase CLI or SQL editor before deploying app changes that depend on new schema.
- **Build gate:** `npm run build` must pass before every deploy.

---

## Security summary

1. RLS on every table — no exceptions.
2. Anon key only in client code.
3. Service role key never in client code or git.
4. Organisation scoping on every query.
5. Zod validation on every mutation.
6. Storage paths scoped by organisation ID.
7. AI responses never parsed for pricing — pricing engine only.
