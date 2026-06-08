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
│   │   └── auth.ts          # Session/profile helpers
│   └── types/
│       └── database.ts      # Generated/manual DB types
├── tailwind.config.ts       # Tailwind content paths
├── postcss.config.mjs         # PostCSS with @tailwindcss/postcss
└── components.json            # Shadcn config
```

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
| `< md` (below 768px) | Mobile: bottom nav, capture-focused, full-width CTAs |
| `≥ md` | Desktop: sidebar, full workspace, tables, multi-column layouts |

### Rules
- `DesktopSidebar`: `hidden md:flex`
- `MobileBottomNav`: `md:hidden`
- Main content: `md:pl-64` to offset sidebar
- Mobile content: `pb-24` to clear bottom nav
- Dashboard content: `max-w-7xl` centred — not phone-width on desktop

### Future native app (Phase 7)
The responsive web app is the foundation. A future native app (React Native or Capacitor) would share the same Supabase backend and API patterns. Do not build native until web foundation is stable.

---

## Module map (current and planned)

| Module | Status | Phase |
|---|---|---|
| Auth + onboarding | Built | Phase 0 |
| App shell + styling | Built | Phase 0 |
| Projects CRUD | Built | Phase 1 |
| Scopes + capture (photos, docs, measurements) | Built | Phase 1 |
| Rates library | Placeholder page | Phase 2 |
| Assemblies library | Placeholder page | Phase 2 |
| Estimate engine | Schema only | Phase 3 |
| AI scope assistant | Schema only | Phase 4 |
| Quote generator | Placeholder page | Phase 5 |
| Subcontractor RFQs | Schema only | Phase 6 |
| PWA / native mobile | Not started | Phase 7 |
| Integrations / payments | Not started | Phase 8 |

---

## AI module (Phase 4 — not yet built)

Planned capabilities:
- Analyse scope photos, notes, and measurements
- Generate clarifying questions (`scope_questions`)
- Suggest estimate line items
- Track runs in `ai_scope_runs` with confidence scores

**Do not call OpenAI or build AI UI until Phase 4.**

---

## RFQ module (Phase 6 — not yet built)

Planned capabilities:
- Package scope trades for subcontractor pricing
- Send RFQ emails (Resend)
- Track responses and attach to estimate

Foundation table: `rfq_packages` (exists, read-only RLS).

**Do not build RFQ sending until Phase 6.**

---

## Quote module (Phase 5 — not yet built)

Planned capabilities:
- Roll up scope estimates into project quote
- Generate PDF quote document
- Track quote status on project (`quote_status`)

**Do not build PDF generation until Phase 5.**

---

## Environment variables

| Variable | Scope | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Public | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only | Admin operations (avoid in app code) |
| `OPENAI_API_KEY` | Server only | Phase 4+ |
| `RESEND_API_KEY` | Server only | Phase 6+ |

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
