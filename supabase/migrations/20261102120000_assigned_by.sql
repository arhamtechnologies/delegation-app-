-- Show who assigned each task (and recurring checklist) in the app: "Ankit Jain → Varun".
-- Run BEFORE deploying the code that reads assigned_by_name from the work lists. Safe to run again.
--   * tasks.assigned_by_name / checklist_templates.assigned_by_name already exist (20261029120000,
--     20261031090000) and are filled by the WhatsApp bot, where several director numbers share one login.
--   * App-created rows get the creator's name automatically (the WhatsApp display name linked to that login,
--     else the employee name, as the alerts already do); existing rows are filled the same way. Updating only
--     these columns fires no notification or item sync. Signed-in users can't change them afterwards.
--   * work_items and follow_up_work_items gain assigned_by_name as their last column.

-- The name the WhatsApp alerts already use for a login: its linked display name (the shared Administrator
-- login's number is Ankit Jain's, see 20261029120000), otherwise the employee name.
create or replace function public.assigner_display_name(p_auth_user_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(nullif(trim(link.display_name), ''), e.name)
  from public.employees e
  left join public.wa_chat_links link on link.chat_id = e.whatsapp_chat_id
  where e.auth_user_id = p_auth_user_id
  limit 1;
$$;
revoke all on function public.assigner_display_name(uuid) from public, anon, authenticated;

create or replace function public.set_assigned_by_name()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    -- Who assigned it is fixed once created; only trusted backends (no signed-in user) may correct it.
    if auth.uid() is not null then
      new.assigned_by_name := old.assigned_by_name;
      new.assigned_by_chat_id := old.assigned_by_chat_id;
    end if;
    return new;
  end if;
  -- A signed-in app user is always recorded as themselves; trusted backends (the WhatsApp bot) may name the
  -- director who actually sent the message, otherwise the creating login is used.
  if auth.uid() is not null then
    new.assigned_by_name := public.assigner_display_name(auth.uid());
    new.assigned_by_chat_id := null;
  elsif coalesce(trim(new.assigned_by_name), '') = '' then
    new.assigned_by_name := public.assigner_display_name(new.created_by);
  end if;
  return new;
end;
$$;
revoke all on function public.set_assigned_by_name() from public, anon, authenticated;

drop trigger if exists task_assigned_by_name on public.tasks;
create trigger task_assigned_by_name
before insert or update of assigned_by_name, assigned_by_chat_id on public.tasks
for each row execute function public.set_assigned_by_name();

drop trigger if exists checklist_template_assigned_by_name on public.checklist_templates;
create trigger checklist_template_assigned_by_name
before insert or update of assigned_by_name, assigned_by_chat_id on public.checklist_templates
for each row execute function public.set_assigned_by_name();

-- Existing rows: filled from the login that created them (runs with no signed-in user, so the trigger allows it).
update public.tasks
set assigned_by_name = public.assigner_display_name(created_by)
where coalesce(trim(assigned_by_name), '') = '' and created_by is not null;

update public.checklist_templates
set assigned_by_name = public.assigner_display_name(created_by)
where coalesce(trim(assigned_by_name), '') = '' and created_by is not null;

-- Same as 20261024061358_optimize_work_list_queries.sql, plus assigned_by_name at the end.
create or replace view public.work_items
with (security_invoker = true)
as
select
  t.id,
  'task'::text as kind,
  t.title,
  t.description,
  t.priority::text as priority,
  coalesce(t.category, 'General') as category,
  t.assignee_id as employee_id,
  e.name as employee_name,
  e.email as employee_email,
  lower(concat_ws(' ', t.title, t.description, coalesce(t.category, 'General'), e.name, e.email)) as search_text,
  t.eta as scheduled_at,
  (t.eta at time zone 'Asia/Kolkata')::date as scheduled_date,
  t.eta,
  null::date as due_date,
  null::timestamptz as due_at,
  t.status::text as source_status,
  case
    when t.status::text in ('closed', 'not_required') or t.completed_at is not null then 'completed'
    when t.eta < now() then 'overdue'
    else 'pending'
  end::text as effective_status,
  t.completed_at,
  t.created_at,
  null::uuid as template_id,
  null::text as checklist_frequency,
  case
    when (t.eta at time zone 'Asia/Kolkata')::date = (now() at time zone 'Asia/Kolkata')::date then 0
    when (t.eta at time zone 'Asia/Kolkata')::date > (now() at time zone 'Asia/Kolkata')::date then 1
    else 2
  end::smallint as sort_group,
  case
    when (t.eta at time zone 'Asia/Kolkata')::date < (now() at time zone 'Asia/Kolkata')::date
      then -extract(epoch from t.eta)
    else extract(epoch from t.eta)
  end as sort_key,
  t.assigned_by_name
from public.tasks t
left join public.employees e on e.id = t.assignee_id

union all

select
  i.id,
  'checklist'::text as kind,
  i.task as title,
  'Recurring checklist item'::text as description,
  'normal'::text as priority,
  'Checklist'::text as category,
  i.employee_id,
  e.name as employee_name,
  e.email as employee_email,
  lower(concat_ws(' ', i.task, 'Recurring checklist item', 'Checklist', e.name, e.email)) as search_text,
  coalesce(i.due_at, i.due_date::timestamp at time zone 'Asia/Kolkata') as scheduled_at,
  i.due_date as scheduled_date,
  null::timestamptz as eta,
  i.due_date,
  i.due_at,
  i.status::text as source_status,
  case
    when i.status = 'completed' or i.completed_at is not null then 'completed'
    when coalesce(i.due_at < now(), i.due_date < (now() at time zone 'Asia/Kolkata')::date) then 'overdue'
    else 'pending'
  end::text as effective_status,
  i.completed_at,
  i.created_at,
  i.template_id,
  template.frequency as checklist_frequency,
  case
    when i.due_date = (now() at time zone 'Asia/Kolkata')::date then 0
    when i.due_date > (now() at time zone 'Asia/Kolkata')::date then 1
    else 2
  end::smallint as sort_group,
  case
    when i.due_date < (now() at time zone 'Asia/Kolkata')::date
      then -extract(epoch from coalesce(i.due_at, i.due_date::timestamp at time zone 'Asia/Kolkata'))
    else extract(epoch from coalesce(i.due_at, i.due_date::timestamp at time zone 'Asia/Kolkata'))
  end as sort_key,
  template.assigned_by_name
from public.checklist_items i
left join public.employees e on e.id = i.employee_id
left join public.checklist_templates template on template.id = i.template_id
where i.status <> 'deactivated';

revoke all on public.work_items from anon;
grant select on public.work_items to authenticated;

-- Same as 20261027150000_follow_up_work_items.sql, plus assigned_by_name at the end.
create or replace view public.follow_up_work_items
with (security_invoker = true)
as
select
  t.id,
  'task'::text as kind,
  t.title,
  t.description,
  t.priority::text as priority,
  coalesce(t.category, 'General') as category,
  t.assignee_id as employee_id,
  e.name as employee_name,
  e.email as employee_email,
  t.eta as scheduled_at,
  t.eta,
  null::date as due_date,
  null::timestamptz as due_at,
  t.status::text as source_status,
  t.completed_at,
  t.created_at,
  null::uuid as template_id,
  null::text as checklist_frequency,
  t.assigned_by_name
from public.tasks t
left join public.employees e on e.id = t.assignee_id
where t.eta is not null
  and (
    extract(isodow from (t.eta at time zone 'Asia/Kolkata')::date) = 7
    or exists (
      select 1 from public.national_holidays holiday
      where holiday.country = 'India' and holiday.is_active
        and holiday.holiday_date = (t.eta at time zone 'Asia/Kolkata')::date
    )
  )

union all

select
  i.id,
  'checklist'::text as kind,
  i.task as title,
  'Recurring checklist item'::text as description,
  'normal'::text as priority,
  'Checklist'::text as category,
  i.employee_id,
  e.name as employee_name,
  e.email as employee_email,
  coalesce(i.due_at, i.due_date::timestamp at time zone 'Asia/Kolkata') as scheduled_at,
  null::timestamptz as eta,
  i.due_date,
  i.due_at,
  i.status::text as source_status,
  i.completed_at,
  i.created_at,
  i.template_id,
  template.frequency as checklist_frequency,
  template.assigned_by_name
from public.checklist_items i
left join public.employees e on e.id = i.employee_id
join public.checklist_templates template on template.id = i.template_id
where template.frequency in ('weekly', 'every_15_days', 'monthly')
  and i.due_date is not null
  and (
    extract(isodow from i.due_date) = 7
    or exists (
      select 1 from public.national_holidays holiday
      where holiday.country = 'India' and holiday.is_active and holiday.holiday_date = i.due_date
    )
  );

revoke all on public.follow_up_work_items from anon;
grant select on public.follow_up_work_items to authenticated;
