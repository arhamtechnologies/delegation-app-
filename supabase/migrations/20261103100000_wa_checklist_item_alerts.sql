-- ETA alerts for generated checklist items. The EA gets the 5-minute-before and
-- 5-minute-overdue messages; the assigning director gets the 15-minute escalation.
create table if not exists public.wa_checklist_item_alerts(
  checklist_item_id uuid not null references public.checklist_items(id) on delete cascade,
  stage text not null check (stage in ('due_soon', 'overdue', 'escalated')),
  anchor timestamptz not null,
  sent_at timestamptz not null default now(),
  primary key (checklist_item_id, stage, anchor)
);
alter table public.wa_checklist_item_alerts enable row level security;
