-- Allow the template synchronization trigger to update only the assignment
-- fields it owns, while retaining the checklist-item guard for direct writes.
-- Completed and deactivated occurrences remain immutable history.

create or replace function public.guard_checklist_item_update()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  is_service_role boolean := current_user in ('service_role', 'postgres', 'supabase_admin')
    or coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role';
  is_template_sync boolean := pg_trigger_depth() > 1
    and current_user in ('service_role', 'postgres', 'supabase_admin');
begin
  if new.created_at is distinct from old.created_at then
    raise exception 'Checklist item creation timestamp is immutable';
  end if;

  -- No internal workflow is allowed to move an occurrence to another
  -- template or scheduled date.
  if new.template_id is distinct from old.template_id
    or new.due_date is distinct from old.due_date then
    raise exception 'Checklist item assignment and schedule are immutable';
  end if;

  -- Task text and due timestamp may change only as a nested write from the
  -- SECURITY DEFINER template synchronization trigger.
  if (
      new.task is distinct from old.task
      or new.due_at is distinct from old.due_at
    ) and not is_template_sync then
    raise exception 'Checklist item assignment and schedule are immutable';
  end if;

  -- Employee transfer is also used by trusted server-side employee cleanup.
  if new.employee_id is distinct from old.employee_id
    and not (is_template_sync or is_service_role) then
    raise exception 'Checklist item assignment and schedule are immutable';
  end if;

  if old.status = 'completed' and new.status <> 'completed' and not is_service_role then
    raise exception 'Completed checklist items cannot be reopened';
  end if;

  if auth.uid() is not null and not is_service_role then
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
set search_path = ''
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
      due_at = ((public.checklist_items.due_date::text || ' ' || new.due_time::text)::timestamp at time zone 'Asia/Kolkata'),
      status = case
        when ((public.checklist_items.due_date::text || ' ' || new.due_time::text)::timestamp at time zone 'Asia/Kolkata') < now() then 'overdue'
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

revoke all on function public.sync_open_checklist_items_on_template_update()
  from public, anon, authenticated, service_role;
