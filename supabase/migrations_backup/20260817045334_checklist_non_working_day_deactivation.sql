-- Preserve generated checklist history while allowing individual occurrences
-- to be deactivated for non-working days.
alter table public.checklist_items
  drop constraint if exists checklist_items_status_check;

alter table public.checklist_items
  add constraint checklist_items_status_check
  check (status in ('pending', 'completed', 'overdue', 'deactivated'));

alter table public.checklist_items
  drop constraint if exists checklist_items_completion_fields;

alter table public.checklist_items
  add constraint checklist_items_completion_fields check (
    (status = 'completed' and completed_at is not null and completed_by is not null)
    or (status in ('pending', 'overdue', 'deactivated') and completed_at is null and completed_by is null)
  );

create table if not exists public.national_holidays(
  id uuid primary key default gen_random_uuid(),
  holiday_date date not null,
  name text not null check (char_length(trim(name)) between 1 and 160),
  country text not null default 'India' check (char_length(trim(country)) between 2 and 80),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (holiday_date, country)
);

-- Extend the legacy holiday shape, when present, without replacing its data.
alter table public.national_holidays add column if not exists country_code text;
alter table public.national_holidays add column if not exists active boolean;
alter table public.national_holidays add column if not exists country text;
alter table public.national_holidays add column if not exists is_active boolean;
alter table public.national_holidays add column if not exists updated_at timestamptz;

update public.national_holidays
set country = coalesce(nullif(trim(country), ''), case when upper(trim(country_code)) = 'IN' then 'India' else nullif(trim(country_code), '') end, 'India')
where country is null or trim(country) = '';

update public.national_holidays
set is_active = coalesce(is_active, active, true)
where is_active is null;

update public.national_holidays
set updated_at = coalesce(updated_at, created_at, now())
where updated_at is null;

alter table public.national_holidays alter column country set default 'India';
alter table public.national_holidays alter column country set not null;
alter table public.national_holidays alter column is_active set default true;
alter table public.national_holidays alter column is_active set not null;
alter table public.national_holidays alter column updated_at set default now();
alter table public.national_holidays alter column updated_at set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.national_holidays'::regclass
      and conname = 'national_holidays_holiday_date_country_key'
  ) then
    alter table public.national_holidays
      add constraint national_holidays_holiday_date_country_key unique (holiday_date, country);
  end if;
end $$;

create table if not exists public.employee_leave_periods(
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  start_date date not null,
  end_date date not null,
  status text not null default 'approved' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  reason text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint employee_leave_periods_date_range check (end_date >= start_date)
);

-- Older leave records may be single-day records without an end date.
alter table public.employee_leave_periods add column if not exists end_date date;
update public.employee_leave_periods set end_date = start_date where end_date is null;
alter table public.employee_leave_periods alter column end_date set not null;
alter table public.employee_leave_periods add column if not exists updated_at timestamptz;
update public.employee_leave_periods set updated_at = coalesce(created_at, now()) where updated_at is null;
alter table public.employee_leave_periods alter column updated_at set default now();
alter table public.employee_leave_periods alter column updated_at set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.employee_leave_periods'::regclass
      and conname = 'employee_leave_periods_date_range'
  ) then
    alter table public.employee_leave_periods
      add constraint employee_leave_periods_date_range check (end_date >= start_date);
  end if;
end $$;

create table if not exists public.checklist_non_working_day_operations(
  id uuid primary key default gen_random_uuid(),
  selected_date date not null,
  performed_by uuid not null references public.employees(id) on delete restrict,
  matched_count integer not null default 0 check (matched_count >= 0),
  deactivated_count integer not null default 0 check (deactivated_count >= 0),
  reason text not null,
  created_at timestamptz not null default now()
);

create index if not exists national_holidays_date_idx
  on public.national_holidays(holiday_date, country, is_active);
create index if not exists employee_leave_periods_lookup_idx
  on public.employee_leave_periods(employee_id, start_date, end_date, status);
create index if not exists checklist_non_working_day_operations_date_idx
  on public.checklist_non_working_day_operations(selected_date, created_at desc);

-- Seed commonly used India national holidays without overwriting an existing
-- company decision. Administrators can disable any record in the master.
insert into public.national_holidays(holiday_date, name, country, is_active)
values
  ('2026-01-26', 'Republic Day', 'India', true),
  ('2026-08-15', 'Independence Day', 'India', true),
  ('2026-10-02', 'Gandhi Jayanti', 'India', true)
on conflict (holiday_date, country) do nothing;

alter table public.national_holidays enable row level security;
alter table public.employee_leave_periods enable row level security;
alter table public.checklist_non_working_day_operations enable row level security;

grant select, insert, update, delete on public.national_holidays to authenticated;
grant select, insert, update, delete on public.employee_leave_periods to authenticated;
grant select on public.checklist_non_working_day_operations to authenticated;
grant all on public.national_holidays to service_role;
grant all on public.employee_leave_periods to service_role;
grant all on public.checklist_non_working_day_operations to service_role;

drop policy if exists "national holidays read" on public.national_holidays;
create policy "national holidays read" on public.national_holidays
  for select to authenticated using (true);

drop policy if exists "national holidays manage" on public.national_holidays;
drop policy if exists "national holidays insert" on public.national_holidays;
drop policy if exists "national holidays update" on public.national_holidays;
drop policy if exists "national holidays delete" on public.national_holidays;
create policy "national holidays insert" on public.national_holidays
  for insert to authenticated
  with check (exists (
    select 1 from public.employees
    where auth_user_id = auth.uid()
      and role in ('super_admin', 'ea')
  ));
create policy "national holidays update" on public.national_holidays
  for update to authenticated
  using (exists (
    select 1 from public.employees
    where auth_user_id = auth.uid()
      and role in ('super_admin', 'ea')
  ))
  with check (exists (
    select 1 from public.employees
    where auth_user_id = auth.uid()
      and role in ('super_admin', 'ea')
  ));
create policy "national holidays delete" on public.national_holidays
  for delete to authenticated
  using (exists (
    select 1 from public.employees
    where auth_user_id = auth.uid()
      and role in ('super_admin', 'ea')
  ));

drop policy if exists "employee leave read" on public.employee_leave_periods;
create policy "employee leave read" on public.employee_leave_periods
  for select to authenticated
  using (
    public.is_manager()
    or employee_id = (select id from public.employees where auth_user_id = auth.uid())
  );

drop policy if exists "employee leave manage" on public.employee_leave_periods;
drop policy if exists "employee leave insert" on public.employee_leave_periods;
drop policy if exists "employee leave update" on public.employee_leave_periods;
drop policy if exists "employee leave delete" on public.employee_leave_periods;
create policy "employee leave insert" on public.employee_leave_periods
  for insert to authenticated
  with check (public.is_manager());
create policy "employee leave update" on public.employee_leave_periods
  for update to authenticated
  using (public.is_manager())
  with check (public.is_manager());
create policy "employee leave delete" on public.employee_leave_periods
  for delete to authenticated
  using (public.is_manager());

drop policy if exists "non-working-day operations read" on public.checklist_non_working_day_operations;
create policy "non-working-day operations read" on public.checklist_non_working_day_operations
  for select to authenticated using (public.is_manager());

create or replace function public.deactivate_checklist_items_for_non_working_day(
  p_date date,
  p_item_ids uuid[],
  p_performed_by uuid,
  p_reason text
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  matched_count integer := 0;
  deactivated_count integer := 0;
  deactivated_items jsonb := '[]'::jsonb;
  operation_id uuid;
begin
  select count(*)::integer into matched_count
  from public.checklist_items
  where id = any(coalesce(p_item_ids, '{}'::uuid[]))
    and due_date = p_date
    and status in ('pending', 'overdue');

  with changed as (
    update public.checklist_items
    set status = 'deactivated'
    where id = any(coalesce(p_item_ids, '{}'::uuid[]))
      and due_date = p_date
      and status in ('pending', 'overdue')
    returning id, employee_id, task
  )
  select count(*)::integer,
         coalesce(jsonb_agg(jsonb_build_object('id', id, 'employee_id', employee_id, 'task', task)), '[]'::jsonb)
    into deactivated_count, deactivated_items
  from changed;

  insert into public.checklist_non_working_day_operations(
    selected_date, performed_by, matched_count, deactivated_count, reason
  )
  values (p_date, p_performed_by, matched_count, deactivated_count, p_reason)
  returning id into operation_id;

  return jsonb_build_object(
    'operation_id', operation_id,
    'matched_count', matched_count,
    'deactivated_count', deactivated_count,
    'deactivated_items', deactivated_items
  );
end;
$$;

revoke all on function public.deactivate_checklist_items_for_non_working_day(date, uuid[], uuid, text)
  from public, anon, authenticated;
grant execute on function public.deactivate_checklist_items_for_non_working_day(date, uuid[], uuid, text)
  to service_role;
