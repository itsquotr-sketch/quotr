-- Sprint 2B: Quick Estimate foundation — tables, RLS, system estimate drivers

-- ---------------------------------------------------------------------------
-- quick_estimates
-- ---------------------------------------------------------------------------
create table if not exists public.quick_estimates (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  status text not null default 'draft',
  source_notes text,
  estimated_cost_low numeric(12, 2),
  estimated_cost_high numeric(12, 2),
  recommended_sell_low numeric(12, 2),
  recommended_sell_high numeric(12, 2),
  target_margin_percent numeric(6, 2),
  expected_margin_percent numeric(6, 2),
  confidence_level text not null default 'medium',
  budget_fit text default 'unknown',
  client_budget numeric(12, 2),
  notes text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint quick_estimates_status_check check (
    status in (
      'draft',
      'in_progress',
      'ready',
      'presented',
      'accepted_to_quote',
      'declined',
      'archived'
    )
  ),
  constraint quick_estimates_confidence_level_check check (
    confidence_level in ('low', 'medium', 'high')
  ),
  constraint quick_estimates_budget_fit_check check (
    budget_fit in ('unknown', 'below_budget', 'within_budget', 'above_budget')
  )
);

create index if not exists quick_estimates_organisation_id_idx
  on public.quick_estimates (organisation_id);

create index if not exists quick_estimates_project_id_idx
  on public.quick_estimates (project_id);

create unique index if not exists quick_estimates_project_id_active_idx
  on public.quick_estimates (project_id)
  where status not in ('archived', 'declined');

drop trigger if exists quick_estimates_updated_at on public.quick_estimates;
create trigger quick_estimates_updated_at
  before update on public.quick_estimates
  for each row execute function public.set_updated_at();

alter table public.quick_estimates enable row level security;

create policy "Users can view org quick estimates"
  on public.quick_estimates for select
  using (organisation_id = public.get_user_organisation_id());

create policy "Users can create org quick estimates"
  on public.quick_estimates for insert
  with check (
    organisation_id = public.get_user_organisation_id()
    and exists (
      select 1 from public.projects p
      where p.id = project_id
        and p.organisation_id = public.get_user_organisation_id()
    )
  );

create policy "Users can update org quick estimates"
  on public.quick_estimates for update
  using (organisation_id = public.get_user_organisation_id());

create policy "Users can delete org quick estimates"
  on public.quick_estimates for delete
  using (organisation_id = public.get_user_organisation_id());

-- ---------------------------------------------------------------------------
-- quick_estimate_answers
-- ---------------------------------------------------------------------------
create table if not exists public.quick_estimate_answers (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  quick_estimate_id uuid not null references public.quick_estimates (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  question_key text not null,
  question_text text not null,
  answer jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint quick_estimate_answers_unique_question
    unique (quick_estimate_id, question_key)
);

create index if not exists quick_estimate_answers_organisation_id_idx
  on public.quick_estimate_answers (organisation_id);

create index if not exists quick_estimate_answers_project_id_idx
  on public.quick_estimate_answers (project_id);

create index if not exists quick_estimate_answers_quick_estimate_id_idx
  on public.quick_estimate_answers (quick_estimate_id);

drop trigger if exists quick_estimate_answers_updated_at on public.quick_estimate_answers;
create trigger quick_estimate_answers_updated_at
  before update on public.quick_estimate_answers
  for each row execute function public.set_updated_at();

alter table public.quick_estimate_answers enable row level security;

create policy "Users can view org quick estimate answers"
  on public.quick_estimate_answers for select
  using (organisation_id = public.get_user_organisation_id());

create policy "Users can create org quick estimate answers"
  on public.quick_estimate_answers for insert
  with check (
    organisation_id = public.get_user_organisation_id()
    and exists (
      select 1 from public.quick_estimates qe
      where qe.id = quick_estimate_id
        and qe.organisation_id = public.get_user_organisation_id()
    )
  );

create policy "Users can update org quick estimate answers"
  on public.quick_estimate_answers for update
  using (organisation_id = public.get_user_organisation_id());

create policy "Users can delete org quick estimate answers"
  on public.quick_estimate_answers for delete
  using (organisation_id = public.get_user_organisation_id());

-- ---------------------------------------------------------------------------
-- estimate_driver_categories
-- ---------------------------------------------------------------------------
create table if not exists public.estimate_driver_categories (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid references public.organisations (id) on delete cascade,
  name text not null,
  slug text not null,
  description text,
  is_system boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists estimate_driver_categories_organisation_id_idx
  on public.estimate_driver_categories (organisation_id);

create unique index if not exists estimate_driver_categories_system_slug_idx
  on public.estimate_driver_categories (slug)
  where organisation_id is null and is_system = true;

drop trigger if exists estimate_driver_categories_updated_at
  on public.estimate_driver_categories;
create trigger estimate_driver_categories_updated_at
  before update on public.estimate_driver_categories
  for each row execute function public.set_updated_at();

alter table public.estimate_driver_categories enable row level security;

create policy "Users can view estimate driver categories"
  on public.estimate_driver_categories for select
  using (
    organisation_id is null
    or organisation_id = public.get_user_organisation_id()
  );

create policy "Users can create org estimate driver categories"
  on public.estimate_driver_categories for insert
  with check (organisation_id = public.get_user_organisation_id());

create policy "Users can update org estimate driver categories"
  on public.estimate_driver_categories for update
  using (organisation_id = public.get_user_organisation_id());

create policy "Users can delete org estimate driver categories"
  on public.estimate_driver_categories for delete
  using (organisation_id = public.get_user_organisation_id());

-- ---------------------------------------------------------------------------
-- estimate_drivers
-- ---------------------------------------------------------------------------
create table if not exists public.estimate_drivers (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid references public.organisations (id) on delete cascade,
  category_id uuid references public.estimate_driver_categories (id) on delete cascade,
  name text not null,
  slug text not null,
  description text,
  multiplier numeric(8, 4) not null default 1.0000,
  fixed_allowance numeric(12, 2) not null default 0,
  labour_modifier_percent numeric(8, 2) not null default 0,
  is_system boolean not null default false,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists estimate_drivers_organisation_id_idx
  on public.estimate_drivers (organisation_id);

create index if not exists estimate_drivers_category_id_idx
  on public.estimate_drivers (category_id);

create unique index if not exists estimate_drivers_system_slug_category_idx
  on public.estimate_drivers (category_id, slug)
  where organisation_id is null and is_system = true;

drop trigger if exists estimate_drivers_updated_at on public.estimate_drivers;
create trigger estimate_drivers_updated_at
  before update on public.estimate_drivers
  for each row execute function public.set_updated_at();

alter table public.estimate_drivers enable row level security;

create policy "Users can view estimate drivers"
  on public.estimate_drivers for select
  using (
    organisation_id is null
    or organisation_id = public.get_user_organisation_id()
  );

create policy "Users can create org estimate drivers"
  on public.estimate_drivers for insert
  with check (organisation_id = public.get_user_organisation_id());

create policy "Users can update org estimate drivers"
  on public.estimate_drivers for update
  using (organisation_id = public.get_user_organisation_id());

create policy "Users can delete org estimate drivers"
  on public.estimate_drivers for delete
  using (organisation_id = public.get_user_organisation_id());

-- ---------------------------------------------------------------------------
-- project_estimate_drivers
-- ---------------------------------------------------------------------------
create table if not exists public.project_estimate_drivers (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  quick_estimate_id uuid references public.quick_estimates (id) on delete cascade,
  estimate_driver_id uuid not null references public.estimate_drivers (id) on delete cascade,
  notes text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint project_estimate_drivers_unique_driver
    unique (quick_estimate_id, estimate_driver_id)
);

create index if not exists project_estimate_drivers_organisation_id_idx
  on public.project_estimate_drivers (organisation_id);

create index if not exists project_estimate_drivers_project_id_idx
  on public.project_estimate_drivers (project_id);

create index if not exists project_estimate_drivers_quick_estimate_id_idx
  on public.project_estimate_drivers (quick_estimate_id);

alter table public.project_estimate_drivers enable row level security;

create policy "Users can view org project estimate drivers"
  on public.project_estimate_drivers for select
  using (organisation_id = public.get_user_organisation_id());

create policy "Users can create org project estimate drivers"
  on public.project_estimate_drivers for insert
  with check (
    organisation_id = public.get_user_organisation_id()
    and exists (
      select 1 from public.projects p
      where p.id = project_id
        and p.organisation_id = public.get_user_organisation_id()
    )
  );

create policy "Users can update org project estimate drivers"
  on public.project_estimate_drivers for update
  using (organisation_id = public.get_user_organisation_id());

create policy "Users can delete org project estimate drivers"
  on public.project_estimate_drivers for delete
  using (organisation_id = public.get_user_organisation_id());

-- ---------------------------------------------------------------------------
-- Seed system estimate driver categories and drivers
-- ---------------------------------------------------------------------------
insert into public.estimate_driver_categories (
  organisation_id, name, slug, description, is_system, sort_order
)
select v.organisation_id, v.name, v.slug, v.description, v.is_system, v.sort_order
from (
  values
    (null::uuid, 'Access', 'access', 'Site access and material handling', true, 1),
    (null::uuid, 'Site Conditions', 'site-conditions', 'Working environment constraints', true, 2),
    (null::uuid, 'Finish Level', 'finish-level', 'Expected quality and specification level', true, 3),
    (null::uuid, 'Complexity', 'complexity', 'Overall job complexity', true, 4),
    (null::uuid, 'Programme', 'programme', 'Timing and scheduling constraints', true, 5)
) as v(organisation_id, name, slug, description, is_system, sort_order)
where not exists (
  select 1 from public.estimate_driver_categories c
  where c.slug = v.slug and c.organisation_id is null and c.is_system = true
);

-- Access drivers
insert into public.estimate_drivers (
  organisation_id, category_id, name, slug, description,
  multiplier, fixed_allowance, labour_modifier_percent, is_system, sort_order
)
select
  null,
  c.id,
  v.name,
  v.slug,
  v.description,
  v.multiplier,
  v.fixed_allowance,
  v.labour_modifier_percent,
  true,
  v.sort_order
from public.estimate_driver_categories c
cross join (
  values
    ('Standard Access', 'standard-access', 'Normal site access', 1.0000::numeric, 0::numeric, 0::numeric, 1),
    ('10m Carting Distance', '10m-carting', 'Materials carted up to 10 metres', 1.0500, 500, 0, 2),
    ('20m Carting Distance', '20m-carting', 'Materials carted up to 20 metres', 1.1000, 1000, 0, 3),
    ('Stairs / Level Change', 'stairs-level-change', 'Multi-level or stair access', 1.1500, 750, 5, 4),
    ('Tight Access', 'tight-access', 'Restricted access paths', 1.2000, 1000, 8, 5),
    ('Machinery Access Limited', 'machinery-access-limited', 'Plant or machinery access restricted', 1.1000, 800, 5, 6)
) as v(name, slug, description, multiplier, fixed_allowance, labour_modifier_percent, sort_order)
where c.slug = 'access' and c.organisation_id is null
  and not exists (
    select 1 from public.estimate_drivers d
    where d.category_id = c.id and d.slug = v.slug and d.is_system = true
  );

-- Site Conditions drivers
insert into public.estimate_drivers (
  organisation_id, category_id, name, slug, description,
  multiplier, fixed_allowance, labour_modifier_percent, is_system, sort_order
)
select
  null,
  c.id,
  v.name,
  v.slug,
  v.description,
  v.multiplier,
  v.fixed_allowance,
  v.labour_modifier_percent,
  true,
  v.sort_order
from public.estimate_driver_categories c
cross join (
  values
    ('Normal Site', 'normal-site', 'Standard working conditions', 1.0000::numeric, 0::numeric, 0::numeric, 1),
    ('Occupied House', 'occupied-house', 'Work in occupied residential property', 1.1000, 500, 5, 2),
    ('Live Commercial Site', 'live-commercial', 'Active commercial premises', 1.1500, 1000, 8, 3),
    ('Restricted Working Hours', 'restricted-hours', 'Limited working hours', 1.1200, 800, 10, 4),
    ('Poor Parking', 'poor-parking', 'Difficult parking or loading', 1.0800, 400, 3, 5),
    ('Protection Required', 'protection-required', 'Extra protection of finishes or contents', 1.1000, 600, 5, 6)
) as v(name, slug, description, multiplier, fixed_allowance, labour_modifier_percent, sort_order)
where c.slug = 'site-conditions' and c.organisation_id is null
  and not exists (
    select 1 from public.estimate_drivers d
    where d.category_id = c.id and d.slug = v.slug and d.is_system = true
  );

-- Finish Level drivers
insert into public.estimate_drivers (
  organisation_id, category_id, name, slug, description,
  multiplier, fixed_allowance, labour_modifier_percent, is_system, sort_order
)
select
  null,
  c.id,
  v.name,
  v.slug,
  v.description,
  v.multiplier,
  v.fixed_allowance,
  v.labour_modifier_percent,
  true,
  v.sort_order
from public.estimate_driver_categories c
cross join (
  values
    ('Budget', 'budget', 'Entry-level finishes and fixtures', 0.8500::numeric, 0::numeric, 0::numeric, 1),
    ('Standard', 'standard', 'Mid-range typical specification', 1.0000, 0, 0, 2),
    ('Premium', 'premium', 'Higher-end finishes and fixtures', 1.2500, 0, 5, 3),
    ('Architectural', 'architectural', 'Architect-designed high specification', 1.5000, 0, 10, 4)
) as v(name, slug, description, multiplier, fixed_allowance, labour_modifier_percent, sort_order)
where c.slug = 'finish-level' and c.organisation_id is null
  and not exists (
    select 1 from public.estimate_drivers d
    where d.category_id = c.id and d.slug = v.slug and d.is_system = true
  );

-- Complexity drivers
insert into public.estimate_drivers (
  organisation_id, category_id, name, slug, description,
  multiplier, fixed_allowance, labour_modifier_percent, is_system, sort_order
)
select
  null,
  c.id,
  v.name,
  v.slug,
  v.description,
  v.multiplier,
  v.fixed_allowance,
  v.labour_modifier_percent,
  true,
  v.sort_order
from public.estimate_driver_categories c
cross join (
  values
    ('Simple', 'simple', 'Straightforward scope with few variables', 0.9000::numeric, 0::numeric, 0::numeric, 1),
    ('Moderate', 'moderate', 'Typical complexity', 1.0000, 0, 0, 2),
    ('Complex', 'complex', 'Multiple trades or structural unknowns', 1.2500, 1500, 10, 3),
    ('Unknown / Needs Review', 'unknown-needs-review', 'Scope unclear — allow contingency', 1.1000, 1000, 5, 4)
) as v(name, slug, description, multiplier, fixed_allowance, labour_modifier_percent, sort_order)
where c.slug = 'complexity' and c.organisation_id is null
  and not exists (
    select 1 from public.estimate_drivers d
    where d.category_id = c.id and d.slug = v.slug and d.is_system = true
  );

-- Programme drivers
insert into public.estimate_drivers (
  organisation_id, category_id, name, slug, description,
  multiplier, fixed_allowance, labour_modifier_percent, is_system, sort_order
)
select
  null,
  c.id,
  v.name,
  v.slug,
  v.description,
  v.multiplier,
  v.fixed_allowance,
  v.labour_modifier_percent,
  true,
  v.sort_order
from public.estimate_driver_categories c
cross join (
  values
    ('Normal Programme', 'normal-programme', 'Standard timeline', 1.0000::numeric, 0::numeric, 0::numeric, 1),
    ('Urgent Turnaround', 'urgent-turnaround', 'Compressed programme', 1.1500, 1000, 15, 2),
    ('Staged Works', 'staged-works', 'Work split across phases', 1.0800, 500, 5, 3),
    ('After Hours Required', 'after-hours', 'Out-of-hours work required', 1.2000, 1500, 20, 4)
) as v(name, slug, description, multiplier, fixed_allowance, labour_modifier_percent, sort_order)
where c.slug = 'programme' and c.organisation_id is null
  and not exists (
    select 1 from public.estimate_drivers d
    where d.category_id = c.id and d.slug = v.slug and d.is_system = true
  );
