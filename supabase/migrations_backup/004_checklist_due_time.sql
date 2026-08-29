-- Add timezone-aware due times without rewriting generated checklist history.
alter table public.checklist_templates
  add column if not exists due_time time;

update public.checklist_templates
set due_time = '17:00:00'
where due_time is null;

alter table public.checklist_templates
  alter column due_time set default '17:00:00',
  alter column due_time set not null;

-- Older templates did not require a start date. Use their first generated date
-- when available, otherwise the current business date, so existing schedules
-- remain valid under the new invariant.
update public.checklist_templates template
set start_date = coalesce(
  template.start_date,
  (select min(item.due_date) from public.checklist_items item where item.template_id = template.id),
  (now() at time zone 'Asia/Kolkata')::date
)
where template.start_date is null;

alter table public.checklist_templates
  drop constraint if exists checklist_templates_schedule_fields;

alter table public.checklist_templates
  add constraint checklist_templates_schedule_fields check (
    start_date is not null
    and due_time is not null
    and (
      (frequency = 'daily' and weekday is null and day_of_month is null)
      or (frequency = 'weekly' and weekday is not null and day_of_month is null)
      or (frequency = 'every_15_days' and weekday is null and day_of_month is null)
      or (frequency = 'monthly' and weekday is null and day_of_month is not null)
    )
  );

alter table public.checklist_items
  add column if not exists due_at timestamptz;

update public.checklist_items item
set due_at = ((item.due_date::text || ' ' || template.due_time::text)::timestamp at time zone 'Asia/Kolkata')
from public.checklist_templates template
where template.id = item.template_id
  and item.due_at is null;

alter table public.checklist_items
  alter column due_at set not null;

create index if not exists checklist_items_employee_due_at_idx
  on public.checklist_items(employee_id, due_at desc);
create index if not exists checklist_items_status_due_at_idx
  on public.checklist_items(status, due_at);

-- Managers retain full template access; employees can read only the template
-- attached to their own generated items so details can show recurrence safely.
drop policy if exists "checklist templates managers read" on public.checklist_templates;
create policy "checklist templates managers read" on public.checklist_templates
  for select to authenticated using (
    public.is_manager()
    or employee_id = (select id from public.employees where auth_user_id = auth.uid())
  );

create or replace function public.guard_checklist_item_update()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.created_at is distinct from old.created_at then
    raise exception 'Checklist item creation timestamp is immutable';
  end if;

  if new.template_id <> old.template_id
    or new.employee_id <> old.employee_id
    or new.task <> old.task
    or new.due_date <> old.due_date
    or new.due_at <> old.due_at then
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
