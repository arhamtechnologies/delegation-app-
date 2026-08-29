-- Preserve the existing single monthly day while allowing imported templates
-- to recur on multiple days in the same month.
alter table public.checklist_templates
  add column if not exists monthly_days smallint[];

update public.checklist_templates
set monthly_days = case
  when frequency = 'monthly' then array[day_of_month]::smallint[]
  else '{}'::smallint[]
end
where monthly_days is null;

alter table public.checklist_templates
  alter column monthly_days set default '{}'::smallint[],
  alter column monthly_days set not null;

alter table public.checklist_templates
  drop constraint if exists checklist_templates_schedule_fields;

alter table public.checklist_templates
  add constraint checklist_templates_schedule_fields check (
    start_date is not null
    and due_time is not null
    and (
      (frequency in ('daily', 'weekly', 'every_15_days') and monthly_days = '{}'::smallint[])
      or (
        frequency = 'monthly'
        and day_of_month is not null
        and cardinality(monthly_days) between 1 and 31
        and monthly_days <@ array[
          1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16,
          17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31
        ]::smallint[]
      )
    )
  );
