-- WhatsApp task alerts: the EA hears when a director assigns a task, 5 minutes before its ETA,
-- 5 minutes after and 15 minutes after (the last one also to that director). Anekant Jain gets a
-- summary at 6 PM. Supabase pg_cron calls /api/whatsapp/alerts every minute to send them.

-- Several director numbers share one login, so created_by alone can't say who assigned a task.
alter table public.tasks
  add column if not exists assigned_by_name text,
  add column if not exists assigned_by_chat_id text;

-- Who receives the 6 PM summary.
alter table public.wa_chat_links add column if not exists daily_summary boolean not null default false;

-- The Administrator account's own number is Ankit Jain's: name it so his tasks and alerts say so.
insert into public.wa_chat_links(chat_id, employee_id, display_name)
select whatsapp_chat_id, id, 'Ankit Jain'
from public.employees
where role = 'super_admin' and whatsapp_chat_id = '919770207789@c.us'
on conflict (chat_id) do update set display_name = excluded.display_name;

update public.wa_chat_links set daily_summary = true where chat_id = '919575011337@c.us';

-- One row per alert sent; inserting first is how a run claims an alert, so none goes out twice.
-- anchor is the ETA for reminders (a revised ETA earns fresh ones) and created_at for the assignment notice.
create table if not exists public.wa_task_alerts(
  task_id uuid not null references public.tasks(id) on delete cascade,
  stage text not null check (stage in ('assigned', 'due_soon', 'overdue', 'escalated')),
  anchor timestamptz not null,
  sent_at timestamptz not null default now(),
  primary key (task_id, stage, anchor)
);
alter table public.wa_task_alerts enable row level security;

create table if not exists public.wa_daily_summaries(
  summary_date date not null,
  chat_id text not null,
  sent_at timestamptz not null default now(),
  primary key (summary_date, chat_id)
);
alter table public.wa_daily_summaries enable row level security;

-- The scheduler's bearer token lives only in Vault; the app checks it through this function.
create extension if not exists pg_net;
create extension if not exists pg_cron;

select vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'wa_alerts_secret', 'Bearer token pg_cron sends to /api/whatsapp/alerts')
where not exists (select 1 from vault.secrets where name = 'wa_alerts_secret');

create or replace function public.wa_alerts_token_valid(p_token text)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select exists(select 1 from vault.decrypted_secrets where name = 'wa_alerts_secret' and decrypted_secret = p_token);
$$;
revoke all on function public.wa_alerts_token_valid(text) from public, anon, authenticated;
grant execute on function public.wa_alerts_token_valid(text) to service_role;

-- Every minute. Re-running this file replaces the job of the same name.
select cron.schedule('wa-task-alerts', '* * * * *', $job$
  select net.http_post(
    url := 'https://task.arham.app/api/whatsapp/alerts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'wa_alerts_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 25000
  );
$job$);

-- Priyanka Shrivastava (EA) receives the alerts on this number.
update public.employees set whatsapp_chat_id = '919575033396@c.us'
where role = 'ea' and name = 'Priyanka Shrivastava';
