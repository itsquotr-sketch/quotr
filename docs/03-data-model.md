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

> **Naming:** The legacy `jobs` table has been renamed to `projects` (migration 009). All foreign keys use `project_id`. Do not reference `jobs` or `job_id` in new code.

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

**UI label:** Confirmed Work Area (or "work area"). Code table name remains `project_scopes`.

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
| `scope_questions` | Questions posed about a scope (`question`, `question_key`, `question_type`, `options`, `unit`) |
| `scope_answers` | Builder's answers (`organisation_id`, `answer` JSON text, `source`: `user` \| `discovery`) |

**Answer JSON format** (stored in `answer` text column):

```json
{ "value": "10", "unit": "m", "source": "discovery", "updatedAt": "2026-06-09T12:00:00.000Z" }
```

Unique on `(project_scope_id, scope_question_id)`. Discovery facts sync into `scope_answers` via `syncDiscoveryFactsToScopeAnswers()` — user edits overwrite discovery values.

---

## Future tables (schema exists, features not built)

### `estimate_sections` and `estimate_items`

Estimate structure. No top-level `estimates` table yet — sections link directly to projects and optionally scopes.

```
projects
└── estimate_sections (project_id, optional project_scope_id)
    └── estimate_items (estimate_section_id, optional project_scope_id)
```

**Sprint 6** will build the Detailed Estimate engine on these tables.

### Quick Estimate vs Detailed Estimate (data model)

| | Quick Estimate | Detailed Estimate |
|---|---|---|
| Sprint | 2–3 | 6 |
| UI | Project Assistant summary card | Dedicated estimate workspace |
| Storage | `quick_estimates`, drivers, answers | `estimate_sections` → `estimate_items` |
| Pricing source | Drivers + constraints + rates/assemblies | Line items from rates, assemblies, allowances |

### Project Assistant (UI vs schema)

| User-facing | Internal table |
|---|---|
| Project notes | `project_scope_builder_inputs` |
| Identified work areas | `project_scope_suggestions` |
| Confirmed work areas | `project_scopes` |
| Targeted questions | `scope_questions`, `scope_answers` |
| Discovery runs | `project_discovery_runs` (work areas, facts, constraints, questions, trades as JSONB) |
| Quick estimate | `quick_estimates`, `project_estimate_drivers`, `project_estimate_driver_values` |

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

### `project_discovery_runs` (legacy snapshot)

Discovery Engine output persisted per analyse run (Sprint 2D). Still written for backward compatibility.

| Column | Notes |
|---|---|
| `organisation_id` | FK — RLS scoped |
| `project_id` | FK to `projects` |
| `source_notes` | Combined notes analysed |
| `provider` | e.g. `rule-based`, `openai` |
| `provider_version` | Provider semver |
| `work_areas`, `facts`, `questions`, `constraints`, `trades` | JSONB arrays |

### `discovery_runs` (canonical — Sprint 3F)

Full discovery run log. Prepares for AI provider swap.

| Column | Notes |
|---|---|
| `organisation_id` | FK — RLS scoped |
| `project_id` | FK to `projects` |
| `input_text` | Combined notes analysed |
| `input_hash` | SHA-256 of `input_text` (dedup / audit) |
| `provider` | Default `rule_based`; future `openai` |
| `model` | AI model name when applicable |
| `prompt_version` | Default `rule_based_v1` |
| `raw_output` | Provider JSON (unmodified) |
| `parsed_output` | Normalised `DiscoveryResult` JSON |
| `status` | `pending`, `running`, `completed`, `failed` |
| `error_message` | Failure detail |
| `created_by` | FK to `profiles` |

### `discovery_outputs` (structured — Sprint 3F)

One row per discovered item. Linked to `discovery_runs`.

| Column | Notes |
|---|---|
| `discovery_run_id` | FK to `discovery_runs` |
| `output_type` | `work_area`, `fact`, `question`, `constraint`, `trade`, `risk`, `assumption` |
| `output_key` | Stable key (e.g. constraint slug, fact key) |
| `title` | Human label |
| `content` | Full item JSONB |
| `confidence` | `numeric(5,2)` — required for AI runs |
| `status` | `pending`, `accepted`, `rejected`, `converted` |

### Constraint persistence (Sprint 3F)

User-selected constraints in Project Assistant:

| Table | Role |
|---|---|
| `project_estimate_drivers` | Links selected `estimate_drivers` rows (when constraint maps to a system driver) |
| `project_estimate_driver_values` | Stores `constraint_key` + JSON `value` (`selected`, `metres`, `severity`, `description`) |

Loaded by `loadSavedProjectConstraints()`; fed into Quick Estimate via `buildQuickEstimateInput()`.

#### Quick estimate finish level (Sprint 4A.1)

`quick_estimates.quality_level` stores the builder-confirmed client budget / finish level:

| Value | Meaning |
|---|---|
| `budget` | Budget / basic specification |
| `standard` | Standard / mid-range (default assumptions) |
| `premium` | Premium / high-end specification |
| `unknown` | Not confirmed — wider estimate range |

AI Discovery may detect finish level from notes (`qualityLevel` in discovery output), but the builder confirms or overrides in Project Assistant Step 4. Pricing remains grounded in rates/fallback benchmarks — AI does not invent final pricing.

### Rate library (Sprint 3A)

Organisation-scoped pricing — each contractor defines their own rates.

#### `labour_rates`

| Column | Notes |
|---|---|
| `organisation_id` | FK — RLS scoped |
| `name` | e.g. Carpenter, Leading Hand |
| `category` | Optional grouping |
| `cost_rate`, `charge_rate` | numeric(12,2) |
| `unit` | Default `hour` |
| `is_active` | Soft disable |

#### `subcontractor_rates`

| Column | Notes |
|---|---|
| `trade` | e.g. Plumber, Electrician |
| `description` | Optional |
| `cost_rate`, `charge_rate` | Legacy typical values |
| `low_cost_rate`, `typical_cost_rate`, `high_cost_rate` | Cost range |
| `low_charge_rate`, `typical_charge_rate`, `high_charge_rate` | Charge range |
| `default_confidence` | `low`, `medium`, `high` |
| `unit` | Default `hour` |

#### `material_rates`

| Column | Notes |
|---|---|
| `material_name` | e.g. 90x45 Timber |
| `category`, `supplier` | Optional |
| `cost_rate`, `charge_rate` | numeric(12,2) |
| `unit` | Default `each` |

#### `package_rates`

| Column | Notes |
|---|---|
| `package_name` | e.g. Timber Deck, Bathroom Standard |
| `work_area_type` | Links to discovery work area types |
| `base_cost`, `base_sell` | Legacy typical values |
| `low_base_cost`, `typical_base_cost`, `high_base_cost` | Cost range |
| `low_base_sell`, `typical_base_sell`, `high_base_sell` | Sell range |
| `default_margin` | Optional percent |

#### `organisation_pricing_settings`

One row per organisation (PK = `organisation_id`).

| Column | Default |
|---|---|
| `default_margin_percent` | 20 |
| `contingency_percent` | 5 |
| `gst_percent` | 15 |
| `currency` | NZD |

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

## RLS helper function

All policies use **`public.get_user_organisation_id()`** — defined in `001_initial_schema.sql` and re-asserted in `012_repair_live_schema.sql` for live databases.

`public.current_org_id()` is a deprecated alias that delegates to `get_user_organisation_id()`. Do not use it in new policies.

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
