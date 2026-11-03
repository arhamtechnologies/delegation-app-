alter table public.employees add column if not exists username text;

alter table public.employees drop constraint if exists employees_username_format;
drop index if exists public.employees_username_unique;

with numbered as (
  select
    id,
    case role
      when 'super_admin' then 'sa'
      when 'assigner' then 'as'
      when 'ea' then 'ea'
      else 'do'
    end as username_prefix,
    row_number() over (
      partition by role
      order by created_at, id
    ) as name_number
  from public.employees
)
update public.employees as employees
set username = numbered.username_prefix || '-' || lpad(numbered.name_number::text, 3, '0')
from numbered
where employees.id = numbered.id;

alter table public.employees alter column username set not null;
alter table public.employees add constraint employees_username_format check (username ~ '^[a-z]{2}-[0-9]{3}$');
create unique index if not exists employees_username_unique on public.employees (lower(username));
