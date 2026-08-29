-- Direct non-working-day configuration for checklist occurrences.
-- This migration deliberately leaves the legacy employee_leave_periods model
-- untouched; the checklist feature now uses explicit employee/date records.

create table if not exists public.employee_non_working_days(
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  non_working_date date not null,
  reason text not null default 'employee_leave' check (reason = 'employee_leave'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  constraint employee_non_working_days_unique unique (employee_id, non_working_date, reason)
);

create index if not exists employee_non_working_days_lookup_idx
  on public.employee_non_working_days(employee_id, non_working_date, reason);

alter table public.employee_non_working_days enable row level security;
grant select, insert, update, delete on public.employee_non_working_days to authenticated;
grant all on public.employee_non_working_days to service_role;

drop policy if exists "employee non-working days read" on public.employee_non_working_days;
create policy "employee non-working days read" on public.employee_non_working_days
  for select to authenticated
  using (exists (
    select 1 from public.employees
    where auth_user_id = auth.uid()
      and role in ('super_admin', 'ea')
  ));

drop policy if exists "employee non-working days insert" on public.employee_non_working_days;
create policy "employee non-working days insert" on public.employee_non_working_days
  for insert to authenticated
  with check (exists (
    select 1 from public.employees
    where auth_user_id = auth.uid()
      and role in ('super_admin', 'ea')
  ));

drop policy if exists "employee non-working days update" on public.employee_non_working_days;
create policy "employee non-working days update" on public.employee_non_working_days
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

drop policy if exists "employee non-working days delete" on public.employee_non_working_days;
create policy "employee non-working days delete" on public.employee_non_working_days
  for delete to authenticated
  using (exists (
    select 1 from public.employees
    where auth_user_id = auth.uid()
      and role in ('super_admin', 'ea')
  ));

-- The live project contains a legacy national_holidays shape. Extend it in
-- place so existing records remain available to the new checklist API.
create table if not exists public.national_holidays(
  id uuid primary key default gen_random_uuid(),
  holiday_date date not null,
  name text not null,
  country text not null default 'India',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (holiday_date, country)
);

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

create index if not exists national_holidays_direct_lookup_idx
  on public.national_holidays(holiday_date, country, is_active);

alter table public.national_holidays enable row level security;
grant select, insert, update, delete on public.national_holidays to authenticated;
grant all on public.national_holidays to service_role;

drop policy if exists "national holidays read" on public.national_holidays;
drop policy if exists "national holidays manage" on public.national_holidays;
drop policy if exists "national holidays insert" on public.national_holidays;
drop policy if exists "national holidays update" on public.national_holidays;
drop policy if exists "national holidays delete" on public.national_holidays;
create policy "national holidays read" on public.national_holidays
  for select to authenticated using (true);
create policy "national holidays insert" on public.national_holidays
  for insert to authenticated
  with check (exists (select 1 from public.employees where auth_user_id = auth.uid() and role in ('super_admin', 'ea')));
create policy "national holidays update" on public.national_holidays
  for update to authenticated
  using (exists (select 1 from public.employees where auth_user_id = auth.uid() and role in ('super_admin', 'ea')))
  with check (exists (select 1 from public.employees where auth_user_id = auth.uid() and role in ('super_admin', 'ea')));
create policy "national holidays delete" on public.national_holidays
  for delete to authenticated
  using (exists (select 1 from public.employees where auth_user_id = auth.uid() and role in ('super_admin', 'ea')));

insert into public.national_holidays(holiday_date, name, country, is_active)
values
  ('2026-01-26', 'Republic Day', 'India', true),
  ('2026-08-15', 'Independence Day', 'India', true),
  ('2026-10-02', 'Gandhi Jayanti', 'India', true)
on conflict (holiday_date, country) do nothing;

-- Reuse the existing audit table/function when the earlier non-working-day
-- migration has already been applied; create the same contract otherwise.
create table if not exists public.checklist_non_working_day_operations(
  id uuid primary key default gen_random_uuid(),
  selected_date date not null,
  performed_by uuid not null references public.employees(id) on delete restrict,
  matched_count integer not null default 0 check (matched_count >= 0),
  deactivated_count integer not null default 0 check (deactivated_count >= 0),
  reason text not null,
  created_at timestamptz not null default now()
);

create index if not exists checklist_non_working_day_operations_date_idx
  on public.checklist_non_working_day_operations(selected_date, created_at desc);

alter table public.checklist_non_working_day_operations enable row level security;
grant select on public.checklist_non_working_day_operations to authenticated;
grant all on public.checklist_non_working_day_operations to service_role;

drop policy if exists "non-working-day operations read" on public.checklist_non_working_day_operations;
create policy "non-working-day operations read" on public.checklist_non_working_day_operations
  for select to authenticated using (exists (
    select 1 from public.employees
    where auth_user_id = auth.uid()
      and role in ('super_admin', 'ea')
  ));

create or replace function public.save_employee_non_working_dates(
  p_employee_id uuid,
  p_dates date[],
  p_created_by uuid
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  saved_count integer := 0;
begin
  delete from public.employee_non_working_days
  where employee_id = p_employee_id
    and reason = 'employee_leave'
    and not (non_working_date = any(coalesce(p_dates, '{}'::date[])));

  insert into public.employee_non_working_days(employee_id, non_working_date, reason, created_by)
  select p_employee_id, selected_date, 'employee_leave', p_created_by
  from unnest(coalesce(p_dates, '{}'::date[])) as selected_date
  on conflict (employee_id, non_working_date, reason)
  do update set updated_at = now(), created_by = excluded.created_by;

  select count(*)::integer into saved_count
  from public.employee_non_working_days
  where employee_id = p_employee_id
    and reason = 'employee_leave';

  return jsonb_build_object('employee_id', p_employee_id, 'saved_count', saved_count);
end;
$$;

create or replace function public.deactivate_sunday_checklist_items()
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  deactivated_count integer := 0;
begin
  update public.checklist_items
  set status = 'deactivated'
  where status in ('pending', 'overdue')
    and extract(dow from due_date) = 0;
  get diagnostics deactivated_count = row_count;
  return deactivated_count;
end;
$$;

revoke all on function public.save_employee_non_working_dates(uuid, date[], uuid)
  from public, anon, authenticated;
grant execute on function public.save_employee_non_working_dates(uuid, date[], uuid)
  to service_role;

revoke all on function public.deactivate_sunday_checklist_items()
  from public, anon, authenticated;
grant execute on function public.deactivate_sunday_checklist_items()
  to service_role;
