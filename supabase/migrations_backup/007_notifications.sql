-- Extend the existing notification system with entity metadata and idempotency.
alter table public.notifications
  add column if not exists actor_employee_id uuid references public.employees(id) on delete set null,
  add column if not exists entity_type text,
  add column if not exists entity_id uuid,
  add column if not exists dedupe_key text;

update public.notifications
set entity_type = 'task',
    entity_id = task_id
where task_id is not null
  and (entity_type is null or entity_id is null);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'notifications_dedupe_key_unique'
      and conrelid = 'public.notifications'::regclass
  ) then
    alter table public.notifications
      add constraint notifications_dedupe_key_unique unique (dedupe_key);
  end if;
end;
$$;

create index if not exists notifications_recipient_unread_idx
  on public.notifications(recipient_employee_id, read_at, created_at desc);

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'notifications'
    ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
exception when others then
  raise warning 'Notifications realtime publication could not be updated: %', sqlerrm;
end;
$$;

-- Notification rows are created only by trusted database triggers. Clients can
-- read their own rows and update read_at, but cannot insert or delete rows.
revoke insert, delete on public.notifications from anon, authenticated;
grant select on public.notifications to authenticated;
revoke update on public.notifications from anon, authenticated;
grant update (read_at) on public.notifications to authenticated;

create or replace function public.insert_notification_event(
  p_recipient_employee_id uuid,
  p_actor_employee_id uuid,
  p_kind text,
  p_title text,
  p_body text,
  p_entity_type text,
  p_entity_id uuid,
  p_task_id uuid,
  p_dedupe_key text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_recipient_employee_id is null then
    return;
  end if;

  insert into public.notifications(
    recipient_employee_id,
    actor_employee_id,
    kind,
    title,
    body,
    entity_type,
    entity_id,
    task_id,
    dedupe_key
  )
  values (
    p_recipient_employee_id,
    p_actor_employee_id,
    p_kind,
    p_title,
    p_body,
    p_entity_type,
    p_entity_id,
    p_task_id,
    p_dedupe_key
  )
  on conflict do nothing;
exception when others then
  -- Notification delivery must never roll back the business event.
  raise warning 'Notification insert failed: %', sqlerrm;
end;
$$;

revoke all on function public.insert_notification_event(uuid, uuid, text, text, text, text, uuid, uuid, text)
  from public, anon, authenticated, service_role;

create or replace function public.notify_task_events()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_employee_id uuid;
  creator_employee_id uuid;
  recipient_id uuid;
begin
  select id into actor_employee_id
  from public.employees
  where auth_user_id = auth.uid()
  limit 1;

  if tg_op = 'INSERT' then
    perform public.insert_notification_event(
      new.assignee_id,
      actor_employee_id,
      'task_created',
      'New task assigned',
      format('You have been assigned a new task: %s', new.title),
      'task',
      new.id,
      new.id,
      format('task_created:%s:%s', new.id, new.assignee_id)
    );
  else
    if old.assignee_id is distinct from new.assignee_id then
      perform public.insert_notification_event(
        old.assignee_id,
        actor_employee_id,
        'task_updated',
        'Task assignment changed',
        format('Task ''%s'' is no longer assigned to you.', old.title),
        'task',
        new.id,
        new.id,
        format('task_assignment_removed:%s:%s:%s', new.id, old.assignee_id, md5(coalesce(new.updated_at::text, now()::text)))
      );
      perform public.insert_notification_event(
        new.assignee_id,
        actor_employee_id,
        'task_created',
        'New task assigned',
        format('You have been assigned a new task: %s', new.title),
        'task',
        new.id,
        new.id,
        format('task_assignment_added:%s:%s:%s', new.id, new.assignee_id, md5(coalesce(new.updated_at::text, now()::text)))
      );
    elsif not (old.completed_at is null and new.completed_at is not null)
      and (old.title is distinct from new.title
      or old.description is distinct from new.description
      or old.priority is distinct from new.priority
      or old.eta is distinct from new.eta
      or old.category is distinct from new.category
      or old.status is distinct from new.status) then
      perform public.insert_notification_event(
        new.assignee_id,
        actor_employee_id,
        'task_updated',
        'Task updated',
        format('Task ''%s'' was updated.', new.title),
        'task',
        new.id,
        new.id,
        format('task_updated:%s:%s:%s', new.id, new.assignee_id, md5(concat_ws('|', new.title, new.description, new.priority, new.eta, new.category, new.status)))
      );
    end if;

    if old.completed_at is null and new.completed_at is not null then
      select id into creator_employee_id
      from public.employees
      where auth_user_id = new.created_by
      limit 1;

      for recipient_id in
        select distinct candidate.employee_id
        from unnest(array[new.follower_ea_id, creator_employee_id]) as candidate(employee_id)
        where candidate.employee_id is not null
          and candidate.employee_id is distinct from actor_employee_id
      loop
        perform public.insert_notification_event(
          recipient_id,
          actor_employee_id,
          'task_completed',
          'Task completed',
          format('Task ''%s'' was completed.', new.title),
          'task',
          new.id,
          new.id,
          format('task_completed:%s:%s:%s', new.id, recipient_id, coalesce(new.completed_at::text, now()::text))
        );
      end loop;
    end if;
  end if;

  return new;
exception when others then
  raise warning 'Task notification trigger failed: %', sqlerrm;
  return new;
end;
$$;

revoke all on function public.notify_task_events() from public, anon, authenticated, service_role;

drop trigger if exists task_assignment_notification on public.tasks;
drop trigger if exists task_notification_events on public.tasks;
create trigger task_notification_events
after insert or update on public.tasks
for each row execute function public.notify_task_events();

create or replace function public.notify_task_update_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  task_record record;
  actor_employee_id uuid;
begin
  select id, title, assignee_id into task_record
  from public.tasks
  where id = new.task_id;

  select id into actor_employee_id
  from public.employees
  where auth_user_id = new.author_user_id
  limit 1;

  if task_record.assignee_id is not null and task_record.assignee_id is distinct from actor_employee_id then
    perform public.insert_notification_event(
      task_record.assignee_id,
      actor_employee_id,
      'task_updated',
      'Task updated',
      coalesce(new.remark, format('Task ''%s'' received a new update.', task_record.title)),
      'task',
      new.task_id,
      new.task_id,
      format('task_update:%s:%s', new.id, task_record.assignee_id)
    );
  end if;

  return new;
exception when others then
  raise warning 'Task update notification trigger failed: %', sqlerrm;
  return new;
end;
$$;

revoke all on function public.notify_task_update_event() from public, anon, authenticated, service_role;

drop trigger if exists task_update_notification on public.task_updates;
create trigger task_update_notification
after insert on public.task_updates
for each row execute function public.notify_task_update_event();

create or replace function public.notify_checklist_template_events()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_employee_id uuid;
begin
  select id into actor_employee_id
  from public.employees
  where auth_user_id = auth.uid()
  limit 1;

  if tg_op = 'INSERT' then
    if new.active then
      perform public.insert_notification_event(
        new.employee_id,
        actor_employee_id,
        'checklist_created',
        'New checklist task',
        format('A new checklist task has been added: %s', new.task),
        'checklist_template',
        new.id,
        null,
        format('checklist_template_created:%s:%s', new.id, new.employee_id)
      );
    end if;
  elsif old.active and not new.active then
    perform public.insert_notification_event(
      old.employee_id,
      actor_employee_id,
      'checklist_deactivated',
      'Checklist task deactivated',
      format('Checklist task ''%s'' has been deactivated.', old.task),
      'checklist_template',
      new.id,
      null,
      format('checklist_deactivated:%s:%s:%s', new.id, old.employee_id, md5(coalesce(new.updated_at::text, now()::text)))
    );
  elsif old.employee_id is distinct from new.employee_id then
    perform public.insert_notification_event(
      old.employee_id,
      actor_employee_id,
      'checklist_updated',
      'Checklist task updated',
      format('Checklist task ''%s'' is no longer assigned to you.', old.task),
      'checklist_template',
      new.id,
      null,
      format('checklist_assignment_removed:%s:%s:%s', new.id, old.employee_id, md5(coalesce(new.updated_at::text, now()::text)))
    );
    if new.active then
      perform public.insert_notification_event(
        new.employee_id,
        actor_employee_id,
        'checklist_created',
        'New checklist task',
        format('A new checklist task has been assigned to you: %s', new.task),
        'checklist_template',
        new.id,
        null,
        format('checklist_assignment_added:%s:%s:%s', new.id, new.employee_id, md5(coalesce(new.updated_at::text, now()::text)))
      );
    end if;
  elsif old.task is distinct from new.task
    or old.frequency is distinct from new.frequency
    or old.weekday is distinct from new.weekday
    or old.day_of_month is distinct from new.day_of_month
    or old.monthly_days is distinct from new.monthly_days
    or old.start_date is distinct from new.start_date
    or old.due_time is distinct from new.due_time
    or old.active is distinct from new.active then
    perform public.insert_notification_event(
      new.employee_id,
      actor_employee_id,
      'checklist_updated',
      'Checklist task updated',
      format('Checklist task ''%s'' was updated.', new.task),
      'checklist_template',
      new.id,
      null,
      format('checklist_updated:%s:%s:%s', new.id, new.employee_id, md5(concat_ws('|', new.task, new.frequency, new.weekday, new.day_of_month, new.monthly_days::text, new.start_date, new.due_time, new.active)))
    );
  end if;

  return new;
exception when others then
  raise warning 'Checklist template notification trigger failed: %', sqlerrm;
  return new;
end;
$$;

revoke all on function public.notify_checklist_template_events() from public, anon, authenticated, service_role;

drop trigger if exists checklist_template_notification_events on public.checklist_templates;
-- Template notifications are emitted by the authenticated server routes so
-- bulk import/edit operations can be grouped per employee.

create or replace function public.notify_checklist_item_events()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_employee_id uuid;
  responsible_employee_id uuid;
  recipient_id uuid;
begin
  if tg_op = 'INSERT' then
    perform public.insert_notification_event(
      new.employee_id,
      null,
      'checklist_created',
      'New checklist task',
      format('A new checklist task has been added: %s', new.task),
      'checklist_item',
      new.id,
      null,
      format('checklist_item_created:%s:%s', new.id, new.employee_id)
    );
  elsif old.status is distinct from new.status and new.status = 'completed' then
    select e.id into actor_employee_id
    from public.employees e
    where e.auth_user_id = new.completed_by
    limit 1;

    select e.id into responsible_employee_id
    from public.checklist_templates template
    join public.employees e on e.auth_user_id = template.created_by
    where template.id = new.template_id
    limit 1;

    if responsible_employee_id is not null then
      if responsible_employee_id is distinct from actor_employee_id then
        perform public.insert_notification_event(
          responsible_employee_id,
          actor_employee_id,
          'checklist_completed',
          'Checklist task completed',
          format('Checklist task ''%s'' was completed.', new.task),
          'checklist_item',
          new.id,
          null,
          format('checklist_completed:%s:%s:%s', new.id, responsible_employee_id, coalesce(new.completed_at::text, now()::text))
        );
      end if;
    else
      for recipient_id in
        select id from public.employees
        where active and role in ('super_admin', 'assigner', 'ea')
          and id is distinct from actor_employee_id
      loop
        perform public.insert_notification_event(
          recipient_id,
          actor_employee_id,
          'checklist_completed',
          'Checklist task completed',
          format('Checklist task ''%s'' was completed.', new.task),
          'checklist_item',
          new.id,
          null,
          format('checklist_completed:%s:%s:%s', new.id, recipient_id, coalesce(new.completed_at::text, now()::text))
        );
      end loop;
    end if;
  end if;

  return new;
exception when others then
  raise warning 'Checklist item notification trigger failed: %', sqlerrm;
  return new;
end;
$$;

revoke all on function public.notify_checklist_item_events() from public, anon, authenticated, service_role;

drop trigger if exists checklist_item_notification_events on public.checklist_items;
create trigger checklist_item_notification_events
after insert or update of status on public.checklist_items
for each row execute function public.notify_checklist_item_events();
