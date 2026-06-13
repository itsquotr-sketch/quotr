-- Fix legacy check constraints left over from renamed `jobs` table.
-- Aligns enquiry_source, priority, and status with application constants.

-- Normalise any invalid legacy values before adding constraints
update public.projects
set enquiry_source = 'other'
where enquiry_source is null
   or btrim(enquiry_source) = ''
   or enquiry_source not in (
     'site_visit',
     'phone_call',
     'email',
     'website',
     'plans_specs',
     'referral',
     'other'
   );

update public.projects
set priority = 'normal'
where priority is null
   or priority not in ('low', 'normal', 'high', 'urgent');

update public.projects
set status = 'new'
where status is null
   or status not in (
     'new',
     'lead',
     'captured',
     'scoping',
     'estimating',
     'waiting_on_subbies',
     'ready_to_quote',
     'quoted',
     'won',
     'lost',
     'archived',
     'enquiry',
     'quoting',
     'on_hold'
   );

-- enquiry_source
alter table public.projects drop constraint if exists jobs_enquiry_source_check;
alter table public.projects drop constraint if exists projects_enquiry_source_check;

alter table public.projects
  add constraint projects_enquiry_source_check check (
    enquiry_source in (
      'site_visit',
      'phone_call',
      'email',
      'website',
      'plans_specs',
      'referral',
      'other'
    )
  );

-- priority
alter table public.projects drop constraint if exists jobs_priority_check;
alter table public.projects drop constraint if exists projects_priority_check;

alter table public.projects
  add constraint projects_priority_check check (
    priority in ('low', 'normal', 'high', 'urgent')
  );

-- status (lifecycle)
alter table public.projects drop constraint if exists jobs_status_check;
alter table public.projects drop constraint if exists projects_status_check;

alter table public.projects
  add constraint projects_status_check check (
    status in (
      'new',
      'lead',
      'captured',
      'scoping',
      'estimating',
      'waiting_on_subbies',
      'ready_to_quote',
      'quoted',
      'won',
      'lost',
      'archived',
      -- legacy values kept for existing rows
      'enquiry',
      'quoting',
      'on_hold'
    )
  );
