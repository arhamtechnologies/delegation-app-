-- The Follow-up page used to download every task and checklist item and filter in the
-- browser. This read model returns only work originally scheduled on a Sunday or an
-- active Indian holiday, matching lib/follow-up-tasks.mjs isFollowUpEligible:
--   * tasks: their ETA date in Asia/Kolkata;
--   * checklist items: their due_date, weekly / every_15_days / monthly templates only,
--     INCLUDING items generated as 'deactivated' on that non-working day (those are the
--     follow-ups). work_items deliberately hides deactivated rows, so this is a separate view.
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
  null::text as checklist_frequency
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
  template.frequency as checklist_frequency
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

create index if not exists national_holidays_active_date_idx
  on public.national_holidays(holiday_date)
  where country = 'India' and is_active;
