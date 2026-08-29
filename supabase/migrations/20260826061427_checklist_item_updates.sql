create table if not exists public.checklist_item_updates(
  id uuid primary key default gen_random_uuid(),
  checklist_item_id uuid not null references public.checklist_items(id) on delete cascade,
  author_user_id uuid not null references auth.users(id) on delete cascade,
  update_type text not null default 'remark',
  remark text not null check (char_length(trim(remark)) between 1 and 4000),
  proof_url text,
  created_at timestamptz not null default now()
);

create index if not exists checklist_item_updates_item_created_at_idx
  on public.checklist_item_updates(checklist_item_id, created_at asc);

alter table public.checklist_item_updates enable row level security;

grant select, insert on public.checklist_item_updates to authenticated;

drop policy if exists "checklist item updates read" on public.checklist_item_updates;
create policy "checklist item updates read" on public.checklist_item_updates
  for select to authenticated
  using (
    public.is_manager()
    or exists (
      select 1
      from public.checklist_items item
      where item.id = checklist_item_updates.checklist_item_id
        and item.employee_id = (select id from public.employees where auth_user_id = auth.uid())
    )
  );

drop policy if exists "checklist item updates add" on public.checklist_item_updates;
create policy "checklist item updates add" on public.checklist_item_updates
  for insert to authenticated
  with check (
    author_user_id = auth.uid()
    and (
      public.is_manager()
      or exists (
        select 1
        from public.checklist_items item
        where item.id = checklist_item_updates.checklist_item_id
          and item.employee_id = (select id from public.employees where auth_user_id = auth.uid())
      )
    )
  );

-- Match the existing task-update notification pattern without changing the
-- regular task_updates table or its trigger.
create or replace function public.notify_checklist_item_update_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  item_record record;
  actor_employee_id uuid;
  responsible_employee_id uuid;
  recipient_id uuid;
begin
  select item.id, item.task, item.employee_id, template.created_by
    into item_record
  from public.checklist_items item
  join public.checklist_templates template on template.id = item.template_id
  where item.id = new.checklist_item_id;

  select id into actor_employee_id
  from public.employees
  where auth_user_id = new.author_user_id
  limit 1;

  select id into responsible_employee_id
  from public.employees
  where auth_user_id = item_record.created_by
  limit 1;

  for recipient_id in
    select distinct candidate.employee_id
    from unnest(array[item_record.employee_id, responsible_employee_id]) as candidate(employee_id)
    where candidate.employee_id is not null
      and candidate.employee_id is distinct from actor_employee_id
  loop
    perform public.insert_notification_event(
      recipient_id,
      actor_employee_id,
      'checklist_updated',
      'Checklist update added',
      coalesce(new.remark, format('Checklist task ''%s'' received a new update.', item_record.task)),
      'checklist_item',
      new.checklist_item_id,
      null,
      format('checklist_item_update:%s:%s', new.id, recipient_id)
    );
  end loop;

  return new;
exception when others then
  raise warning 'Checklist item update notification failed: %', sqlerrm;
  return new;
end;
$$;

revoke all on function public.notify_checklist_item_update_event() from public, anon, authenticated, service_role;

drop trigger if exists checklist_item_update_notification on public.checklist_item_updates;
create trigger checklist_item_update_notification
after insert on public.checklist_item_updates
for each row execute function public.notify_checklist_item_update_event();

;
