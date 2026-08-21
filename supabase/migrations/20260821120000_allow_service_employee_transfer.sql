-- Allow the server-side employee deletion flow to transfer checklist items.
-- Employee assignment remains immutable for normal authenticated clients.
create or replace function public.guard_checklist_item_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.created_at is distinct from old.created_at then
    raise exception 'Checklist item creation timestamp is immutable';
  end if;

  if new.template_id <> old.template_id
    or new.task <> old.task
    or new.due_date <> old.due_date
    or new.due_at <> old.due_at
    or (
      new.employee_id <> old.employee_id
      and current_user <> 'service_role'
      and coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role'
    ) then
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
