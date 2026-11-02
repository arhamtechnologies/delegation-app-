-- Directors and the EA choose, per recurring checklist task, whether a proof screenshot is mandatory.
-- Run after 20261031170000_optional_proof_and_checklist.sql. Safe to run again.
--   * checklist_templates.proof_required: false = optional (default, so every existing checklist stays optional).
--   * Generated checklist items follow their template live, so changing a template applies to its open items too.
--   * A checklist item whose template requires proof cannot be completed until it has a proof screenshot.

alter table public.checklist_templates add column if not exists proof_required boolean not null default false;

-- Same view as 20261024061358_optimize_work_list_queries.sql with proof_required added at the end.
create or replace view public.checklist_template_list
with (security_invoker = true)
as
select
  template.id,
  template.employee_id,
  template.task,
  template.frequency,
  template.weekday,
  template.day_of_month,
  template.monthly_days,
  template.start_date,
  template.due_time,
  template.active,
  template.created_at,
  template.updated_at,
  employee.name as employee_name,
  employee.email as employee_email,
  lower(concat_ws(' ', template.task, employee.name, employee.email)) as search_text,
  template.proof_required
from public.checklist_templates template
left join public.employees employee on employee.id = template.employee_id;

revoke all on public.checklist_template_list from anon;
grant select on public.checklist_template_list to authenticated;

create or replace function public.enforce_checklist_completion_proof()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'completed'
     and old.status is distinct from 'completed'
     and exists (select 1 from public.checklist_templates t where t.id = new.template_id and t.proof_required)
     and not exists (
       select 1 from public.checklist_item_updates u
       where u.checklist_item_id = new.id and (u.update_type = 'proof' or u.proof_url is not null)
     ) then
    raise exception 'Add a proof screenshot before completing this checklist item.'
      using errcode = 'P0001', hint = 'proof_required';
  end if;
  return new;
end;
$$;
revoke all on function public.enforce_checklist_completion_proof() from public, anon, authenticated;

drop trigger if exists checklist_completion_proof on public.checklist_items;
create trigger checklist_completion_proof
before update on public.checklist_items
for each row execute function public.enforce_checklist_completion_proof();
