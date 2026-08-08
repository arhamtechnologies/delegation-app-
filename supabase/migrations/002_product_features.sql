alter table public.tasks add column if not exists category text not null default 'General';
alter table public.tasks add column if not exists start_date timestamptz;
alter table public.tasks add column if not exists instructions text;
alter table public.tasks add column if not exists completion_notes text;
alter table public.tasks add column if not exists attachments jsonb not null default '[]'::jsonb;

create table if not exists public.notifications(
  id uuid primary key default gen_random_uuid(),
  recipient_employee_id uuid not null references public.employees(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete cascade,
  kind text not null,
  title text not null,
  body text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.notifications enable row level security;

drop policy if exists "notifications read" on public.notifications;
create policy "notifications read" on public.notifications for select to authenticated using(
  recipient_employee_id=(select id from public.employees where auth_user_id=auth.uid()) or public.is_manager()
);

drop policy if exists "notifications update" on public.notifications;
create policy "notifications update" on public.notifications for update to authenticated using(
  recipient_employee_id=(select id from public.employees where auth_user_id=auth.uid()) or public.is_manager()
)
with check(
  recipient_employee_id=(select id from public.employees where auth_user_id=auth.uid()) or public.is_manager()
);

create index if not exists notifications_recipient_created_idx on public.notifications(recipient_employee_id, created_at desc);

create or replace function public.create_task_assignment_notification() returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into public.notifications(recipient_employee_id, task_id, kind, title, body)
  values (new.assignee_id, new.id, 'assignment', 'New task assigned', new.title);
  return new;
end;
$$;

revoke execute on function public.create_task_assignment_notification() from public, anon, authenticated, service_role;

drop trigger if exists task_assignment_notification on public.tasks;
create trigger task_assignment_notification after insert on public.tasks for each row execute function public.create_task_assignment_notification();

create or replace function public.create_task_update_notification() returns trigger language plpgsql security definer set search_path='' as $$
declare
  task_title text;
  recipient_id uuid;
begin
  select title, assignee_id into task_title, recipient_id from public.tasks where id=new.task_id;
  if recipient_id is not null and recipient_id <> (select id from public.employees where auth_user_id=new.author_user_id) then
    insert into public.notifications(recipient_employee_id, task_id, kind, title, body)
    values (recipient_id, new.task_id, 'update', 'Task update received', coalesce(new.remark, task_title));
  end if;
  return new;
end;
$$;

revoke execute on function public.create_task_update_notification() from public, anon, authenticated, service_role;

drop trigger if exists task_update_notification on public.task_updates;
create trigger task_update_notification after insert on public.task_updates for each row execute function public.create_task_update_notification();

revoke update on table public.notifications from anon, authenticated;
grant update (read_at) on table public.notifications to authenticated;
