-- Bring existing open occurrences up to date with their current template.
-- Completed occurrences are retained as immutable history.

create or replace function public.guard_checklist_item_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.created_at is distinct from old.created_at then
    raise exception 'Checklist item creation timestamp is immutable';
  end if;

  if current_user not in ('service_role', 'postgres', 'supabase_admin')
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

  if current_user not in ('service_role', 'postgres', 'supabase_admin')
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

update public.checklist_items item
set employee_id = template.employee_id,
    task = template.task,
    due_at = ((item.due_date::text || ' ' || template.due_time::text)::timestamp at time zone 'Asia/Kolkata'),
    status = case
      when ((item.due_date::text || ' ' || template.due_time::text)::timestamp at time zone 'Asia/Kolkata') < now() then 'overdue'
      else 'pending'
    end
from public.checklist_templates template
where template.id = item.template_id
  and item.status in ('pending', 'overdue')
  and item.completed_at is null;
