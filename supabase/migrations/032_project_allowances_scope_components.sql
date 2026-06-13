-- Sprint 10A: User-editable project allowances + component rate foundation

create table if not exists public.project_allowances (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  project_scope_id uuid references public.project_scopes (id) on delete set null,
  allowance_key text not null,
  label text not null,
  amount numeric(12, 2) not null,
  source text not null default 'user',
  note text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, project_scope_id, allowance_key)
);

create index if not exists project_allowances_project_id_idx
  on public.project_allowances (project_id);

create index if not exists project_allowances_organisation_id_idx
  on public.project_allowances (organisation_id);

drop trigger if exists project_allowances_updated_at on public.project_allowances;
create trigger project_allowances_updated_at
  before update on public.project_allowances
  for each row execute function public.set_updated_at();

alter table public.project_allowances enable row level security;

create policy "Users can view org project allowances"
  on public.project_allowances for select
  using (organisation_id = public.get_user_organisation_id());

create policy "Users can create org project allowances"
  on public.project_allowances for insert
  with check (
    organisation_id = public.get_user_organisation_id()
    and exists (
      select 1 from public.projects p
      where p.id = project_id
        and p.organisation_id = public.get_user_organisation_id()
    )
  );

create policy "Users can update org project allowances"
  on public.project_allowances for update
  using (organisation_id = public.get_user_organisation_id());

create policy "Users can delete org project allowances"
  on public.project_allowances for delete
  using (organisation_id = public.get_user_organisation_id());

-- Component rate foundation (system catalogue)
create table if not exists public.scope_components (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid references public.organisations (id) on delete cascade,
  scope_type_key text not null,
  component_key text not null,
  label text not null,
  default_unit text not null,
  default_quantity_formula text,
  default_rate_type text,
  is_system boolean not null default true,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (scope_type_key, component_key, organisation_id)
);

create index if not exists scope_components_scope_type_key_idx
  on public.scope_components (scope_type_key);

drop trigger if exists scope_components_updated_at on public.scope_components;
create trigger scope_components_updated_at
  before update on public.scope_components
  for each row execute function public.set_updated_at();

alter table public.scope_components enable row level security;

create policy "Users can view scope components"
  on public.scope_components for select
  using (
    organisation_id is null
    or organisation_id = public.get_user_organisation_id()
  );

create policy "Users can create org scope components"
  on public.scope_components for insert
  with check (
    organisation_id = public.get_user_organisation_id()
  );

create policy "Users can update org scope components"
  on public.scope_components for update
  using (organisation_id = public.get_user_organisation_id());

create policy "Users can delete org scope components"
  on public.scope_components for delete
  using (organisation_id = public.get_user_organisation_id());

-- Seed system scope components
insert into public.scope_components (
  organisation_id,
  scope_type_key,
  component_key,
  label,
  default_unit,
  default_quantity_formula,
  default_rate_type,
  is_system,
  is_active
) values
  (null, 'bathroom-renovation', 'demolition', 'Demolition', 'm²', 'floor_area_m2', 'labour', true, true),
  (null, 'bathroom-renovation', 'waterproofing', 'Waterproofing', 'm²', 'wet_area_m2', 'subcontractor', true, true),
  (null, 'bathroom-renovation', 'floor_tiling', 'Floor tiling', 'm²', 'floor_area_m2', 'subcontractor', true, true),
  (null, 'bathroom-renovation', 'wall_tiling', 'Wall tiling', 'm²', 'wall_tile_area_m2', 'subcontractor', true, true),
  (null, 'bathroom-renovation', 'plumbing_allowance', 'Plumbing allowance', 'each', null, 'allowance', true, true),
  (null, 'bathroom-renovation', 'electrical_allowance', 'Electrical allowance', 'each', null, 'allowance', true, true),
  (null, 'bathroom-renovation', 'fixtures_allowance', 'Fixtures allowance', 'each', null, 'allowance', true, true),
  (null, 'bathroom-renovation', 'rubbish_removal', 'Rubbish removal', 'each', null, 'allowance', true, true),
  (null, 'deck', 'substructure_labour', 'Substructure labour', 'm²', 'deck_area_m2', 'labour', true, true),
  (null, 'deck', 'decking_boards', 'Decking boards', 'm²', 'deck_area_m2', 'material', true, true),
  (null, 'deck', 'fixings', 'Fixings', 'm²', 'deck_area_m2', 'material', true, true),
  (null, 'deck', 'stairs', 'Stairs', 'each', null, 'labour', true, true),
  (null, 'deck', 'balustrade', 'Balustrade', 'm', 'balustrade_length_m', 'subcontractor', true, true),
  (null, 'deck', 'rubbish_removal', 'Rubbish removal', 'each', null, 'allowance', true, true),
  (null, 'retaining-wall', 'excavation', 'Excavation', 'm³', 'excavation_volume_m3', 'labour', true, true),
  (null, 'retaining-wall', 'wall_material', 'Wall material', 'm²', 'wall_face_area_m2', 'material', true, true),
  (null, 'retaining-wall', 'drainage', 'Drainage', 'm', 'wall_length_m', 'subcontractor', true, true),
  (null, 'retaining-wall', 'backfill', 'Backfill', 'm³', 'backfill_volume_m3', 'labour', true, true),
  (null, 'retaining-wall', 'spoil_removal', 'Spoil removal', 'each', null, 'allowance', true, true),
  (null, 'retaining-wall', 'engineering_allowance', 'Engineering allowance', 'each', null, 'allowance', true, true)
on conflict do nothing;
