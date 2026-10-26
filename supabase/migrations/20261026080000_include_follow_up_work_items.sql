-- Keep eligible Sunday/holiday checklist occurrences visible to the unified
-- work list. They remain stored as deactivated so ordinary non-working-day
-- occurrences stay excluded, while the application can complete the carried
-- forward occurrence through its authorized completion route.
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
    when (t.eta at time zone 'Asia/Kolkata')::date < (now() at time zone 'Asia/Kolkata')::date then -extract(epoch from t.eta)
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
    when i.due_date < (now() at time zone 'Asia/Kolkata')::date then -extract(epoch from coalesce(i.due_at, i.due_date::timestamp at time zone 'Asia/Kolkata'))
    else extract(epoch from coalesce(i.due_at, i.due_date::timestamp at time zone 'Asia/Kolkata'))
  end as sort_key
from public.checklist_items i
left join public.employees e on e.id = i.employee_id
left join public.checklist_templates template on template.id = i.template_id
left join public.national_holidays holiday
  on holiday.holiday_date = i.due_date
 and holiday.country = 'India'
 and holiday.is_active = true
where i.status <> 'deactivated'
   or (
     i.status = 'deactivated'
     and template.frequency in ('weekly', 'every_15_days', 'monthly')
     and (extract(dow from i.due_date) = 0 or holiday.id is not null)
   );

revoke all on public.work_items from anon;
grant select on public.work_items to authenticated;
