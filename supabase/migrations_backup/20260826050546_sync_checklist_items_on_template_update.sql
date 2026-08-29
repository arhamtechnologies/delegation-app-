-- Keep open generated checklist occurrences in sync with edits to their
-- recurring template. Completed occurrences remain immutable history.

create or replace function public.guard_checklist_item_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.created_at is distinct from old.created_at then
    raise exception 'Checklist item creation timestamp is immutable';
  end if;

  if current_user <> 'service_role'
    and coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role'
    and (
      new.template_id <> old.template_id
      or new.employee_id <> old.employee_id
      or new.task <> old.task
      or new.due_date <> old.due_date
      or new.due_at <> old.due_at
    ) then
    raise exception 'Checklist item assignment and schedule are immutable';
  end if;

  if old.status = 'completed' and new.status <> 'completed' then
    raise exception 'Completed checklist items cannot be reopened';
  end if;

  if current_user <> 'service_role'
    and coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role'
    and auth.uid() is not null then
    if new.status <> 'completed' then
      raise exception 'Employees can only complete checklist items';
    end if;
    new.completed_at = now();
    new.completed_by = auth.uid();
  end if;

  return new;
end;
$$;

create or replace function public.sync_open_checklist_items_on_template_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.employee_id is not distinct from new.employee_id
    and old.task is not distinct from new.task
    and old.due_time is not distinct from new.due_time then
    return new;
  end if;

  update public.checklist_items
  set employee_id = new.employee_id,
      task = new.task,
      due_at = ((checklist_items.due_date::text || ' ' || new.due_time::text)::timestamp at time zone 'Asia/Kolkata'),
      status = case
        when ((checklist_items.due_date::text || ' ' || new.due_time::text)::timestamp at time zone 'Asia/Kolkata') < now() then 'overdue'
        else 'pending'
      end
  where template_id = new.id
    and status in ('pending', 'overdue')
    and completed_at is null;

  return new;
end;
$$;

drop trigger if exists checklist_template_sync_items on public.checklist_templates;
create trigger checklist_template_sync_items
after update on public.checklist_templates
for each row execute function public.sync_open_checklist_items_on_template_update();

revoke all on function public.sync_open_checklist_items_on_template_update() from public;
