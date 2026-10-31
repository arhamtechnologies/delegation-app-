-- WhatsApp checklist alerts: the EA hears when a director adds a recurring checklist task, as she
-- already does for tasks. Checklist tasks have no ETA, so there are no reminders for them.

-- Several director numbers share one login, so created_by alone can't say who added it (as on tasks).
alter table public.checklist_templates
  add column if not exists assigned_by_name text,
  add column if not exists assigned_by_chat_id text;

-- One row per notice sent; inserting first is how a run claims it, so none goes out twice.
create table if not exists public.wa_checklist_alerts(
  template_id uuid primary key references public.checklist_templates(id) on delete cascade,
  sent_at timestamptz not null default now()
);
alter table public.wa_checklist_alerts enable row level security;
