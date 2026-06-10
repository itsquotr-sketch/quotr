# Migration Steps — Sprint 2A

Apply migrations in order before deploying Sprint 2A code.

## Prerequisites

- Supabase CLI installed (`npm install` includes `supabase` devDependency)
- Access to the Supabase project dashboard or CLI linked project

## Migration order

| # | File | Purpose |
|---|---|---|
| 001 | `001_initial_schema.sql` | Organisations, profiles, legacy site_visits |
| 002 | `002_clients.sql` | Clients table |
| 003 | `003_projects_and_scopes.sql` | Projects, scopes, capture, future estimate tables |
| 004 | `004_onboarding_fields.sql` | Organisation onboarding columns |
| 005 | `005_align_jobs_schema.sql` | Legacy — may reference `jobs` if present |
| 006 | `006_project_scope_builder_inputs.sql` | Scope builder inputs |
| 007 | `007_project_scope_suggestions.sql` | Scope suggestions |
| 008 | `008_ensure_project_scope_suggestions.sql` | Idempotent suggestions ensure |
| 009 | `009_rename_jobs_to_projects.sql` | **Rename `jobs` → `projects`, `job_id` → `project_id`** |
| 010 | `010_future_tables_crud_rls.sql` | CRUD RLS on estimate/RFQ/AI tables |
| 012 | `012_repair_live_schema.sql` | **One-shot live DB repair** — helper function, jobs→projects, RLS standardization |
| 013 | `013_quick_estimate_foundation.sql` | Quick estimates, estimate drivers, RLS |
| 014 | `014_project_estimate_driver_values.sql` | Constraint values for Project Assistant |
| 015 | `015_project_discovery_runs.sql` | Discovery Engine run storage (Sprint 2D) |
| 016 | `016_rate_library_foundation.sql` | Rate library tables and pricing settings (Sprint 3A) |
| 017 | `017_rate_ranges.sql` | Low / typical / high rate ranges (Sprint 3A update) |
| 018–023 | `018`–`023_*.sql` | Scope questions metadata, answer uniques, discovery source, org id on answers |
| 024 | `024_ensure_project_estimate_driver_values.sql` | **Repair** — constraint values table + RLS (fixes PGRST205 on save constraints) |

## RLS helper requirement

All migrations that create RLS policies depend on `public.get_user_organisation_id()` (defined in `001_initial_schema.sql`, re-asserted at the top of `012_repair_live_schema.sql`).

If you see `function public.get_user_organisation_id() does not exist`, run section 0 of `012_repair_live_schema.sql` first, or run the full script.

## URGENT: Fix "Could not find table public.projects" (PGRST205)

Your database has the legacy `jobs` table but the app expects `projects`.

**Option A — SQL Editor (fastest, no CLI):**

1. Open [Supabase SQL Editor](https://supabase.com/dashboard/project/vwejrzdguuzxdgrvcnox/sql/new)
2. Paste the full contents of `supabase/migrations/012_repair_live_schema.sql`
3. Click **Run**
4. Restart `npm run dev` and reload localhost

**Option B — CLI script:**

1. Add to `.env.local` (from Supabase → Settings → Database → Connection string URI):
   ```
   DATABASE_URL=postgresql://postgres.vwejrzdguuzxdgrvcnox:[YOUR-PASSWORD]@aws-0-[region].pooler.supabase.com:6543/postgres
   ```
2. Run: `npm run db:repair`

**Verify after repair:**
```sql
select table_name from information_schema.tables
where table_schema = 'public' and table_name in ('jobs', 'projects');
-- Expected: only 'projects'
```

## Apply via Supabase SQL Editor (manual)

1. Open Supabase Dashboard → SQL Editor.
2. Run each migration file **in numeric order** if not already applied.
3. If unsure which are applied, check:
   ```sql
   select table_name from information_schema.tables
   where table_schema = 'public' and table_name in ('jobs', 'projects');
   ```
4. **Expected result after 009/011:** only `projects` exists (no `jobs`).
5. Verify FK column names:
   ```sql
   select column_name, table_name from information_schema.columns
   where table_schema = 'public' and column_name in ('job_id', 'project_id');
   ```
   **Expected:** only `project_id` columns remain.

## Apply via Supabase CLI (recommended)

```bash
# One-time setup (if not done)
npx supabase init
npx supabase link --project-ref YOUR_PROJECT_REF

# Push all pending migrations
npx supabase db push
```

## Post-migration verification

Run these checks in SQL Editor:

```sql
-- 1. Canonical table name
select exists (
  select 1 from information_schema.tables
  where table_schema = 'public' and table_name = 'projects'
) as has_projects,
exists (
  select 1 from information_schema.tables
  where table_schema = 'public' and table_name = 'jobs'
) as has_jobs;

-- 2. RLS enabled on key tables
select tablename, rowsecurity from pg_tables
where schemaname = 'public'
  and tablename in (
    'projects', 'project_scopes', 'scope_photos', 'scope_documents',
    'estimate_sections', 'estimate_items', 'scope_questions', 'scope_answers',
    'rfq_packages'
  );

-- 3. Policy count per table (should have SELECT + INSERT + UPDATE + DELETE where applicable)
select tablename, count(*) as policy_count
from pg_policies
where schemaname = 'public'
group by tablename
order by tablename;
```

## Rollback notes

- Migrations 009–011 rename tables and add policies — **do not rollback** without a coordinated code revert.
- If `jobs` and `projects` both exist with data, resolve manually before applying 011 (see `011_finalize_projects_naming_and_rls.sql` comments).

## After migrations

1. Deploy application code (expects `projects` / `project_id`).
2. Run `npm run build` locally to confirm env vars are set.
3. Complete manual QA checklist in `docs/06-qa-checklist.md`.
