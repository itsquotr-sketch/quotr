# Quotr Data Model

**Status:** Source of truth for database schema and relationships.

Migrations live in `supabase/migrations/`. Types live in `src/types/database.ts`.

---

## Entity relationship overview

```
organisations
├── profiles (users)
├── clients
└── projects
    ├── project_scopes
    │   ├── scope_types (reference)
    │   ├── scope_measurements
    │   ├── scope_photos
    │   ├── scope_documents
    │   ├── scope_questions
    │   ├── scope_answers
    │   └── ai_scope_runs (future)
    ├── estimate_sections (future)
    │   └── estimate_items (future)
    └── rfq_packages (future)

site_visits (legacy — not top-level workflow)
├── site_visit_measurements
└── site_visit_photos
```

---

## Core tables

### `organisations`

The builder's business. One organisation per user (current model).

| Column | Notes |
|---|---|
| `id` | UUID primary key |
| `name` | Business name |
| `trading_name` | Display name |
| `legal_name` | Legal entity name |
| `business_type` | e.g. company, sole trader |
| `primary_trade` | Main trade |
| `company_size` | Staff count band |
| `quoting_volume` | Quotes per month band |
| `phone`, `email`, `website` | Contact |
| `city`, `region` | Location |

Created via `create_organisation_for_user` RPC during onboarding.

---

### `profiles`

One row per authenticated user, linked to `auth.users`.

| Column | Notes |
|---|---|
| `id` | FK to `auth.users.id` |
| `first_name`, `last_name`, `full_name` | User name |
| `phone`, `job_title` | Contact/role |
| `organisation_id` | FK to `organisations` — null until onboarding |

Auto-created on signup via `handle_new_user` trigger.

---

### `clients`

Optional normalised client records. Projects also store inline client fields for speed.

| Column | Notes |
|---|---|
| `id` | UUID |
| `organisation_id` | FK — RLS scoped |
| `name`, `phone`, `email` | Client contact |

Projects may link via `client_id` or store `client_name` / `client_phone` / `client_email` directly.

---

### `projects` (canonical — the top-level object)

**This is the primary entity.** UI label: "Project". Code table name: `projects`.

> **Note on naming:** Early prototypes used "jobs" and "site visits" as top-level concepts. The canonical table is `projects`. Legacy routes `/jobs` and `/site-visits` redirect to `/projects`. There is no `jobs` table. Do not create one.

| Column | Notes |
|---|---|
| `id` | UUID |
| `organisation_id` | FK — RLS scoped |
| `created_by` | FK to `auth.users` |
| `client_id` | Optional FK to `clients` |
| `title` | Project title |
| `client_name` | Required — inline client name |
| `client_phone`, `client_email` | Optional inline contact |
| `site_address` | Job site address |
| `enquiry_source` | How enquiry arrived (see below) |
| `client_brief` | What the client wants |
| `priority` | `low`, `normal`, `high`, `urgent` |
| `status` | Project lifecycle status |
| `quote_status` | Quote progress |
| `initial_notes` | First impressions, access, timing hints |

#### Enquiry sources (`enquiry_source`)
`site_visit`, `phone_call`, `email`, `website`, `plans_specs`, `referral`, `other`

A **site visit is not a separate top-level object**. It is recorded as `enquiry_source: site_visit` on the project.

#### Project statuses (`status`)
`enquiry` → `scoping` → `estimating` → `quoting` → `won` / `lost` / `on_hold`

---

### `scope_types`

Catalogue of scope categories. System-wide ( `organisation_id = null` ) plus org-specific.

| Column | Notes |
|---|---|
| `id` | UUID |
| `organisation_id` | Null for system types |
| `name` | e.g. "Bathroom renovation" |
| `slug` | URL-safe identifier |
| `description` | Optional |
| `sort_order` | Display order |
| `is_active` | Soft disable |

Seeded types: bathroom, kitchen, deck, internal alteration, roofing, landscaping, electrical, plumbing, painting, fencing, other.

---

### `project_scopes`

A scope of work within a project. **The unit of capture and estimation.**

| Column | Notes |
|---|---|
| `id` | UUID |
| `project_id` | FK to `projects` |
| `organisation_id` | FK — denormalised for RLS |
| `scope_type_id` | FK to `scope_types` (optional) |
| `name` | e.g. "Main bathroom" |
| `description` | Scope description |
| `location_area` | e.g. "Ground floor" |
| `notes` | Free-text notes |
| `status` | Scope lifecycle |
| `ai_status` | AI processing status |
| `ai_confidence` | AI confidence score |
| `estimate_status` | Estimate progress for this scope |
| `is_custom` | True if not from a standard scope type |
| `sort_order` | Display order within project |

#### Scope statuses
`draft` → `capturing` → `ready` → `estimating` → `complete`

---

### `scope_measurements`

Key-value measurements attached to a scope.

| Column | Notes |
|---|---|
| `project_scope_id` | FK |
| `label` | e.g. "Floor area" |
| `value` | e.g. "12.5" |
| `unit` | e.g. "m²" |
| `sort_order` | Display order |

---

### `scope_photos`

Photo metadata. Files stored in `scope-photos` Supabase Storage bucket.

| Column | Notes |
|---|---|
| `project_scope_id` | FK |
| `storage_path` | `{org_id}/{scope_id}/{filename}` |
| `file_name` | Original filename |

---

### `scope_documents`

Document metadata. Files stored in `scope-documents` bucket.

| Column | Notes |
|---|---|
| `project_scope_id` | FK |
| `storage_path` | `{org_id}/{scope_id}/{filename}` |
| `file_name` | Original filename |
| `mime_type` | Optional MIME type |

---

### `scope_questions` and `scope_answers`

Foundation for AI-generated clarifying questions (Phase 4).

| Table | Purpose |
|---|---|
| `scope_questions` | Questions posed about a scope |
| `scope_answers` | Builder's answers to questions |

---

## Future tables (schema exists, features not built)

### `estimate_sections` and `estimate_items`

Estimate structure. No top-level `estimates` table yet — sections link directly to projects and optionally scopes.

```
projects
└── estimate_sections (project_id, optional project_scope_id)
    └── estimate_items (estimate_section_id, optional project_scope_id)
```

**Phase 3** will build the estimate engine on these tables.

### `rfq_packages`

Subcontractor pricing request packages.

| Column | Notes |
|---|---|
| `project_id` | FK |
| `project_scope_id` | Optional — scope-level package |
| `trade_name` | e.g. "Plumbing" |
| `status` | `draft`, `sent`, `received`, etc. |

**Phase 6** will build RFQ workflow.

### `ai_scope_runs`

AI processing run log per scope.

| Column | Notes |
|---|---|
| `project_scope_id` | FK |
| `status` | `pending`, `complete`, `failed` |
| `confidence` | AI confidence score |

**Phase 4** will populate this table.

---

## Planned tables (not yet in schema)

These are referenced in the roadmap but do not exist yet. Create via migration when their phase starts:

| Table | Phase | Purpose |
|---|---|---|
| `rates` | Phase 2 | Unit rates library (labour, materials, plant) |
| `assemblies` | Phase 2 | Pre-built item groups |
| `assembly_items` | Phase 2 | Items within an assembly |
| `subcontractors` | Phase 2 | Subcontractor contacts |
| `estimates` | Phase 3 | Top-level estimate record per project (optional) |
| `quotes` | Phase 5 | Client quote records |
| `quote_line_items` | Phase 5 | Quote line items |

Do not create these tables until their phase is active.

---

## Legacy: `site_visits`

> **Do not use as top-level workflow.**

`site_visits` was the original top-level capture entity. It has been superseded by `projects` with `enquiry_source: site_visit`.

| Table | Status |
|---|---|
| `site_visits` | Exists in DB, deprecated |
| `site_visit_measurements` | Exists, deprecated |
| `site_visit_photos` | Exists, deprecated |

- Routes `/site-visits/*` redirect to `/projects`.
- New capture flows must use `projects` → `project_scopes`.
- Do not build new features on `site_visits`.
- A future migration may archive or remove these tables.

---

## RLS model

All tables have RLS enabled. Standard pattern:

```sql
-- Organisation-scoped tables
using (organisation_id = public.get_user_organisation_id())

-- Child tables (via parent scope)
using (
  exists (
    select 1 from public.project_scopes ps
    where ps.id = project_scope_id
      and ps.organisation_id = public.get_user_organisation_id()
  )
)
```

### Storage RLS
Buckets `scope-photos` and `scope-documents` enforce org-scoped paths:
```
(storage.foldername(name))[1] = get_user_organisation_id()::text
```

---

## Migration rules

1. Number migrations sequentially: `005_*.sql`, `006_*.sql`, etc.
2. Every migration must be idempotent where possible (`if not exists`, `on conflict do nothing`).
3. Every new table: enable RLS + write policies in the same migration.
4. After migration: update `src/types/database.ts`.
5. Never modify existing migrations that have been applied to production.

---

## Status constants

All status enums are defined in `src/lib/constants/projects.ts`. Use `labelFor()` for display labels. Do not hardcode status strings in UI components.
