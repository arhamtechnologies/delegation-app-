-- Unified, RLS-aware read models for the task inbox and checklist template list.
-- security_invoker keeps the underlying tasks/checklist/employees policies in force.
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
  end as sort_key
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
  end as sort_key
from public.checklist_items i
left join public.employees e on e.id = i.employee_id
left join public.checklist_templates template on template.id = i.template_id
where i.status <> 'deactivated';

revoke all on public.work_items from anon;
grant select on public.work_items to authenticated;

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
  lower(concat_ws(' ', template.task, employee.name, employee.email)) as search_text
from public.checklist_templates template
left join public.employees employee on employee.id = template.employee_id;

revoke all on public.checklist_template_list from anon;
grant select on public.checklist_template_list to authenticated;

-- MIS aggregates stay in Postgres instead of transferring every historical row.
create or replace function public.get_work_report(
  p_work_type text default 'all',
  p_status text default 'all',
  p_from date default null,
  p_to date default null,
  p_search text default null,
  p_priority text default 'all',
  p_employee_id uuid default null
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with filtered as materialized (
    select work.*
    from public.work_items work
    where (p_work_type = 'all' or work.kind = p_work_type)
      and (p_status = 'all' or work.effective_status = p_status)
      and (p_priority = 'all' or work.priority = p_priority)
      and (p_employee_id is null or work.employee_id = p_employee_id)
      and (p_from is null or work.scheduled_date >= p_from)
      and (p_to is null or work.scheduled_date <= p_to)
      and (
        nullif(trim(p_search), '') is null
        or concat_ws(' ', work.title, work.description, work.category, work.employee_name, work.employee_email)
          ilike '%' || trim(p_search) || '%'
      )
  ), employee_rows as (
    select
      employee_id,
      max(employee_name) as employee_name,
      max(employee_email) as employee_email,
      count(*)::int as total_work,
      count(*) filter (where effective_status = 'pending')::int as pending_work,
      count(*) filter (where effective_status = 'overdue')::int as overdue_work,
      count(*) filter (where effective_status = 'completed')::int as completed_work,
      count(*) filter (where kind = 'task')::int as tasks_work,
      count(*) filter (where kind = 'checklist')::int as checklist_work,
      count(*) filter (
        where effective_status = 'completed'
          and completed_at is not null
          and scheduled_at is not null
          and completed_at <= scheduled_at
      )::int as on_time_work
    from filtered
    group by employee_id
  )
  select jsonb_build_object(
    'summary', jsonb_build_object(
      'total', count(*)::int,
      'pending', count(*) filter (where effective_status = 'pending')::int,
      'overdue', count(*) filter (where effective_status = 'overdue')::int,
      'completed', count(*) filter (where effective_status = 'completed')::int,
      'tasks', count(*) filter (where kind = 'task')::int,
      'checklist', count(*) filter (where kind = 'checklist')::int,
      'onTime', count(*) filter (
        where effective_status = 'completed'
          and completed_at is not null
          and scheduled_at is not null
          and completed_at <= scheduled_at
      )::int
    ),
    'employees', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'employee_id', employee_id,
          'employee_name', employee_name,
          'employee_email', employee_email,
          'total_work', total_work,
          'pending_work', pending_work,
          'overdue_work', overdue_work,
          'completed_work', completed_work,
          'tasks_work', tasks_work,
          'checklist_work', checklist_work,
          'on_time_work', on_time_work,
          'on_time_percent', case when completed_work = 0 then 0 else round(100.0 * on_time_work / completed_work)::int end
        ) order by employee_name, employee_id
      )
      from employee_rows
    ), '[]'::jsonb)
  )
  from filtered;
$$;

revoke all on function public.get_work_report(text, text, date, date, text, text, uuid) from public, anon;
grant execute on function public.get_work_report(text, text, date, date, text, text, uuid) to authenticated;

-- These partial indexes match the hot open-work status/date paths. Existing
-- general-purpose indexes remain useful for completed history and joins.
create index if not exists tasks_open_eta_id_idx
  on public.tasks(eta, id)
  where completed_at is null and status not in ('closed', 'not_required');

create index if not exists checklist_items_open_due_at_id_idx
  on public.checklist_items(due_at, id)
  where completed_at is null and status not in ('completed', 'deactivated');

-- Turn stable authorization functions into initplans in the hottest read policies.
drop policy if exists "employees read" on public.employees;
create policy "employees read" on public.employees
  for select to authenticated
  using ((select public.is_manager()) or auth_user_id = (select auth.uid()));

drop policy if exists "tasks read" on public.tasks;
create policy "tasks read" on public.tasks
  for select to authenticated
  using (
    (select public.is_manager())
    or assignee_id = (select id from public.employees where auth_user_id = (select auth.uid()))
    or follower_ea_id = (select id from public.employees where auth_user_id = (select auth.uid()))
  );

drop policy if exists "checklist items read" on public.checklist_items;
create policy "checklist items read" on public.checklist_items
  for select to authenticated
  using (
    (select public.is_manager())
    or employee_id = (select id from public.employees where auth_user_id = (select auth.uid()))
  );
