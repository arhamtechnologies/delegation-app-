create table if not exists public.checklist_templates(
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete restrict,
  task text not null check (char_length(trim(task)) between 1 and 240),
  frequency text not null check (frequency in ('daily','weekly','every_15_days','monthly')),
  weekday smallint check (weekday between 0 and 6),
  day_of_month smallint check (day_of_month between 1 and 31),
  start_date date,
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint checklist_templates_schedule_fields check (
    (frequency = 'daily' and weekday is null and day_of_month is null and start_date is null)
    or (frequency = 'weekly' and weekday is not null and day_of_month is null and start_date is null)
    or (frequency = 'every_15_days' and weekday is null and day_of_month is null and start_date is not null)
    or (frequency = 'monthly' and weekday is null and day_of_month is not null and start_date is null)
  )
);

create table if not exists public.checklist_items(
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.checklist_templates(id) on delete restrict,
  employee_id uuid not null references public.employees(id) on delete restrict,
  task text not null check (char_length(trim(task)) between 1 and 240),
  due_date date not null,
  status text not null default 'pending' check (status in ('pending','completed','overdue')),
  completed_at timestamptz,
  completed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint checklist_items_completion_fields check (
    (status = 'completed' and completed_at is not null and completed_by is not null)
    or (status in ('pending','overdue') and completed_at is null and completed_by is null)
  )
);

create unique index if not exists checklist_items_template_due_date_key
  on public.checklist_items(template_id, due_date);
create index if not exists checklist_templates_employee_active_idx
  on public.checklist_templates(employee_id, active);
create index if not exists checklist_items_employee_due_date_idx
  on public.checklist_items(employee_id, due_date desc);
create index if not exists checklist_items_status_due_date_idx
  on public.checklist_items(status, due_date);

alter table public.checklist_templates enable row level security;
alter table public.checklist_items enable row level security;

grant select, insert, update, delete on public.checklist_templates to authenticated;
grant select, update on public.checklist_items to authenticated;

drop policy if exists "checklist templates managers read" on public.checklist_templates;
create policy "checklist templates managers read" on public.checklist_templates
  for select to authenticated using (public.is_manager());

drop policy if exists "checklist templates managers create" on public.checklist_templates;
create policy "checklist templates managers create" on public.checklist_templates
  for insert to authenticated
  with check (public.is_manager() and created_by = auth.uid());

drop policy if exists "checklist templates managers update" on public.checklist_templates;
create policy "checklist templates managers update" on public.checklist_templates
  for update to authenticated
  using (public.is_manager())
  with check (public.is_manager());

drop policy if exists "checklist templates managers delete" on public.checklist_templates;
create policy "checklist templates managers delete" on public.checklist_templates
  for delete to authenticated using (public.is_manager());

drop policy if exists "checklist items read" on public.checklist_items;
create policy "checklist items read" on public.checklist_items
  for select to authenticated
  using (
    public.is_manager()
    or employee_id = (select id from public.employees where auth_user_id = auth.uid())
  );

drop policy if exists "checklist items complete own" on public.checklist_items;
create policy "checklist items complete own" on public.checklist_items
  for update to authenticated
  using (employee_id = (select id from public.employees where auth_user_id = auth.uid()))
  with check (
    employee_id = (select id from public.employees where auth_user_id = auth.uid())
    and status = 'completed'
    and completed_by = auth.uid()
  );

create or replace function public.set_checklist_template_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists checklist_template_updated_at on public.checklist_templates;
create trigger checklist_template_updated_at
before update on public.checklist_templates
for each row execute function public.set_checklist_template_updated_at();

create or replace function public.guard_checklist_item_update()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.created_at is distinct from old.created_at then
    raise exception 'Checklist item creation timestamp is immutable';
  end if;

  if new.template_id <> old.template_id
    or new.employee_id <> old.employee_id
    or new.task <> old.task
    or new.due_date <> old.due_date then
    raise exception 'Checklist item assignment and schedule are immutable';
  end if;

  if old.status = 'completed' and new.status <> 'completed' then
    raise exception 'Completed checklist items cannot be reopened';
  end if;

  if auth.uid() is not null then
    if new.status <> 'completed' then
      raise exception 'Employees can only complete checklist items';
    end if;
    new.completed_at = now();
    new.completed_by = auth.uid();
  end if;

  return new;
end;
$$;

drop trigger if exists checklist_item_update_guard on public.checklist_items;
create trigger checklist_item_update_guard
before update on public.checklist_items
for each row execute function public.guard_checklist_item_update();
